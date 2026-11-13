#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Run as root on the VPS. Never point restoration at the application database.
container=${ROZEPHYR_POSTGRES_CONTAINER:-rozephyr-postgres-1}
backup_dir=${ROZEPHYR_BACKUP_DIR:-/root/rozephyr-backups/daily}
minimum_free_kb=${ROZEPHYR_MINIMUM_FREE_KB:-1048576}
install -d -m 700 "$backup_dir"
exec 9>"$backup_dir/.backup.lock"
flock -n 9 || { echo 'Another backup is running.' >&2; exit 1; }

free_kb=$(df -Pk "$backup_dir" | awk 'NR==2 {print $4}')
[[ "$free_kb" =~ ^[0-9]+$ ]] && (( free_kb >= minimum_free_kb )) || { echo 'Insufficient free disk space for backup.' >&2; exit 1; }
[[ $(docker inspect -f '{{.State.Health.Status}}' "$container") == healthy ]] || { echo 'PostgreSQL container is not healthy.' >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
archive="$backup_dir/daily-$stamp.dump"
temporary="$backup_dir/.daily-$stamp-$$.tmp"
verify_db="rozephyr_verify_$(openssl rand -hex 8)"
created=0
cleanup(){
  rm -f -- "$temporary"
  if (( created )); then
    docker exec "$container" dropdb -U roze_admin --if-exists "$verify_db" >/dev/null || echo "Could not remove temporary verification database $verify_db" >&2
  fi
}
trap cleanup EXIT

docker exec "$container" pg_dump -U roze_admin -d rozephyr -Fc --no-owner --no-privileges > "$temporary"
[[ -s "$temporary" ]] || { echo 'Backup is empty.' >&2; exit 1; }
docker exec "$container" createdb -U roze_admin "$verify_db"
created=1
docker exec -i "$container" pg_restore -U roze_admin -d "$verify_db" --no-owner --no-privileges --exit-on-error --single-transaction < "$temporary"
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U roze_admin -d "$verify_db" -Atc 'SELECT count(*) FROM relational_schema_migrations; SELECT count(*) FROM platform_accounts; SELECT count(*) FROM courses;' >/dev/null
docker exec "$container" dropdb -U roze_admin "$verify_db"
created=0
mv -n -- "$temporary" "$archive"
[[ -f "$archive" && ! -e "$temporary" ]] || { echo 'Could not safely save backup.' >&2; exit 1; }
find "$backup_dir" -maxdepth 1 -type f -name 'daily-????????T??????Z.dump' -mtime +13 -delete
printf 'Backup created and restored successfully: %s\n' "$archive"
