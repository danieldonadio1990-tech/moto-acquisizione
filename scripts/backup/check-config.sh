#!/usr/bin/env bash
# Controllo della configurazione dei backup. Non stampa MAI valori di segreti: solo nomi e esiti.
#   scripts/backup/check-config.sh
# Da lanciare sul tuo computer. Richiede `gh auth login` per leggere l'elenco dei secret (solo i nomi).
set -uo pipefail

repo="${GITHUB_REPOSITORY:-danieldonadio1990-tech/moto-acquisizione}"
fail=0
ok()   { echo "✓ $1"; }
ko()   { echo "✗ $1"; fail=1; }
warn() { echo "! $1"; }

for t in age psql pg_dump pg_restore aws; do
  if command -v "$t" >/dev/null; then ok "$t installato"; else warn "$t non installato (serve per backup/ripristino in locale)"; fi
done
if command -v pg_dump >/dev/null; then
  echo "  pg_dump: $(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/versione \1/') (Neon è su PostgreSQL 18: per il ripristino serve >= 18)"
fi

if ! command -v gh >/dev/null; then
  warn "gh non installato: elenco dei secret non verificabile"
elif ! out=$(gh secret list --repo "$repo" 2>&1); then
  warn "elenco dei secret non leggibile (gh non autenticato o senza permessi): verifica a mano in Settings → Secrets"
else
  names=$(echo "$out" | awk '{print $1}')
  for s in BACKUP_DATABASE_URL BACKUP_AGE_PUBLIC_KEY BACKUP_S3_ENDPOINT BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
    if grep -qx "$s" <<<"$names"; then ok "secret $s presente"; else ko "secret $s MANCANTE"; fi
  done
fi

if [[ -n "${BACKUP_AGE_PUBLIC_KEY:-}" && "$BACKUP_AGE_PUBLIC_KEY" != age1* ]]; then
  ko "BACKUP_AGE_PUBLIC_KEY locale non inizia con age1 (è la chiave pubblica, non la privata)"
fi
exit "$fail"
