#!/usr/bin/env bash
# Prepara gli strumenti per i backup su Windows (Git Bash): age, client PostgreSQL, GitHub CLI, Node.js, Python.
#
#   bash scripts/backup/setup-windows.sh            controlla, mostra cosa installerebbe, chiede UNA conferma, installa e verifica
#   bash scripts/backup/setup-windows.sh --check    solo controllo: non installa e non scrive nulla
#   bash scripts/backup/setup-windows.sh --yes      come sopra, senza la conferma
#   bash scripts/backup/setup-windows.sh --pg-installer FILE.exe   usa un installer PostgreSQL scaricato a mano (eseguito solo se l'hash coincide)
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
pg_installer_arg=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  a="${args[i]}"
  case "$a" in
    --check) mode=check ;;
    --yes) mode=yes ;;
    --pg-installer) i=$((i + 1)); pg_installer_arg="${args[i]:-}"; [[ -n "$pg_installer_arg" ]] || { echo "--pg-installer richiede il percorso del file" >&2; exit 2; } ;;
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# opzioni dell'installer EDB (BitRock) per i SOLI strumenti da riga di comando: il manifest ufficiale winget ha Scope=machine e
# switch silenziosi "--mode unattended --unattendedmodeui none"; qui si aggiunge la disattivazione di server, pgAdmin e StackBuilder
pg_override_base="--mode unattended --unattendedmodeui none --disable-components server,pgAdmin,stackbuilder"
log_dir="$env_dir/logs"

plan_installs() { # riempie need_install con "id|override"
  need_install=()
  [[ "${status[age]}" != ok || "${status[age-keygen]}" != ok ]] && need_install+=("FiloSottile.age|")
  if [[ "${status[psql]}" != ok || "${status[pg_dump]}" != ok || "${status[pg_restore]}" != ok ]]; then
    need_install+=("PostgreSQL.PostgreSQL.$pg_major|$pg_override_base")
  fi
  [[ "${status[gh]}" != ok ]] && need_install+=("GitHub.cli|")
  [[ "${status[node]}" != ok || "${status[npm]}" != ok ]] && need_install+=("OpenJS.NodeJS.LTS|")
  [[ "${status[python]}" != ok ]] && need_install+=("Python.Python.3.12|")
  return 0
}

# --- installazione ------------------------------------------------------------------------------------------------------
last_hex=""
last_log=""
is_admin() { net session >/dev/null 2>&1; }
winget_installed() { "$winget_bin" list --id "$1" --exact --accept-source-agreements 2>/dev/null | tr -d '\r' | grep -q -F "$1"; }
redact() { sed -E 's/--superpassword [0-9a-fA-F]+/--superpassword <omesso>/g'; }

winget_install() { # winget_install ID [override]  → 0 solo se winget riporta successo; salva log e codice reale (HRESULT) in last_hex
  local id="$1" ov="${2:-}" cmd rc
  mkdir -p "$log_dir"
  last_log="$log_dir/winget-$id-$(date +%Y%m%d%H%M%S).log"
  if command -v powershell.exe >/dev/null 2>&1; then
    # via PowerShell per leggere il codice di uscita COMPLETO: Git Bash lo riduce a 8 bit (un HRESULT 0x8A150004 apparirebbe come 4)
    cmd="& winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements"
    [[ -n "$ov" ]] && cmd+=" --override '$ov'"
    cmd+="; Write-Host ('WINGET_EXIT=0x{0:X8}' -f \$LASTEXITCODE)"
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$cmd" 2>&1 | tr -d '\r' > "$last_log"
    last_hex=$(sed -n 's/.*WINGET_EXIT=\(0x[0-9A-Fa-f]*\).*/\1/p' "$last_log" | tail -1)
  else
    local args=(install --id "$id" --exact --silent --accept-package-agreements --accept-source-agreements)
    [[ -n "$ov" ]] && args+=(--override "$ov")
    "$winget_bin" "${args[@]}" 2>&1 | tr -d '\r' > "$last_log"
    rc=${PIPESTATUS[0]}
    last_hex=$(printf '0x%08X' "$rc")
  fi
  redact < "$last_log" | tail -n 12 | sed 's/^/    /'
  [[ "${last_hex,,}" == 0x00000000 ]]
}

