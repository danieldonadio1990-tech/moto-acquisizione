#!/usr/bin/env bash
# Prova reale del bucket dei backup con le credenziali DEDICATE ai backup (non quelle dell'app).
# Scrive, legge, elenca e cancella solo oggetti di prova sotto "healthcheck/"; controlla anche che il bucket sia privato.
#   BACKUP_S3_ENDPOINT=… BACKUP_S3_ACCESS_KEY_ID=… BACKUP_S3_SECRET_ACCESS_KEY=… scripts/backup/check-bucket.sh
# Le variabili vanno impostate nella tua shell (mai in chat né nel repository).
set -euo pipefail
: "${BACKUP_S3_ENDPOINT:?mancante}" "${BACKUP_S3_ACCESS_KEY_ID:?mancante}" "${BACKUP_S3_SECRET_ACCESS_KEY:?mancante}"

if [[ -n "${S3_ACCESS_KEY_ID:-}" && "$S3_ACCESS_KEY_ID" == "$BACKUP_S3_ACCESS_KEY_ID" ]]; then
  echo "ATTENZIONE: la chiave del backup coincide con quella dell'app. Genera una coppia dedicata ai backup." >&2
  exit 1
fi

cd "$(dirname "$0")/../.."
S3_BUCKET="${BACKUP_S3_BUCKET:-backups}" \
S3_ENDPOINT="$BACKUP_S3_ENDPOINT" \
S3_REGION="${BACKUP_S3_REGION:-eu-central-1}" \
S3_FORCE_PATH_STYLE=true \
S3_PREFIX="" \
S3_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" \
S3_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
  npm run --silent check:storage
