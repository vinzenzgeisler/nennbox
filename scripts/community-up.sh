#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Docker mit Compose wird benötigt.' >&2; exit 1; }
command -v node >/dev/null || { echo 'Node.js 24 wird benötigt.' >&2; exit 1; }
export COMMUNITY_POSTGRES_PORT="${COMMUNITY_POSTGRES_PORT:-5433}"
export COMMUNITY_KEYCLOAK_PORT="${COMMUNITY_KEYCLOAK_PORT:-8080}"
export COMMUNITY_SMTP_PORT="${COMMUNITY_SMTP_PORT:-1025}"
export COMMUNITY_MAILPIT_PORT="${COMMUNITY_MAILPIT_PORT:-8025}"
export COMMUNITY_API_PORT="${COMMUNITY_API_PORT:-3000}"
export COMMUNITY_APP_PORT="${COMMUNITY_APP_PORT:-5173}"
export COMMUNITY_KEYCLOAK_URL="${COMMUNITY_KEYCLOAK_URL:-http://127.0.0.1:$COMMUNITY_KEYCLOAK_PORT}"
export COMMUNITY_APP_URL="${COMMUNITY_APP_URL:-http://127.0.0.1:$COMMUNITY_APP_PORT}"
node scripts/community-config.mjs
compose=(docker compose --project-name "${COMPOSE_PROJECT_NAME:-nennbox-community}" --env-file .community-local/compose.env -f compose.community.dev.yaml)
"${compose[@]}" --profile prepare run --rm keycloak-prepare
"${compose[@]}" up -d --wait --wait-timeout 120
cleanup() {
  kill "${api_pid:-}" "${worker_pid:-}" "${app_pid:-}" "${demo_seed_pid:-}" 2>/dev/null || true
  "${compose[@]}" down >/dev/null 2>&1 || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
for attempt in {1..30}; do
  if node -e "fetch('$COMMUNITY_KEYCLOAK_URL/realms/nennbox/.well-known/openid-configuration').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
  if [[ "$attempt" == 30 ]]; then
    echo 'Keycloak-Realm wurde nicht bereit.' >&2
    "${compose[@]}" logs --tail=80 keycloak >&2
    exit 1
  fi
  sleep 2
done
npm ci
npm run build
export DATABASE_URL="postgres://nennbox:nennbox-local@127.0.0.1:$COMMUNITY_POSTGRES_PORT/nennbox"
export DEPLOYMENT_MODE=community
export COMMUNITY_ORGANIZATION_SLUG=community
export COMMUNITY_ORGANIZATION_NAME=NENNBOX
export COMMUNITY_ORGANIZATION_TIMEZONE=Europe/Berlin
export COMMUNITY_ORGANIZATION_LOCALE=de
export OIDC_PROVIDER=oidc
export OIDC_ISSUER_URL="$COMMUNITY_KEYCLOAK_URL/realms/nennbox"
export OIDC_AUDIENCE=nennbox-api
export OIDC_CLIENT_ID=nennbox-app
export OIDC_REDIRECT_URI="$COMMUNITY_APP_URL/auth/callback"
export OIDC_BOOTSTRAP_EMAIL
OIDC_BOOTSTRAP_EMAIL="$(node scripts/community-config.mjs --email)"
export CANONICAL_BASE_URL="$COMMUNITY_APP_URL"
export TEAM_INVITATION_TOKEN_KEY
TEAM_INVITATION_TOKEN_KEY="$(node scripts/community-config.mjs --invitation-key)"
export MAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT="$COMMUNITY_SMTP_PORT"
export SMTP_FROM='noreply@nennbox.local'
export STORAGE_PROVIDER=local STORAGE_LOCAL_ROOT="$PWD/.community-local/uploads"
mkdir -p "$STORAGE_LOCAL_ROOT"
node scripts/community-init.mjs
PORT="$COMMUNITY_API_PORT" node packages/api/dist/server.js & api_pid=$!
node packages/worker/dist/server.js & worker_pid=$!
NENNBOX_API_URL="http://127.0.0.1:$COMMUNITY_API_PORT" node node_modules/vite/bin/vite.js packages/app --host 127.0.0.1 --port "$COMMUNITY_APP_PORT" --strictPort & app_pid=$!
if [[ "${COMMUNITY_SEED_DEMO:-0}" == 1 ]]; then
  COMMUNITY_DEMO_SEED=I_UNDERSTAND npm run community:demo-seed & demo_seed_pid=$!
fi
echo "NENNBOX Community: $COMMUNITY_APP_URL/app"
echo "Mailpit: http://127.0.0.1:$COMMUNITY_MAILPIT_PORT"
echo "Admin-E-Mail: $OIDC_BOOTSTRAP_EMAIL"
if [[ "${COMMUNITY_PRINT_PASSWORD:-1}" == 1 ]]; then
  echo "Lokales Admin-Passwort: $(node scripts/community-config.mjs --password)"
fi
wait -n "$api_pid" "$worker_pid" "$app_pid"
