#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSFILE:?PGPASSFILE must point to a protected PostgreSQL passfile}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT must be configured}"
: "${BACKUP_DIR:?BACKUP_DIR must be configured}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$BACKUP_DIR/lazyhand-$stamp.dump.age.partial"
final="$BACKUP_DIR/lazyhand-$stamp.dump.age"
trap 'rm -f "$tmp"' EXIT
pg_dump --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$PGDATABASE" --format=custom --no-owner | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" > "$tmp"
test -s "$tmp"
mv "$tmp" "$final"
chmod 600 "$final"
find "$BACKUP_DIR" -type f -name 'lazyhand-*.dump.age' -mtime +14 -delete
trap - EXIT
