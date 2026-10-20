#!/usr/bin/env bash
# Test di scripts/backup/setup-windows.sh con un winget SIMULATO (tests/windows/stubs/winget): nessuna installazione vera, nessuna rete.
# Prova la logica (rilevamento, piano, conferma, ordine delle installazioni, PATH salvato, verifiche finali) e che lo script non
# tocchi Neon, Supabase o GitHub. NON prova l'installazione reale su Windows. Uso:  bash tests/windows/run.sh
set -uo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
stubs="$root/tests/windows/stubs"
stubs_ps="$root/tests/windows/stubs-ps"
REAL_AGE=$(command -v age) || { echo "serve age per questo test"; exit 1; }
REAL_AGEKEYGEN=$(command -v age-keygen)
REAL_PYTHON3=$(command -v python3)
export REAL_AGE REAL_AGEKEYGEN REAL_PYTHON3
pass=0
fail=0

t_pass() { pass=$((pass + 1)); printf '  ✓ %s\n' "$1"; }
t_fail() { fail=$((fail + 1)); printf '  ✗ %s\n' "$1"; }
expect() { local d="$1"; shift; if "$@"; then t_pass "$d"; else t_fail "$d"; fi; }
has() { grep -q -E -- "$1" "$LOG"; }
hasnt() { ! grep -q -E -- "$1" "$LOG"; }
out_has() { grep -q -E -- "$1" "$OUT"; }
out_hasnt() { ! grep -q -E -- "$1" "$OUT"; }

