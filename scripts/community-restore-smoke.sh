#!/usr/bin/env bash
# End-to-end proof: isolated Community stack -> seed -> backup -> destroy volumes -> restore -> verify login and upload download.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"

exec 9>/tmp/nennbox-isolated-smoke.lock
echo 'community-restore-smoke: waiting for isolated stack lock...' >&2
flock -w "${SMOKE_LOCK_TIMEOUT:-3600}" 9 || { echo 'community-restore-smoke: lock timeout' >&2; exit 75; }

[[ ! -e .community-local ]] || { echo '.community-local already exists; refusing to overwrite local community data.' >&2; exit 1; }

tag="nb-restore-$(basename "$root")-$$"
backup="${XDG_CACHE_HOME:-$HOME/.cache}/racepilot-community-restore-$tag"
logs="$root/.community-restore-logs-$tag"
mkdir -p "$backup" "$logs"
chmod 700 "$backup" "$logs"
stack_pid=''
docker_cmd=(docker)
docker info >/dev/null 2>&1 || docker_cmd=(sudo -n docker)

read -r COMMUNITY_POSTGRES_PORT COMMUNITY_KEYCLOAK_PORT COMMUNITY_SMTP_PORT COMMUNITY_MAILPIT_PORT COMMUNITY_API_PORT COMMUNITY_APP_PORT < <(python3 - <<'PY'
import socket
socks = [socket.socket() for _ in range(6)]
for sock in socks:
    sock.bind(('127.0.0.1', 0))
print(*(sock.getsockname()[1] for sock in socks))
for sock in socks:
    sock.close()
PY
)
export COMMUNITY_POSTGRES_PORT COMMUNITY_KEYCLOAK_PORT COMMUNITY_SMTP_PORT COMMUNITY_MAILPIT_PORT COMMUNITY_API_PORT COMMUNITY_APP_PORT
export COMMUNITY_KEYCLOAK_URL="http://127.0.0.1:$COMMUNITY_KEYCLOAK_PORT"
export COMMUNITY_APP_URL="http://127.0.0.1:$COMMUNITY_APP_PORT"
export COMPOSE_PROJECT_NAME="$tag"

compose=("${docker_cmd[@]}" compose --project-name "$COMPOSE_PROJECT_NAME" --env-file .community-local/compose.env -f compose.community.dev.yaml)
start_stack() {
  COMMUNITY_PRINT_PASSWORD=0 COMMUNITY_SEED_DEMO=0 bash scripts/community-up.sh >"$logs/community-up.log" 2>&1 &
  stack_pid=$!
  for attempt in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:$COMMUNITY_API_PORT/health" >/dev/null 2>&1 && curl -fsS "$COMMUNITY_APP_URL/app" >/dev/null 2>&1; then return; fi
    if ! kill -0 "$stack_pid" 2>/dev/null; then cat "$logs/community-up.log" >&2; return 1; fi
    sleep 2
  done
  cat "$logs/community-up.log" >&2
  echo 'Community stack startup timed out.' >&2
  return 1
}
stop_stack() {
  if [[ -n "$stack_pid" ]]; then
    kill -TERM "$stack_pid" 2>/dev/null || true
    wait "$stack_pid" 2>/dev/null || true
    stack_pid=''
  fi
}
cleanup() {
  stop_stack
  if [[ -f .community-local/compose.env ]]; then "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; fi
  rm -rf .community-local
  if [[ "${SMOKE_KEEP_LOGS:-0}" == 1 ]]; then echo "restore proof logs: $logs" >&2; else rm -rf "$logs"; fi
  rm -rf "$backup"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

start_stack
export DATABASE_URL="postgres://racepilot:racepilot-local@127.0.0.1:$COMMUNITY_POSTGRES_PORT/racepilot"
export DEPLOYMENT_MODE=community COMMUNITY_ORGANIZATION_SLUG=community COMMUNITY_ORGANIZATION_NAME=NENNBOX
export COMMUNITY_ORGANIZATION_TIMEZONE=Europe/Berlin COMMUNITY_ORGANIZATION_LOCALE=de
export OIDC_PROVIDER=oidc OIDC_ISSUER_URL="$COMMUNITY_KEYCLOAK_URL/realms/nennbox" OIDC_AUDIENCE=nennbox-api
export OIDC_CLIENT_ID=nennbox-app OIDC_REDIRECT_URI="$COMMUNITY_APP_URL/auth/callback"
export OIDC_BOOTSTRAP_EMAIL="$(node scripts/community-config.mjs --email)"
export CANONICAL_BASE_URL="$COMMUNITY_APP_URL"
export MAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT="$COMMUNITY_SMTP_PORT" SMTP_FROM=noreply@nennbox.local
export STORAGE_PROVIDER=local STORAGE_LOCAL_ROOT="$PWD/.community-local/uploads"
COMMUNITY_DEMO_SEED=I_UNDERSTAND npm run community:demo-seed >"$logs/demo-seed.log" 2>&1 || { cat "$logs/demo-seed.log" >&2; exit 1; }
[[ -n "$(find .community-local/uploads -type f -print -quit)" ]] || { echo 'Demo seed did not create local uploads.' >&2; exit 1; }
echo 'Seeded demo registrations and uploads.'

bash scripts/community-backup.sh "$backup"
stop_stack
# community-restore removes all containers and both project volumes before restoring files and data.
bash scripts/community-restore.sh "$backup"
start_stack

export COMMUNITY_ADMIN_PASSWORD="$(node scripts/community-config.mjs --password)"
export COMMUNITY_ADMIN_EMAIL="$(node scripts/community-config.mjs --email)"
export RACEPILOT_API_URL="http://127.0.0.1:$COMMUNITY_API_PORT"
export RACEPILOT_APP_URL="$COMMUNITY_APP_URL"
export RACEPILOT_MAILPIT_URL="http://127.0.0.1:$COMMUNITY_MAILPIT_PORT"
npx playwright test --config packages/app/playwright.config.ts

echo 'Community backup/restore proof passed: login, registration submissions, and uploaded-document download verified.'
