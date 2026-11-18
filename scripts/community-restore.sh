#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir=${1:-backups}
project=${COMPOSE_PROJECT_NAME:-racepilot-community}
[[ -f "$backup_dir/community.dump" && -f "$backup_dir/community-local.tar.gz" ]] || { echo 'Backup benötigt community.dump und community-local.tar.gz.' >&2; exit 1; }
# Preserve the backup outside .community-local: restoring replaces the generated credentials/config.
rm -rf .community-local
tar -xzf "$backup_dir/community-local.tar.gz"
compose=(docker compose --project-name "$project" --env-file .community-local/compose.env -f compose.community.dev.yaml)
"${compose[@]}" down --volumes --remove-orphans
"${compose[@]}" --profile prepare run --rm keycloak-prepare
"${compose[@]}" up -d --wait postgres keycloak
"${compose[@]}" exec -T postgres pg_restore -U racepilot -d racepilot --clean --if-exists < "$backup_dir/community.dump"
echo 'Datenbank, Keycloak-Realm-Import und lokaler Upload-Speicher wiederhergestellt.'
echo 'Für API/Worker/App: bash scripts/community-up.sh (mit gleicher Compose-Projektkennung).'
