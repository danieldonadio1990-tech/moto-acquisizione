#!/usr/bin/env bash
# Prepara gli strumenti per i backup su Windows (Git Bash): age, client PostgreSQL, GitHub CLI, Node.js, Python.
#
#   bash scripts/backup/setup-windows.sh            controlla, mostra cosa installerebbe, chiede UNA conferma, installa e verifica
#   bash scripts/backup/setup-windows.sh --check    solo controllo: non installa e non scrive nulla
#   bash scripts/backup/setup-windows.sh --yes      come sopra, senza la conferma
#
# GARANZIE
#   - installa solo software gratuito, con `winget` (incluso in Windows 10/11), che verifica l'hash dei pacchetti
#   - NON si collega a Neon, Supabase o GitHub (gh viene solo installato; `gh auth status` è un controllo locale) e non tocca
#     database, ruoli o secret
#   - il client PostgreSQL è installato con i SOLI strumenti da riga di comando (psql, pg_dump, pg_restore): niente server,
#     niente servizio Windows. Se dopo l'installazione compare comunque un servizio PostgreSQL, lo script lo segnala (non lo rimuove)
#   - l'unico file scritto è ~/.config/moto-acquisizione/tools.env (PATH dei programmi trovati), letto da bootstrap.sh
#   - nessun segreto viene stampato
set -uo pipefail

mode=install
for a in "$@"; do
  case "$a" in
    --check) mode=check ;;
    --yes) mode=yes ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Argomento sconosciuto: $a" >&2; exit 2 ;;
  esac
done

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
pg_major=$(sed -nE 's/^ *PG_MAJOR: *"([0-9]+)".*/\1/p' "$root/.github/workflows/backup.yml" | head -1)
pg_major="${pg_major:-18}"
env_dir="$HOME/.config/moto-acquisizione"
env_file="$env_dir/tools.env"

is_windows=false
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) is_windows=true ;; esac
[[ "${SETUP_FORCE_WINDOWS:-}" == 1 ]] && is_windows=true

say()  { printf '\n== %s\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; }
bad()  { printf '  ✗ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }

# --- percorsi Windows → Git Bash --------------------------------------------------------------------------------------
to_unix() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1" 2>/dev/null || printf '%s' "$1"; else printf '%s' "$1"; fi; }
local_appdata=$(to_unix "${LOCALAPPDATA:-$HOME/AppData/Local}")
program_files=$(to_unix "${ProgramFiles:-${PROGRAMFILES:-/c/Program Files}}")

# directory in cui winget/gli installer mettono i programmi (si aggiungono al PATH solo se esistono)
candidate_dirs() {
  local d
  echo "$local_appdata/Microsoft/WinGet/Links"
  for d in "$local_appdata"/Microsoft/WinGet/Packages/FiloSottile.age_*; do [[ -d "$d" ]] && { echo "$d"; find "$d" -maxdepth 2 -type d 2>/dev/null; }; done
  for d in "$program_files"/PostgreSQL/*/bin; do [[ -d "$d" ]] && echo "$d"; done
  echo "$program_files/GitHub CLI"
  echo "$program_files/nodejs"
  for d in "$local_appdata"/Programs/Python/Python3*; do [[ -d "$d" ]] && { echo "$d"; echo "$d/Scripts"; }; done
}
extend_path() { # aggiunge a PATH (per questa sessione) le directory candidate esistenti; ricorda quelle aggiunte in $added_dirs
  local d
  added_dirs=()
  while IFS= read -r d; do
    [[ -d "$d" ]] || continue
    case ":$PATH:" in *":$d:"*) ;; *) PATH="$d:$PATH"; added_dirs+=("$d") ;; esac
  done < <(candidate_dirs | awk '!seen[$0]++')
  export PATH
}

# --- rilevamento ----------------------------------------------------------------------------------------------------------
# python: python3 / python / py -3, solo se è davvero Python 3 (l'alias di Microsoft Store non lo è)
python_ok() { local v; v=$("$@" -c 'import sys; print(sys.version_info[0])' 2>/dev/null | tr -d '\r'); [[ "$v" == 3 ]]; }
find_python() {
  if python_ok python3; then echo "python3"; elif python_ok python; then echo "python"; elif python_ok py -3; then echo "py -3"; fi
}
major_of() { sed -E 's/[^0-9]*([0-9]+).*/\1/' <<<"$1"; }

if [[ -f "$env_file" ]]; then
  # shellcheck source=/dev/null
  source "$env_file"
fi
extend_path

declare -A status detail
need_install=()      # id winget (con eventuale override separato da |)
check_tool() { # check_tool etichetta comando [opzione-versione]  (imposta status/detail)
  local label="$1" cmd="$2" flag="${3:---version}" ver
  if command -v "$cmd" >/dev/null 2>&1; then
    ver=$("$cmd" "$flag" 2>&1 | head -1 | tr -d '\r')
    status[$label]=ok; detail[$label]="$ver"
  else
    status[$label]=missing; detail[$label]="non trovato"
  fi
}

detect() {
  status=(); detail=()
  check_tool age age
  check_tool age-keygen age-keygen
  for t in psql pg_dump pg_restore; do
    check_tool "$t" "$t"
    if [[ "${status[$t]}" == ok ]]; then
      local m; m=$(major_of "${detail[$t]}")
      if [[ -z "$m" ]] || (( m < pg_major )); then status[$t]=old; detail[$t]="${detail[$t]} (serve >= $pg_major)"; fi
    fi
  done
  check_tool gh gh
  check_tool node node
  check_tool npm npm
  check_tool openssl openssl version
  local py; py=$(find_python)
  if [[ -n "$py" ]]; then status[python]=ok; detail[python]="$py ($($py --version 2>&1 | tr -d '\r'))"; else status[python]=missing; detail[python]="Python 3 non trovato (l'alias di Microsoft Store non conta)"; fi
}

print_table() {
  local t
  for t in age age-keygen psql pg_dump pg_restore gh node npm python openssl; do
    case "${status[$t]}" in
      ok) ok "$t — ${detail[$t]}" ;;
      old) bad "$t — ${detail[$t]}" ;;
      *) bad "$t — ${detail[$t]}" ;;
    esac
  done
}

