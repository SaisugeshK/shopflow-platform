#!/usr/bin/env bash
# Backup/restore verification (release gate): back up the database, restore it into a scratch database, and compare
# row counts and money totals of the financial tables. The scratch database is dropped afterwards.
# Usage: PGHOST=... PGUSER=... PGPASSWORD=... scripts/backup-restore-test.sh [database]
set -euo pipefail
DB="${1:-shopflow}"
SCRATCH="${DB}_restore_check_$$"
DIR="$(mktemp -d)"
trap 'dropdb --if-exists "$SCRATCH" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

FILE="$("$(dirname "$0")/backup.sh" "$DB" "$DIR")"
"$(dirname "$0")/restore.sh" "$FILE" "$SCRATCH" >/dev/null

QUERY="SELECT
  (SELECT count(*) FROM invoices) || '|' || (SELECT COALESCE(sum(grand_total),0) FROM invoices) || '|' ||
  (SELECT count(*) FROM payments) || '|' || (SELECT COALESCE(sum(amount),0) FROM payments) || '|' ||
  (SELECT count(*) FROM customer_ledger_entries) || '|' || (SELECT COALESCE(sum(debit)-sum(credit),0) FROM customer_ledger_entries) || '|' ||
  (SELECT count(*) FROM stock_movements) || '|' || (SELECT count(*) FROM audit_logs) || '|' ||
  (SELECT max(version) FROM flyway_schema_history WHERE success)"
SOURCE="$(psql -tAc "$QUERY" "$DB")"
RESTORED="$(psql -tAc "$QUERY" "$SCRATCH")"
echo "source:   $SOURCE"
echo "restored: $RESTORED"
if [ "$SOURCE" != "$RESTORED" ]; then
  echo "BACKUP/RESTORE TEST FAILED" >&2
  exit 1
fi
echo "BACKUP/RESTORE TEST PASSED"
