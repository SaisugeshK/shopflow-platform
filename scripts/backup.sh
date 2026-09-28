#!/usr/bin/env bash
# Creates a compressed, restorable PostgreSQL backup (pg_dump custom format).
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... scripts/backup.sh [database] [output-dir]
set -euo pipefail
DB="${1:-shopflow}"
OUT_DIR="${2:-./backups}"
mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/${DB}-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$DB"
sha256sum "$FILE" > "$FILE.sha256" 2>/dev/null || true
echo "$FILE"
