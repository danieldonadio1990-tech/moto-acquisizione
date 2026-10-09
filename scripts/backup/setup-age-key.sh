#!/usr/bin/env bash
# Genera la coppia di chiavi age dei backup SUL TUO COMPUTER.
#   scripts/backup/setup-age-key.sh [--set-secret] [file-chiave-privata]
#
# - La chiave PRIVATA viene scritta solo nel file indicato (permessi 600), non viene mai stampata né inviata da nessuna parte.
#   Senza di essa i backup non si possono aprire: tienine una copia offline (gestore di password + chiavetta).
# - Viene stampata solo la chiave PUBBLICA (age1…), che è il valore del secret GitHub BACKUP_AGE_PUBLIC_KEY.
# - Con --set-secret il secret viene impostato con `gh` (serve `gh auth login` sul tuo computer; il valore passa da stdin).
# - Rifiuta di sovrascrivere una chiave esistente.
set -euo pipefail
umask 077

set_secret=false
if [[ "${1:-}" == "--set-secret" ]]; then set_secret=true; shift; fi
key_file="${1:-${HOME}/.config/moto-acquisizione/backup-age-key.txt}"
repo="${GITHUB_REPOSITORY:-danieldonadio1990-tech/moto-acquisizione}"

command -v age-keygen >/dev/null || { echo "age non installato (brew install age / apt install age)" >&2; exit 1; }
if [[ -e "$key_file" ]]; then
  echo "Esiste già una chiave in $key_file: non la sovrascrivo. Usa un altro percorso o spostala tu." >&2
  exit 1
fi

mkdir -p "$(dirname "$key_file")"
age-keygen -o "$key_file" 2>/dev/null
chmod 600 "$key_file"
pub=$(age-keygen -y "$key_file")
[[ "$pub" == age1* ]] || { echo "Chiave pubblica inattesa: interrompo" >&2; exit 1; }

# prova di andata e ritorno: cifra con la pubblica e decifra con la privata (nessun segreto in output)
probe=$(mktemp)
trap 'rm -f "$probe" "$probe.age"' EXIT
echo "prova" > "$probe"
age -r "$pub" -o "$probe.age" "$probe"
[[ "$(age -d -i "$key_file" "$probe.age")" == "prova" ]] || { echo "La coppia di chiavi non funziona" >&2; exit 1; }

echo "Chiave privata salvata in: $key_file (permessi 600). NON è stata stampata."
echo "Chiave pubblica (BACKUP_AGE_PUBLIC_KEY):"
echo "$pub"
if $set_secret; then
  command -v gh >/dev/null || { echo "gh non installato: imposta il secret a mano" >&2; exit 1; }
  printf '%s' "$pub" | gh secret set BACKUP_AGE_PUBLIC_KEY --repo "$repo"
  echo "Secret BACKUP_AGE_PUBLIC_KEY impostato su $repo."
else
  echo "Imposta il secret: GitHub → Settings → Secrets and variables → Actions, oppure rilancia con --set-secret."
fi
echo "Ora copia $key_file in un posto sicuro OFFLINE."