# PATH di sistema "pulito": tutto /usr/bin e /bin TRANNE gli strumenti che lo script deve trovare mancanti
make_sysbin() {
  local dir="$1" d f n
  mkdir -p "$dir"
  for d in /usr/bin /bin; do
    for f in "$d"/*; do
      n=$(basename "$f")
      case "$n" in age|age-keygen|psql|pg_dump|pg_restore|gh|node|nodejs|npm|npx|python|python3*|py|winget) continue ;; esac
      [[ -e "$dir/$n" ]] || ln -s "$f" "$dir/$n" 2>/dev/null
    done
  done
}

# scenario NOME "stdin" [VAR=VAL…] -- argomenti dello script
scenario() {
  SC_NAME="$1"; local stdin_data="$2"; shift 2
  local envs=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do envs+=("$1"); shift; done
  shift || true
  T=$(mktemp -d)
  LOG="$T/mock.log"; OUT="$T/out.txt"; : > "$LOG"
  mkdir -p "$T/home" "$T/AppData/Local" "$T/PF"
  [[ -d "$SYSBIN" ]] || { SYSBIN=$(mktemp -d); make_sysbin "$SYSBIN"; }
  printf '\n== %s\n' "$SC_NAME"
  local pathvar="$SYSBIN"
  [[ "${NO_WINGET:-0}" == 1 ]] || pathvar="$stubs:$SYSBIN"
  [[ "${WITH_PS:-0}" == 1 ]] && pathvar="$stubs_ps:$pathvar"
  printf '%b' "$stdin_data" | env -i PATH="$pathvar" HOME="$T/home" LOCALAPPDATA="$T/AppData/Local" ProgramFiles="$T/PF" \
    MOCK_LOG="$LOG" REAL_AGE="$REAL_AGE" REAL_AGEKEYGEN="$REAL_AGEKEYGEN" REAL_PYTHON3="$REAL_PYTHON3" SETUP_FORCE_WINDOWS=1 \
    "${envs[@]}" bash "$root/scripts/backup/setup-windows.sh" "$@" > "$OUT" 2>&1
  RC=$?
}
SYSBIN=""

# ---------------------------------------------------------------------------------------------------------------------------
scenario "--check su un sistema senza strumenti: non installa e non scrive nulla" "" -- --check
expect "esce con 1 (mancano strumenti)" test "$RC" -eq 1
expect "elenca age, psql, gh, node e python come mancanti" bash -c "grep -q 'age — non trovato' '$OUT' && grep -q 'psql — non trovato' '$OUT' && grep -q 'gh — non trovato' '$OUT' && grep -q 'node — non trovato' '$OUT' && grep -q 'python — Python 3 non trovato' '$OUT'"
expect "mostra il piano di installazione" out_has 'FiloSottile.age'
expect "winget MAI chiamato" hasnt '^winget\|'
expect "nessun tools.env scritto" test ! -e "$T/home/.config/moto-acquisizione/tools.env"
expect "dichiara che non ha installato né scritto" out_has 'nulla è stato installato né scritto'

scenario "senza conferma (risposta N): nessuna installazione" "n\n" --
expect "esce con 1" test "$RC" -eq 1
expect "winget install mai chiamato" hasnt '^winget\|install'
expect "dichiara l'annullamento" out_has 'Annullato'

scenario "installazione completa con --yes" "" -- --yes
expect "esce con 0" test "$RC" -eq 0
expect "installa age con l'id corretto" has '^winget\|install --id FiloSottile\.age '
expect "installa il client PostgreSQL 18 (come PG_MAJOR del workflow)" has '^winget\|install --id PostgreSQL\.PostgreSQL\.18 '
expect "il client PostgreSQL è SOLO da riga di comando (niente server/pgAdmin/StackBuilder)" has 'PostgreSQL\.PostgreSQL\.18 .*--override --mode unattended --unattendedmodeui none --disable-components server,pgAdmin,stackbuilder'
expect "installa gh, Node.js LTS e Python 3.12" bash -c "grep -q 'install --id GitHub.cli ' '$LOG' && grep -q 'install --id OpenJS.NodeJS.LTS ' '$LOG' && grep -q 'install --id Python.Python.3.12 ' '$LOG'"
expect "tutte le installazioni gratuite, accettando solo i termini dei pacchetti" bash -c "[ \"\$(grep -c '^winget|install' '$LOG')\" = 5 ] && [ \"\$(grep '^winget|install' '$LOG' | grep -c -- '--accept-package-agreements')\" = 5 ]"
expect "salva il PATH in tools.env" test -s "$T/home/.config/moto-acquisizione/tools.env"
expect "tools.env contiene le cartelle di age, PostgreSQL, gh, Node e Python" bash -c "f='$T/home/.config/moto-acquisizione/tools.env'; grep -q 'FiloSottile.age_' \"\$f\" && grep -q 'PostgreSQL/18/bin' \"\$f\" && grep -q 'GitHub CLI' \"\$f\" && grep -q 'nodejs' \"\$f\" && grep -q 'Python312' \"\$f\""
expect "verifica finale: tutti gli strumenti ok (nessuna ✗ dopo l'installazione)" bash -c "[ \"\$(sed -n '/Verifica finale/,\$p' '$OUT' | grep -c '✗')\" = 0 ]"
expect "prova di funzionamento di age (cifra e decifra)" out_has 'cifratura e decifratura di prova riuscite'
expect "indica il passo successivo" out_has 'bootstrap.sh --guided --neon-auto'
expect "gh usato SOLO per --version e auth status (nessun login, nessun secret)" bash -c "! grep -E '^gh\|' '$LOG' | grep -v -E 'gh\|(--version|auth status)'"
expect "nessun altro programma di rete coinvolto (solo winget)" bash -c "! grep -v -E '^(winget|gh)\|' '$LOG' | grep -q ."
expect "nessuna menzione di segreti nell'output" out_hasnt 'postgres://|AGE-SECRET-KEY|password'
SAVED_T="$T"

scenario "seconda esecuzione sullo stesso sistema: niente da installare (usa tools.env)" "" -- --check
# riusa la HOME e le cartelle del passo precedente
mkdir -p "$T"
printf '\n== seconda esecuzione (stessa HOME/AppData)\n'
printf '' | env -i PATH="$stubs:$SYSBIN" HOME="$SAVED_T/home" LOCALAPPDATA="$SAVED_T/AppData/Local" ProgramFiles="$SAVED_T/PF" \
  MOCK_LOG="$SAVED_T/mock.log" REAL_AGE="$REAL_AGE" REAL_AGEKEYGEN="$REAL_AGEKEYGEN" REAL_PYTHON3="$REAL_PYTHON3" SETUP_FORCE_WINDOWS=1 \
  bash "$root/scripts/backup/setup-windows.sh" --check > "$SAVED_T/out2.txt" 2>&1
RC2=$?
expect "esce con 0: tutto già presente" test "$RC2" -eq 0
expect "dichiara 'Tutto presente'" grep -q 'Tutto presente' "$SAVED_T/out2.txt"
expect "nessuna nuova installazione" bash -c "[ \"\$(grep -c '^winget|install' '$SAVED_T/mock.log')\" = 5 ]"

scenario "client PostgreSQL troppo vecchio (16): viene segnalato e sostituito con il 18" "" -- --check
T2=$(mktemp -d); mkdir -p "$T2/home" "$T2/AppData/Local" "$T2/PF/PostgreSQL/16/bin"
printf '#!/usr/bin/env bash\necho "psql (PostgreSQL) 16.4"\n' > "$T2/PF/PostgreSQL/16/bin/psql"; cp "$T2/PF/PostgreSQL/16/bin/psql" "$T2/PF/PostgreSQL/16/bin/pg_dump"; cp "$T2/PF/PostgreSQL/16/bin/psql" "$T2/PF/PostgreSQL/16/bin/pg_restore"; chmod +x "$T2"/PF/PostgreSQL/16/bin/*
env -i PATH="$stubs:$SYSBIN" HOME="$T2/home" LOCALAPPDATA="$T2/AppData/Local" ProgramFiles="$T2/PF" MOCK_LOG="$T2/mock.log" SETUP_FORCE_WINDOWS=1 \
  bash "$root/scripts/backup/setup-windows.sh" --check > "$T2/out.txt" 2>&1
expect "psql 16 marcato come vecchio (serve >= 18)" grep -q 'psql — .*16.*serve >= 18' "$T2/out.txt"
expect "il piano include il client PostgreSQL 18" grep -q 'PostgreSQL.PostgreSQL.18' "$T2/out.txt"

NO_WINGET=1 scenario "winget assente: messaggio chiaro, nulla di installato" "s\n" -- --yes
expect "esce con 1" test "$RC" -eq 1
expect "spiega come ottenere winget (gratuito)" out_has 'winget non trovato'
NO_WINGET=0

scenario "winget fallisce: la verifica finale lo dice e l'esito è negativo" "" MOCK_WINGET_FAIL=1 -- --yes
expect "esce con 1" test "$RC" -eq 1
expect "dice che il setup non è completo" out_has 'Setup NON completo'
expect "non dichiara successo" out_hasnt 'Setup completo\.'

# ---------------------------------------------------------------------------------------------------------------------------
# Fallimento dell'installer PostgreSQL (il caso reale: winget install PostgreSQL.PostgreSQL.18 → codice 4)
WITH_PS=1 scenario "winget fallisce SOLO per PostgreSQL: diagnosi + installer ufficiale verificato sull'hash del manifest" "" MOCK_PG_WINGET_FAIL=1 -- --yes
expect "esce con 0: i tre comandi PostgreSQL alla fine ci sono" test "$RC" -eq 0
expect "mostra il codice REALE di winget (HRESULT), non solo l'ultimo byte" out_has 'codice reale 0x8A1501'
expect "indica il log completo" out_has 'log completo: .*winget-PostgreSQL\.PostgreSQL\.18-'
expect "il log di winget è stato salvato" bash -c "ls '$T/home/.config/moto-acquisizione/logs'/winget-PostgreSQL.PostgreSQL.18-*.log >/dev/null"
expect "spiega il requisito di amministratore (Scope=machine)" out_has 'Scope=machine'
expect "scarica SOLO dall'URL del manifest ufficiale (get.enterprisedb.com)" bash -c "[ \"\$(grep -c '^curl|' '$LOG')\" = 1 ] && grep -q 'curl|.*https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64.exe' '$LOG'"
expect "scarica solo in HTTPS con TLS >= 1.2" has '^curl\|.*--proto =https --tlsv1\.2'
expect "verifica l'SHA256 prima di eseguire" out_has 'SHA256 coincide con il manifest ufficiale'
expect "avvia l'installer con elevazione e SOLO i componenti da riga di comando" has 'Start-Process.*--disable-components server,pgAdmin,stackbuilder.*-Verb RunAs'
expect "psql, pg_dump e pg_restore presenti dopo il metodo alternativo" out_has 'psql, pg_dump e pg_restore presenti'
expect "la verifica finale non ha ✗" bash -c "[ \"\$(sed -n '/Verifica finale/,\$p' '$OUT' | grep -c '✗')\" = 0 ]"
expect "gli altri pacchetti sono installati UNA sola volta" bash -c "for i in FiloSottile.age GitHub.cli OpenJS.NodeJS.LTS Python.Python.3.12; do [ \"\$(grep -c \"^winget|install --id \$i \" '$LOG')\" = 1 ] || exit 1; done"
expect "la password casuale dell'installer non compare nell'output" out_hasnt 'superpassword [0-9a-f]{16}'
expect "nessun accesso a Neon, Supabase o GitHub (solo winget, powershell e curl verso EDB)" bash -c "! grep -v -E '^(winget|powershell|curl|gh)\|' '$LOG' | grep -q ."

WITH_PS=1 scenario "winget in italiano: il metodo alternativo legge comunque URL e hash" "" MOCK_PG_WINGET_FAIL=1 MOCK_SHOW_IT=1 -- --yes
expect "esce con 0" test "$RC" -eq 0
expect "SHA256 verificato" out_has 'SHA256 coincide con il manifest ufficiale'
expect "psql, pg_dump e pg_restore presenti" out_has 'psql, pg_dump e pg_restore presenti'

MANUAL_DIR=$(mktemp -d); printf 'mock-installer-bytes' > "$MANUAL_DIR/postgresql-18.6-5-windows-x64.exe"
WITH_PS=1 scenario "download bloccato (403): usa l'installer scaricato a mano con --pg-installer" "" MOCK_PG_WINGET_FAIL=1 MOCK_CURL_FAIL=1 -- --yes --pg-installer "$MANUAL_DIR/postgresql-18.6-5-windows-x64.exe"
expect "esce con 0" test "$RC" -eq 0
expect "SHA256 verificato" out_has 'SHA256 coincide con il manifest ufficiale'
expect "avvia l'installer con soli strumenti da riga di comando" has 'Start-Process.*--disable-components server,pgAdmin,stackbuilder'
expect "il file scaricato a mano NON viene cancellato" test -f "$MANUAL_DIR/postgresql-18.6-5-windows-x64.exe"

WITH_PS=1 scenario "download bloccato: trova da solo l'installer in Download" "" MOCK_PG_WINGET_FAIL=1 MOCK_CURL_FAIL=1 DOWNLOADS_DIR="$MANUAL_DIR" -- --yes
expect "esce con 0" test "$RC" -eq 0
expect "dice di averlo trovato in Download" out_has 'trovato in Download'
expect "psql, pg_dump e pg_restore presenti" out_has 'psql, pg_dump e pg_restore presenti'

printf 'altro-contenuto' > "$MANUAL_DIR/postgresql-18.6-5-windows-x64.exe"
WITH_PS=1 scenario "installer scaricato a mano con hash sbagliato: NON eseguito" "" MOCK_PG_WINGET_FAIL=1 MOCK_CURL_FAIL=1 -- --yes --pg-installer "$MANUAL_DIR/postgresql-18.6-5-windows-x64.exe"
expect "esce con 1" test "$RC" -eq 1
expect "nessun Start-Process" hasnt 'Start-Process'
rm -rf "$MANUAL_DIR"

WITH_PS=1 scenario "hash diverso dal manifest: l'installer scaricato NON viene eseguito" "" MOCK_PG_WINGET_FAIL=1 MOCK_SHA_BAD=1 -- --yes
expect "esce con 1" test "$RC" -eq 1
expect "dice che il file è stato eliminato e NON eseguito" out_has 'SHA256 .* diverso .* NON eseguito'
expect "nessun Start-Process (l'installer non parte)" hasnt 'Start-Process'
expect "indica il metodo manuale ufficiale" out_has 'https://www\.postgresql\.org/download/windows/'
expect "il file scaricato non resta su disco" bash -c "! ls '$T/home/.config/moto-acquisizione/downloads'/*.exe 2>/dev/null | grep -q ."
expect "gli altri pacchetti sono comunque installati (nessun lavoro perso)" bash -c "grep -q 'install --id FiloSottile.age ' '$LOG' && grep -q 'install --id GitHub.cli ' '$LOG'"
expect "la verifica finale segnala psql mancante" out_has 'psql — non trovato'
expect "non dichiara successo" out_hasnt 'Setup completo\.'

WITH_PS=1 scenario "anche l'installer elevato fallisce (codice 4): esito negativo con istruzioni" "" MOCK_PG_WINGET_FAIL=1 MOCK_INSTALLER_FAIL=1 -- --yes
expect "esce con 1" test "$RC" -eq 1
expect "riporta il codice dell'installer" out_has 'installer terminato con codice 4'
expect "client PostgreSQL non installati, resto a posto" out_has 'client PostgreSQL non installati\. Gli altri pacchetti sono a posto'
SAVED_FAIL="$T"

WITH_PS=1 scenario "client incompleti: pg_restore manca dopo l'installazione → segnalato, non spacciato per riuscito" "" MOCK_NO_PG_RESTORE=1 -- --yes
expect "esce con 1" test "$RC" -eq 1
expect "psql e pg_dump presenti ma pg_restore no" bash -c "grep -q 'psql — psql (PostgreSQL) 18' '$OUT' && grep -q 'pg_dump — pg_dump (PostgreSQL) 18' '$OUT' && sed -n '/Verifica finale/,\$p' '$OUT' | grep -q 'pg_restore — non trovato'"
expect "non dichiara successo" out_hasnt 'Setup completo\.'

NO_WINGET=0 scenario "senza PowerShell il metodo alternativo non è disponibile e lo dice (winget PostgreSQL fallisce)" "" MOCK_PG_WINGET_FAIL=1 -- --yes
expect "esce con 1" test "$RC" -eq 1
expect "diagnosi con codice di winget anche senza PowerShell" out_has 'codice reale 0x00000004'
expect "spiega che servono powershell, curl e sha256sum" out_has 'metodo alternativo non disponibile'

# rilancio dopo un successo parziale (stessa HOME/AppData del fallimento sopra): si ritenta SOLO il client PostgreSQL
printf '\n== rilancio dopo successo parziale: solo il client PostgreSQL viene ritentato\n'
printf '' | env -i PATH="$stubs_ps:$stubs:$SYSBIN" HOME="$SAVED_FAIL/home" LOCALAPPDATA="$SAVED_FAIL/AppData/Local" ProgramFiles="$SAVED_FAIL/PF" \
  MOCK_LOG="$SAVED_FAIL/mock2.log" REAL_AGE="$REAL_AGE" REAL_AGEKEYGEN="$REAL_AGEKEYGEN" REAL_PYTHON3="$REAL_PYTHON3" SETUP_FORCE_WINDOWS=1 \
  bash "$root/scripts/backup/setup-windows.sh" --yes > "$SAVED_FAIL/out2.txt" 2>&1
RC3=$?
expect "esce con 0: ora il client PostgreSQL c'è" test "$RC3" -eq 0
expect "ha chiamato winget install UNA sola volta, per PostgreSQL" bash -c "[ \"\$(grep -c '^winget|install' '$SAVED_FAIL/mock2.log')\" = 1 ] && grep -q '^winget|install --id PostgreSQL.PostgreSQL.18 ' '$SAVED_FAIL/mock2.log'"
expect "age, gh, Node e Python NON reinstallati" bash -c "! grep -E '^winget\|install --id (FiloSottile.age|GitHub.cli|OpenJS.NodeJS.LTS|Python.Python.3.12) ' '$SAVED_FAIL/mock2.log'"
expect "non serve scaricare nulla se winget riesce" bash -c "! grep -q '^curl|' '$SAVED_FAIL/mock2.log'"

WITH_PS=1 scenario "winget list segnala il pacchetto già installato ma non nel PATH: non viene reinstallato" "" MOCK_PREINSTALLED="FiloSottile.age" -- --yes
expect "age NON reinstallato" hasnt 'install --id FiloSottile\.age '
expect "dice che risulta già installato" out_has 'risulta già installato'
expect "gli altri pacchetti mancanti sono invece installati" has 'install --id GitHub\.cli '

# ---------------------------------------------------------------------------------------------------------------------------
printf '\n== python su Windows: \\r\\n dell'"'"'interprete non finiscono nei valori catturati\n'
W=$(mktemp -d); mkdir -p "$W/bin"
printf '#!/usr/bin/env bash\necho MINGW64_NT-10.0\n' > "$W/bin/uname"; chmod +x "$W/bin/uname"
printf '#!/usr/bin/env bash\nif [[ "$*" == *version_info* ]]; then printf "3\\r\\n"; else printf "VALORE\\r\\n"; fi\n' > "$W/bin/python3"; chmod +x "$W/bin/python3"
got=$(PATH="$W/bin:$PATH" bash -c "source '$root/scripts/backup/pg-env.sh'; x=\$(python3 -c 'print(1)'); printf '%s' \"\$x\" | od -c | head -1")
expect "il valore catturato è 'VALORE' senza \\r" bash -c "[[ \"$got\" == *V*A*L*O*R*E* && \"$got\" != *'\\r'* ]]"

printf '\nRisultato: %d passati, %d falliti\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