diagnose_winget() { # stampa che cosa è successo, senza segreti
  warn "winget non è riuscito per $1: codice reale ${last_hex:-sconosciuto} (Git Bash mostrerebbe solo l'ultimo byte: $(( ${last_hex:-0} & 255 )))"
  warn "log completo: ${last_log/#$HOME/~}   — tabella dei codici: https://learn.microsoft.com/windows/package-manager/winget/returnCodes"
  if is_admin; then warn "terminale con privilegi di amministratore: sì"; else warn "terminale con privilegi di amministratore: no (il manifest ufficiale di PostgreSQL ha Scope=machine: serve la conferma UAC; se non compare o viene negata l'installazione fallisce. Puoi riprovare aprendo Git Bash con 'Esegui come amministratore')"; fi
}

pg_tools_present() { # tutti e tre i comandi, versione >= pg_major
  local t m
  for t in psql pg_dump pg_restore; do
    command -v "$t" >/dev/null 2>&1 || return 1
    m=$(major_of "$("$t" --version 2>&1 | head -1 | tr -d '\r')")
    [[ -n "$m" ]] && (( m >= pg_major )) || return 1
  done
}

pg_direct_install() { # installer ufficiale scaricato direttamente, ESEGUITO SOLO se l'SHA256 coincide con quello del manifest winget
  local ov="$1" local_file="${2:-}" keep=0 info url sha dl exe got winexe out code
  if ! command -v powershell.exe >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1 || ! command -v sha256sum >/dev/null 2>&1; then
    bad "metodo alternativo non disponibile (servono powershell, curl e sha256sum)"; return 1
  fi
  info=$("$winget_bin" show --id "PostgreSQL.PostgreSQL.$pg_major" --exact --accept-source-agreements 2>/dev/null | tr -d '\r')
  # niente dipendenza dalla lingua di winget (in italiano le etichette cambiano): cerco direttamente URL e hash nel testo
  url=$(grep -oE 'https://get\.enterprisedb\.com/postgresql/postgresql-[0-9]+\.[0-9]+(-[0-9]+)?-windows-x64\.exe' <<<"$info" | head -1)
  sha=$(grep -oiE '(^|[^0-9a-f])[0-9a-f]{64}($|[^0-9a-f])' <<<"$info" | head -1 | grep -oiE '[0-9a-f]{64}' | tr 'A-F' 'a-f')
  [[ -n "$url" ]] || { bad "URL dell'installer non trovato nel manifest di winget: non scarico nulla"; return 1; }
  [[ "$sha" =~ ^[0-9a-f]{64}$ ]] || { bad "SHA256 del manifest assente o non valido: non eseguo nulla"; return 1; }
  dl="$env_dir/downloads"; mkdir -p "$dl"; exe="$dl/$(basename "$url")"
  if [[ -n "$local_file" ]]; then
    [[ -f "$local_file" ]] || { bad "file non trovato: $local_file"; return 1; }
    echo "  uso l'installer già scaricato: $local_file"
    exe="$local_file"; keep=1
  else
    echo "  scarico $(basename "$url") (fonte indicata dal manifest ufficiale winget)"
    curl -fL --retry 2 --proto '=https' --tlsv1.2 -sS -o "$exe" "$url" || { bad "download non riuscito (il server get.enterprisedb.com ha rifiutato la richiesta?)"; rm -f "$exe"; return 1; }
  fi
  got=$(sha256sum "$exe" | awk '{print tolower($1)}')
  if [[ "$got" != "$sha" ]]; then
    [[ "$keep" == 1 ]] || rm -f "$exe"
    bad "SHA256 del file diverso da quello del manifest ufficiale: installer NON eseguito"
    return 1
  fi
  ok "SHA256 coincide con il manifest ufficiale winget"
  winexe=$(command -v cygpath >/dev/null 2>&1 && cygpath -w "$exe" || printf '%s' "$exe")
  echo "  avvio l'installer con elevazione (UAC), solo strumenti da riga di comando"
  out=$(powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "\$p = Start-Process -FilePath '$winexe' -ArgumentList '$ov' -Verb RunAs -Wait -PassThru; Write-Host ('INSTALLER_EXIT=' + \$p.ExitCode)" 2>&1 | tr -d '\r')
  [[ "$keep" == 1 ]] || rm -f "$exe"
  code=$(sed -n 's/.*INSTALLER_EXIT=\([0-9-]*\).*/\1/p' <<<"$out" | tail -1)
  redact <<<"$out" | tail -n 6 | sed 's/^/    /'
  if [[ "$code" == 0 ]]; then ok "installer terminato con codice 0"; return 0; fi
  bad "installer terminato con codice ${code:-sconosciuto}"
  return 1
}

