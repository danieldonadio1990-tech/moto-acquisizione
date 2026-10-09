#!/usr/bin/env bash
# Carica il backup cifrato nel bucket privato "backups" (S3 di Supabase) e tiene solo le ultime N copie.
# Variabili: BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY,
#            [BACKUP_S3_BUCKET=backups] [BACKUP_S3_REGION=eu-central-1] [BACKUP_KEEP=14] [BACKUP_OUT_DIR=./backup-out]
set -euo pipefail

: "${BACKUP_S3_ENDPOINT:?mancante}"
: "${BACKUP_S3_ACCESS_KEY_ID:?mancante}"
: "${BACKUP_S3_SECRET_ACCESS_KEY:?mancante}"
BUCKET="${BACKUP_S3_BUCKET:-backups}"
KEEP="${BACKUP_KEEP:-14}"
OUT_DIR="${BACKUP_OUT_DIR:-./backup-out}"
export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-eu-central-1}" AWS_EC2_METADATA_DISABLED=true
# alcuni storage S3-compatibili rifiutano i checksum aggiuntivi inviati di default dai client AWS recenti
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
s3() { aws --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"; }

name=$(cat "$OUT_DIR/LATEST")
s3 s3 cp "$OUT_DIR/$name" "s3://$BUCKET/db/$name" --only-show-errors
# verifica: l'oggetto esiste con la stessa dimensione
remote=$(s3 s3api head-object --bucket "$BUCKET" --key "db/$name" --query ContentLength --output text)
local_size=$(wc -c < "$OUT_DIR/$name")
[[ "$remote" == "$local_size" ]] || { echo "Dimensione remota $remote ≠ locale $local_size" >&2; exit 1; }
echo "Caricato: s3://$BUCKET/db/$name ($remote byte)"

# rotazione: i nomi contengono la data UTC, quindi l'ordine alfabetico è l'ordine cronologico
mapfile -t keys < <(s3 s3api list-objects-v2 --bucket "$BUCKET" --prefix "db/moto-acquisizione-" --query 'Contents[].Key' --output text | tr '\t' '\n' | sed '/^None$/d;/^$/d' | sort)
total=${#keys[@]}
if (( total > KEEP )); then
  for k in "${keys[@]:0:total-KEEP}"; do
    s3 s3api delete-object --bucket "$BUCKET" --key "$k" > /dev/null
    echo "Rotazione: eliminato $k"
  done
fi
echo "Copie conservate: $(( total > KEEP ? KEEP : total ))"
