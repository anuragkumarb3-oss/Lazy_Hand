import 'server-only'

import { Pool } from 'pg'

const globalForDb = globalThis as typeof globalThis & { lazyHandPool?: Pool }

function getPool() {
  if (globalForDb.lazyHandPool) return globalForDb.lazyHandPool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL must be configured on the server')

  const hostname = new URL(connectionString).hostname
  const loopback = hostname === 'localhost' || hostname === '::1' || /^127\./.test(hostname)
  const disableTls = process.env.PG_SSL === 'disable'
  if (disableTls && !loopback) throw new Error('PG_SSL=disable is permitted only for a loopback database connection')

  const pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.NODE_ENV === 'production' && !disableTls
      ? {
          ...(process.env.PG_CA_CERT ? { ca: process.env.PG_CA_CERT.replace(/\\n/g, '\n') } : {}),
          rejectUnauthorized: true,
        }
      : undefined,
    application_name: 'lazyhand-next',
  })

  pool.on('error', (error) => {
    console.error('[db] Idle PostgreSQL client error', error.message)
  })
  globalForDb.lazyHandPool = pool
  return pool
}

export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const instance = getPool()
    const value = Reflect.get(instance, property, instance) as unknown
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