install_pg_client() {
  local pw ov
  say "Client PostgreSQL $pg_major (solo strumenti da riga di comando: niente server, niente servizio)"
  pw=$(openssl rand -hex 16 2>/dev/null || echo "x$RANDOM$RANDOM")   # password casuale mai salvata né stampata: serve solo se l'installer la richiede
  ov="$pg_override_base --superpassword $pw"
  if winget_installed "PostgreSQL.PostgreSQL.$pg_major"; then
    warn "PostgreSQL.PostgreSQL.$pg_major risulta già installato (winget list): non lo reinstallo. Cerco i client nelle cartelle note."
    extend_path; detect
    pg_tools_present && return 0
    bad "ma psql, pg_dump e pg_restore non sono tutti presenti: vedi la tabella finale (disinstalla e reinstalla solo i client dal programma di installazione ufficiale)"
    return 1
  fi
  echo "  Tentativo 1: winget (PostgreSQL.PostgreSQL.$pg_major)"
  winget_install "PostgreSQL.PostgreSQL.$pg_major" "$ov" || diagnose_winget "PostgreSQL.PostgreSQL.$pg_major"
  extend_path; detect
  if pg_tools_present; then ok "psql, pg_dump e pg_restore presenti"; return 0; fi
  echo "  Tentativo 2: installer ufficiale scaricato direttamente (eseguito solo se l'hash coincide con quello del manifest)"
  pg_direct_install "$ov" "$pg_installer_arg" || true
  extend_path; detect
  if pg_tools_present; then ok "psql, pg_dump e pg_restore presenti"; return 0; fi
  if [[ -z "$pg_installer_arg" ]]; then
    local f="" c dldir
    dldir="${DOWNLOADS_DIR:-$HOME/Downloads}"
    for c in "$dldir"/postgresql-"$pg_major".*-windows-x64.exe; do
      [[ -f "$c" ]] && { [[ -z "$f" || "$c" -nt "$f" ]] && f="$c"; }
    done
    if [[ -n "$f" ]]; then
      echo "  Tentativo 3: installer trovato in Download ($f)"
      pg_direct_install "$ov" "$f" || true
      extend_path; detect
      if pg_tools_present; then ok "psql, pg_dump e pg_restore presenti"; return 0; fi
    fi
  fi
  bad "client PostgreSQL non installati. Gli altri pacchetti sono a posto e non verranno reinstallati. Metodo manuale: scarica dal browser l'installer Windows x86-64 della versione $pg_major da https://www.postgresql.org/download/windows/ (salvalo in Download, NON avviarlo) e rilancia questo script: lo trova da solo, ne verifica l'hash col manifest winget e installa solo i Command Line Tools. Oppure: bash scripts/backup/setup-windows.sh --pg-installer <percorso del file>."
  return 1
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
    id="${item%%|*}"
    if [[ "$id" == PostgreSQL.* ]]; then
      install_pg_client || true   # l'esito definitivo lo decide la verifica finale
    elif winget_installed "$id"; then
      say "$id"
      warn "risulta già installato (winget list): non lo reinstallo. Se il programma non si trova, chiudi e riapri Git Bash."
    else
      say "winget install $id"
      winget_install "$id" "" || diagnose_winget "$id"
    fi
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
