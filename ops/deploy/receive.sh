#!/usr/bin/env bash
# Installed outside the deployed release and invoked only by the restricted SSH key.
set -Eeuo pipefail
umask 077
[[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]] || { echo 'Invalid deployment command.' >&2; exit 1; }
revision=${BASH_REMATCH[1]}
base=/opt/rozephyr
env_file=$base/app/.env.vps
release=$base/releases/$revision
install -d -m 700 "$base/releases"
exec 9>"$base/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
test -f "$env_file"
(( $(df -Pk "$base" | awk 'NR==2 {print $4}') >= 2097152 )) || { echo 'Less than 2 GiB free.' >&2; exit 1; }
[[ ! -e "$release" ]] || { echo 'This revision already has a release directory.' >&2; exit 1; }
mkdir -m 700 "$release"
tar -xzf - -C "$release" --no-same-owner --no-same-permissions
test -f "$release/compose.vps.yaml"
test -f "$release/Caddyfile"
systemctl start rozephyr-backup.service
cd "$release"
docker compose -p rozephyr --env-file "$env_file" -f compose.vps.yaml build
docker compose -p rozephyr --env-file "$env_file" -f compose.vps.yaml up -d --wait --wait-timeout 180
curl --fail --silent --show-error --max-time 15 https://rozephyr.com/api/health >/dev/null
ln -sfn "$release" "$base/current"
echo "Deployment successful: $revision"
