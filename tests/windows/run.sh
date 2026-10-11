#!/usr/bin/env bash
# Test di scripts/backup/setup-windows.sh con un winget SIMULATO (tests/windows/stubs/winget): nessuna installazione vera, nessuna rete.
# Prova la logica (rilevamento, piano, conferma, ordine delle installazioni, PATH salvato, verifiche finali) e che lo script non
# tocchi Neon, Supabase o GitHub. NON prova l'installazione reale su Windows. Uso:  bash tests/windows/run.sh
set -uo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
stubs="$root/tests/windows/stubs"
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
printf '\n== python su Windows: \\r\\n dell'"'"'interprete non finiscono nei valori catturati\n'
W=$(mktemp -d); mkdir -p "$W/bin"
printf '#!/usr/bin/env bash\necho MINGW64_NT-10.0\n' > "$W/bin/uname"; chmod +x "$W/bin/uname"
printf '#!/usr/bin/env bash\nif [[ "$*" == *version_info* ]]; then printf "3\\r\\n"; else printf "VALORE\\r\\n"; fi\n' > "$W/bin/python3"; chmod +x "$W/bin/python3"
got=$(PATH="$W/bin:$PATH" bash -c "source '$root/scripts/backup/pg-env.sh'; x=\$(python3 -c 'print(1)'); printf '%s' \"\$x\" | od -c | head -1")
expect "il valore catturato è 'VALORE' senza \\r" bash -c "[[ \"$got\" == *V*A*L*O*R*E* && \"$got\" != *'\\r'* ]]"

printf '\nRisultato: %d passati, %d falliti\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
