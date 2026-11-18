#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
backup_dir=${1:-backups}
project=${COMPOSE_PROJECT_NAME:-racepilot-community}
[[ -f .community-local/compose.env ]] || { echo 'Community-Konfiguration fehlt; zuerst community-up ausführen.' >&2; exit 1; }
compose=(docker compose --project-name "$project" --env-file .community-local/compose.env -f compose.community.dev.yaml)
mkdir -p "$backup_dir"
"${compose[@]}" up -d --wait postgres
"${compose[@]}" exec -T postgres pg_dump -U racepilot -d racepilot --format=custom > "$backup_dir/community.dump"
tar -czf "$backup_dir/community-local.tar.gz" .community-local
chmod 600 "$backup_dir/community.dump" "$backup_dir/community-local.tar.gz"
echo "Backup geschrieben: $backup_dir/community.dump und $backup_dir/community-local.tar.gz"
