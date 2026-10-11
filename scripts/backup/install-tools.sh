#!/usr/bin/env bash
# Installa sul runner Ubuntu il client PostgreSQL del repository ufficiale PGDG e age.
# Usato da backup.yml (backup vero) e da backup-rehearsal.yml (collaudo senza segreti): lo stesso codice in entrambi.
#   PG_MAJOR=18 scripts/backup/install-tools.sh
set -euo pipefail
: "${PG_MAJOR:?PG_MAJOR mancante (es. 18)}"

# impronta della chiave di firma del repository PGDG (https://www.postgresql.org/download/linux/ubuntu/):
# se la chiave scaricata non coincide, non si installa nulla
PGDG_KEY_FPR="B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8"
key=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc

sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o "$key" https://www.postgresql.org/media/keys/ACCC4CF8.asc
fpr=$(gpg --show-keys --with-colons "$key" | awk -F: '/^fpr/ {print $10; exit}')
if [[ "$fpr" != "$PGDG_KEY_FPR" ]]; then
  echo "Impronta della chiave PGDG inattesa: $fpr" >&2
  sudo rm -f "$key"
  exit 1
fi
echo "deb [signed-by=$key] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt-get update -q
sudo apt-get install -y -q "postgresql-client-${PG_MAJOR}" age

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "/usr/lib/postgresql/${PG_MAJOR}/bin" >> "$GITHUB_PATH"
fi
"/usr/lib/postgresql/${PG_MAJOR}/bin/pg_dump" --version
age --version
