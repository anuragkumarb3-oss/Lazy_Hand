import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL must be configured in the deployment environment')

const hostname = new URL(connectionString).hostname
const loopback = hostname === 'localhost' || hostname === '::1' || /^127\./.test(hostname)
const disableTls = process.env.PG_SSL === 'disable'
if (disableTls && !loopback) throw new Error('PG_SSL=disable is permitted only for a loopback database connection')

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.NODE_ENV === 'production' && !disableTls
    ? { ...(process.env.PG_CA_CERT ? { ca: process.env.PG_CA_CERT.replace(/\\n/g, '\n') } : {}), rejectUnauthorized: true }
    : undefined,
  application_name: 'lazyhand-migrations',
})

const migrationsPath = join(dirname(fileURLToPath(import.meta.url)), '../db/migrations')
const client = await pool.connect()

try {
  await client.query('SELECT pg_advisory_lock($1)', [781204221])
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)

  const files = (await readdir(migrationsPath)).filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name)).sort()
  for (const name of files) {
    const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
    if (rowCount) continue

    const sql = await readFile(join(migrationsPath, name), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name])
      await client.query('COMMIT')
      process.stdout.write(`Applied ${name}\n`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
} finally {
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [781204221])
  } finally {
    client.release()
    await pool.end()
  }
}
