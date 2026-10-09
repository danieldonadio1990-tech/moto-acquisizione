#!/usr/bin/env bash
# Ripristino di un backup in un database VUOTO (es. un nuovo branch Neon). Non tocca la produzione.
# Uso:  AGE_IDENTITY_FILE=/percorso/chiave-privata.txt ./restore.sh <file.dump.age> <URL-database-di-destinazione>
# La chiave privata resta sul tuo computer: non va mai nel repository né nei secret.
set -euo pipefail

file="${1:?uso: restore.sh <file.dump.age> <database-url>}"
target="${2:?uso: restore.sh <file.dump.age> <database-url>}"
: "${AGE_IDENTITY_FILE:?indica il file con la chiave privata age}"

n=$(psql "$target" -Atqc "select count(*) from information_schema.tables where table_schema in ('public','drizzle')")
if [[ "$n" != "0" ]]; then echo "Il database di destinazione non è vuoto ($n tabelle): uso un database/branch nuovo" >&2; exit 1; fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
age -d -i "$AGE_IDENTITY_FILE" -o "$tmp" "$file"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$tmp"
echo "Ripristino completato. Verifica i conteggi con scripts/backup/verify.sql"