plan_installs() { # riempie need_install con "id|override"
  need_install=()
  [[ "${status[age]}" != ok || "${status[age-keygen]}" != ok ]] && need_install+=("FiloSottile.age|")
  if [[ "${status[psql]}" != ok || "${status[pg_dump]}" != ok || "${status[pg_restore]}" != ok ]]; then
    need_install+=("PostgreSQL.PostgreSQL.$pg_major|--mode unattended --unattendedmodeui none --disable-components server,pgAdmin,stackbuilder")
  fi
  [[ "${status[gh]}" != ok ]] && need_install+=("GitHub.cli|")
  [[ "${status[node]}" != ok || "${status[npm]}" != ok ]] && need_install+=("OpenJS.NodeJS.LTS|")
  [[ "${status[python]}" != ok ]] && need_install+=("Python.Python.3.12|")
  return 0
}

# ==========================================================================================================================
say "Strumenti per i backup (richiesto: client PostgreSQL >= $pg_major, come il workflow)"
$is_windows || warn "non sembra Windows/Git Bash: lo script esegue solo i controlli"
detect
print_table
plan_installs
sc_note=""

if ((${#need_install[@]} == 0)); then
  say "Tutto presente"
else
  say "Da installare con winget (gratuito, hash verificato dal gestore pacchetti)"
  for item in "${need_install[@]}"; do
    id="${item%%|*}"; ov="${item#*|}"
    if [[ -n "$ov" ]]; then echo "  - $id   (solo strumenti da riga di comando: $ov)"; else echo "  - $id"; fi
  done
  echo "  Nessuna modifica a database, Neon, Supabase o GitHub. Può comparire UNA richiesta di conferma di Windows (UAC)."
fi

if [[ "$mode" == check ]]; then
  say "--check: nulla è stato installato né scritto"
  ((${#need_install[@]} == 0)); exit $?
fi

if ((${#need_install[@]})); then
  $is_windows || { echo "Installazione disponibile solo su Windows (Git Bash)." >&2; exit 1; }
  command -v winget >/dev/null 2>&1 || command -v winget.exe >/dev/null 2>&1 || {
    echo "winget non trovato. È incluso in Windows 10/11 ('App Installer' dal Microsoft Store, gratuito): installalo e rilancia." >&2
    exit 1
  }
  winget_bin=$(command -v winget || command -v winget.exe)
  if [[ "$mode" != yes ]]; then
    read -rp "Installo questi pacchetti? [s/N] " answer || answer=""
    [[ "$answer" == [sS] ]] || { echo "Annullato: nulla è stato installato."; exit 1; }
  fi
  for item in "${need_install[@]}"; do
    id="${item%%|*}"; ov="${item#*|}"
    say "winget install $id"
    args=(install --id "$id" --exact --silent --accept-package-agreements --accept-source-agreements)
    [[ -n "$ov" ]] && args+=(--override "$ov")
    "$winget_bin" "${args[@]}"
    echo "  (codice di uscita di winget: $?)"
  done
  extend_path
  detect
  # un servizio PostgreSQL non dovrebbe esistere: i client sono installati senza server
  if command -v sc.exe >/dev/null 2>&1 && sc.exe query state= all 2>/dev/null | grep -qi 'SERVICE_NAME: postgresql'; then
    sc_note="Compare un servizio Windows PostgreSQL: l'installer ha installato anche il server. Non l'ho toccato; se non ti serve, disinstalla il server da 'App e funzionalità' (i client restano utilizzabili)."
  fi
fi

# --- PATH persistente per bootstrap.sh ------------------------------------------------------------------------------------
mkdir -p "$env_dir"
{
  echo "# generato da scripts/backup/setup-windows.sh: directory dei programmi trovati (letto da bootstrap.sh)"
  while IFS= read -r d; do [[ -d "$d" ]] && echo "export PATH=\"$d:\$PATH\""; done < <(candidate_dirs | awk '!seen[$0]++')
} > "$env_file"
chmod 600 "$env_file" 2>/dev/null || true

# ==========================================================================================================================
say "Verifica finale"
detect
print_table
fail=0
for t in age age-keygen psql pg_dump pg_restore gh node npm python openssl; do [[ "${status[$t]}" == ok ]] || fail=1; done

# prova di funzionamento (locale, nessuna rete): cifratura e decifratura con una coppia di chiavi temporanea
if [[ "${status[age]}" == ok && "${status[age-keygen]}" == ok ]]; then
  tmp=$(mktemp -d)
  if age-keygen -o "$tmp/k.txt" >/dev/null 2>&1 && pub=$(age-keygen -y "$tmp/k.txt" | tr -d '\r') \
     && echo "prova" > "$tmp/p.txt" && age -r "$pub" -o "$tmp/p.age" "$tmp/p.txt" \
     && [[ "$(age -d -i "$tmp/k.txt" "$tmp/p.age" | tr -d '\r')" == "prova" ]]; then
    ok "age: cifratura e decifratura di prova riuscite"
  else
    bad "age: la prova di cifratura/decifratura è fallita"; fail=1
  fi
  rm -rf "$tmp"
fi
if [[ "${status[gh]}" == ok ]]; then
  if gh auth status >/dev/null 2>&1; then ok "gh: già autenticato (controllo locale)"; else warn "gh: non autenticato (bootstrap.sh aprirà il login nel browser)"; fi
fi
[[ -n "$sc_note" ]] && warn "$sc_note"
if [[ -f "$root/scripts/backup/bootstrap.sh" ]] && grep -q $'\r' "$root/scripts/backup/bootstrap.sh"; then
  bad "bootstrap.sh ha terminatori di riga Windows (CRLF) e non funzionerà in bash: esegui  git config core.autocrlf false && git rm --cached -r -q . && git reset --hard  (dopo aver salvato eventuali modifiche locali)"; fail=1
fi

echo
if ((fail)); then
  echo "Setup NON completo: vedi i ✗ sopra. Se hai appena installato qualcosa, chiudi e riapri Git Bash e rilancia questo script."
  exit 1
fi
echo "Setup completo. PATH salvato in ${env_file/#$HOME/~} (bootstrap.sh lo usa da solo). Nessun servizio esterno è stato toccato."
echo "Prossimo passo:  bash scripts/backup/bootstrap.sh --guided --neon-auto"
