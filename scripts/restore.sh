#!/usr/bin/env bash
# Restores a backup created by backup.sh into a NEW (empty) database. Never restores over an existing database.
# Usage: PGHOST=... PGUSER=... PGPASSWORD=... scripts/restore.sh <dump-file> <target-database>
set -euo pipefail
FILE="$1"
TARGET="$2"
if psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'" postgres | grep -q 1; then
  echo "Refusing to restore: database '$TARGET' already exists" >&2
  exit 1
fi
createdb "$TARGET"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$FILE"
echo "Restored $FILE into $TARGET"
