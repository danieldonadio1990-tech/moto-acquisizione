#!/usr/bin/env bash
# Ripristino di un backup in un database VUOTO (es. un nuovo branch Neon). Non tocca la produzione.
# Uso:  AGE_IDENTITY_FILE=/percorso/chiave-privata.txt ./restore.sh <file.dump.age> <URL-database-di-destinazione>
# La chiave privata resta sul tuo computer: non va mai nel repository né nei secret.
set -euo pipefail

file="${1:?uso: restore.sh <file.dump.age> <database-url>}"
target="${2:?uso: restore.sh <file.dump.age> <database-url>}"
: "${AGE_IDENTITY_FILE:?indica il file con la chiave privata age}"

# pg_restore non legge dump creati da un pg_dump più recente: serve un client >= del server di destinazione
# (e quindi >= del server da cui è stato fatto il backup, se le versioni coincidono)
server_num=$(psql "$target" -Atqc "show server_version_num")
server_major=$((server_num / 10000))
client_major=$(pg_restore --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
echo "Server di destinazione: PostgreSQL $server_major — client pg_restore: $client_major"
if (( client_major < server_major )); then
  echo "pg_restore $client_major è più vecchio del server $server_major: installa postgresql-client-$server_major" >&2
  exit 1
fi

n=$(psql "$target" -Atqc "select count(*) from information_schema.tables where table_schema in ('public','drizzle')")
if [[ "$n" != "0" ]]; then echo "Il database di destinazione non è vuoto ($n tabelle): uso un database/branch nuovo" >&2; exit 1; fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
age -d -i "$AGE_IDENTITY_FILE" -o "$tmp" "$file"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$tmp"
echo "Ripristino completato. Verifica i conteggi con scripts/backup/verify.sql"
