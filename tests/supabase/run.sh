#!/usr/bin/env bash
# Applies the Supabase migration chain to a throwaway local Postgres and checks
# the security rules. Run it before you push a migration to main, because a
# broken migration blocks every later migration on the production project.
#
#   bash tests/supabase/run.sh
#
# It needs the PostgreSQL server binaries. On Debian or Ubuntu:
#   sudo apt-get install -y postgresql
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA_DIR="$(mktemp -d /tmp/musi-pgdata.XXXXXX)"
PGSOCK_DIR="$(mktemp -d /tmp/musi-pgsock.XXXXXX)"
PGPORT="${PGPORT:-55432}"

if [ ! -x "$PGBIN/initdb" ]; then
  if command -v initdb >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v initdb)")"
  else
    echo "PostgreSQL server binaries not found. Set PGBIN or install postgresql." >&2
    exit 127
  fi
fi

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA_DIR" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA_DIR" "$PGSOCK_DIR"
}
trap cleanup EXIT

echo "Start a temporary PostgreSQL server on port $PGPORT."
"$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA_DIR" \
  -o "-p $PGPORT -k $PGSOCK_DIR -c listen_addresses=''" \
  -l "$PGDATA_DIR/server.log" start >/dev/null
sleep 2

psql() { "$PGBIN/psql" -h "$PGSOCK_DIR" -p "$PGPORT" -U postgres "$@"; }

psql -q -c "create database verify;"
echo "Create stand-ins for the Supabase platform objects."
psql -d verify -q -v ON_ERROR_STOP=1 -f "$REPO_ROOT/tests/supabase/scaffold.sql"

echo
echo "Apply the migration chain."
failed=0
for file in "$REPO_ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$file")"
  printf '  %-46s ' "$name"
  if psql -d verify -q -v ON_ERROR_STOP=1 -f "$file" >/tmp/musi-migration.log 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    sed 's/^/      /' /tmp/musi-migration.log | tail -6
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo
  echo "A migration failed. Fix it before you push, or the production deploy stops here."
  exit 1
fi

echo
echo "Check the security rules."
psql -d verify -q -f "$REPO_ROOT/tests/supabase/security.sql" 2>&1 \
  | grep -vE '^\s*$|^SET$|^INSERT|^RESET|^DO$|^COMMIT$|^BEGIN$' \
  | sed "s|psql:$REPO_ROOT/tests/supabase/security.sql:[0-9]*: ||" \
  | tee /tmp/musi-security.log

if grep -q "FAIL" /tmp/musi-security.log; then
  echo
  echo "A security check failed."
  exit 1
fi

echo
echo "All migrations applied and all security checks passed."
