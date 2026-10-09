#!/usr/bin/env bash
# Backup del database PostgreSQL: pg_dump → cifratura con age (chiave PUBBLICA).
# Le FOTO NON sono incluse (stanno nel bucket "photos"). La chiave privata non è mai qui.
#
# Variabili: BACKUP_DATABASE_URL, BACKUP_AGE_PUBLIC_KEY, [BACKUP_OUT_DIR=./backup-out]
# Output: $BACKUP_OUT_DIR/moto-acquisizione-<UTC>.dump.age  e  $BACKUP_OUT_DIR/LATEST (nome del file)
set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL mancante}"
: "${BACKUP_AGE_PUBLIC_KEY:?BACKUP_AGE_PUBLIC_KEY mancante}"
OUT_DIR="${BACKUP_OUT_DIR:-./backup-out}"
[[ "$BACKUP_AGE_PUBLIC_KEY" == age1* ]] || { echo "BACKUP_AGE_PUBLIC_KEY deve iniziare con age1 (è la chiave PUBBLICA)" >&2; exit 1; }

# pg_dump deve avere versione >= del server, altrimenti rifiuta (o produce dump incompleti)
server_num=$(psql "$BACKUP_DATABASE_URL" -Atqc "show server_version_num")
client_major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
server_major=$((server_num / 10000))
echo "Server PostgreSQL: $server_major — client pg_dump: $client_major"
if (( client_major < server_major )); then
  echo "pg_dump $client_major è più vecchio del server $server_major: installa postgresql-client-$server_major" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="moto-acquisizione-${stamp}.dump.age"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# formato custom (-Fc: già compresso, ripristinabile con pg_restore); niente owner/ACL (i ruoli cambiano tra progetti)
pg_dump --format=custom --compress=9 --no-owner --no-privileges "$BACKUP_DATABASE_URL" --file="$tmp"
# controllo di integrità: il dump deve essere leggibile e contenere le tabelle del progetto
pg_restore --list "$tmp" > "$tmp.list"
grep -q "TABLE public leads" "$tmp.list" || { echo "Il dump non contiene la tabella leads: backup scartato" >&2; rm -f "$tmp.list"; exit 1; }
rm -f "$tmp.list"

age -r "$BACKUP_AGE_PUBLIC_KEY" -o "$OUT_DIR/$name" "$tmp"
echo "$name" > "$OUT_DIR/LATEST"
echo "Backup cifrato creato: $OUT_DIR/$name ($(wc -c < "$OUT_DIR/$name") byte)"
