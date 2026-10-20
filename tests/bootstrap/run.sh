#!/usr/bin/env bash
# Test di scripts/backup/bootstrap.sh con MOCK verificabili (psql, pg_dump, pg_restore, gh, npx, npm in tests/bootstrap/stubs).
# Nessuna rete, nessun database vero, nessun segreto reale: le stringhe "CANARY_*" servono a dimostrare che non finiscono mai
# negli argomenti dei processi né nell'output. Uso:  bash tests/bootstrap/run.sh
set -uo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
stubs="$root/tests/bootstrap/stubs"
pass=0
fail=0
CANARIES=(CANARY_OWNER_PW_7f3a CANARY_S3_SECRET_9b1c CANARY_S3_KEYID_2d4e CANARY_APP_SECRET_55aa)

# ---------------------------------------------------------------------------------------------------------------------------
t_pass() { pass=$((pass + 1)); printf '  ✓ %s\n' "$1"; }
t_fail() { fail=$((fail + 1)); printf '  ✗ %s\n' "$1"; }
expect() { # expect "descrizione" comando-di-test…  (vero se il comando riesce)
  local d="$1"; shift
  if "$@"; then t_pass "$d"; else t_fail "$d"; fi
}
lines() { grep -c -i -E -- "$1" "$LOG" || true; }
has() { grep -q -i -E -- "$1" "$LOG"; }
hasnt() { ! grep -q -i -E -- "$1" "$LOG"; }
out_has() { grep -q -i -E -- "$1" "$OUT"; }
out_hasnt() { ! grep -q -i -E -- "$1" "$OUT"; }
no_canary() {
  local c
  for c in "${CANARIES[@]}"; do
    if grep -q "$c" "$LOG" "$OUT" 2>/dev/null; then echo "     segreto trovato in log/output: $c" >&2; return 1; fi
  done
}

# scenario NOME "input stdin" [variabili d'ambiente KEY=VAL…] -- [argomenti di bootstrap.sh…]
scenario() {
  SC_NAME="$1"; local stdin_data="$2"; shift 2
  local envs=()
  while [[ $# -gt 0 && "$1" != "--" ]]; do envs+=("$1"); shift; done
  shift || true
  SC_DIR=$(mktemp -d)
  LOG="$SC_DIR/mock.log"; OUT="$SC_DIR/out.txt"; : > "$LOG"
  mkdir -p "$SC_DIR/home"
  printf '\n== %s\n' "$SC_NAME"
  printf '%b' "$stdin_data" | env -i PATH="$stubs:$PATH" HOME="$SC_DIR/home" MOCK_LOG="$LOG" GH="$stubs/gh" \
    GITHUB_REPOSITORY=test/test \
    BOOT_OWNER_URL="postgres://neondb_owner:CANARY_OWNER_PW_7f3a@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require" \
    BACKUP_S3_ENDPOINT="https://example.storage.supabase.co/storage/v1/s3" \
    BACKUP_S3_ACCESS_KEY_ID="CANARY_S3_KEYID_2d4e" BACKUP_S3_SECRET_ACCESS_KEY="CANARY_S3_SECRET_9b1c" \
    "${envs[@]}" bash "$root/scripts/backup/bootstrap.sh" "$@" > "$OUT" 2>&1
  RC=$?
}
tmp_db_name() { grep -oE 'create database "restore_rehearsal_[0-9]{14}_[0-9a-f]{6}"' "$LOG" | head -1 | sed -E 's/.*"(.*)"/\1/'; }

# ===========================================================================================================================
scenario "senza modalità → uso e uscita 2, nessuna chiamata" "" --
expect "esce con 2" test "$RC" -eq 2
expect "nessuna chiamata a psql/gh/npm" test ! -s "$LOG"

scenario "DRY-RUN: nessuna scrittura né su Neon né su GitHub" "" -- --dry-run
expect "esce con 0" test "$RC" -eq 0
expect "ha interrogato Neon" has '^psql\|'
expect "TUTTE le sessioni psql sono in sola lettura (ro=yes)" hasnt '^psql\|ro=no'
expect "nessuna istruzione di scrittura inviata (create/alter/drop/grant/…)" hasnt '^psql\|.*kind=WRITE'
expect "nessun CREATE DATABASE / DROP DATABASE" hasnt 'create database|drop database'
expect "nessun CREATE ROLE / ALTER ROLE" hasnt 'create role|alter role'
expect "nessun setup-backup-reader.sql" hasnt 'setup-backup-reader'
expect "nessuna migrazione (db:migrate)" hasnt 'db:migrate'
expect "nessun ripristino (pg_restore senza --list/--version)" hasnt '^pg_restore\|argv=--(no-owner|dbname)'
expect "nessun backup (pg_dump con --file)" hasnt '^pg_dump\|argv=.*--file'
expect "gh MAI chiamato (né login, né secret)" hasnt '^gh\|'
expect "bucket controllato in sola lettura (CHECK_READONLY=true)" has 'CHECK_READONLY=true'
expect "nessun file di chiave persistente creato" test ! -e "$SC_DIR/home/.config"
expect "dichiara che non ha scritto nulla" out_has 'DRY-RUN terminato: nessuna scrittura'
expect "nessun segreto in log o output" no_canary

scenario "DRY-RUN con migrazioni mancanti e ruolo esistente: segnala i bloccanti, nessuna scrittura" "" MOCK_MIGRATED=f MOCK_READER_EXISTS=t -- --dry-run
expect "esce con 0" test "$RC" -eq 0
expect "segnala 'migrazioni' come bloccante" out_has 'BLOCCANTE.*migrazioni'
expect "segnala il ruolo esistente come bloccante" out_has 'BLOCCANTE.*backup_reader esiste già'
expect "nessuna scrittura (ro=yes ovunque, nessun WRITE)" bash -c "! grep -q -E 'ro=no|kind=WRITE' '$LOG'"
expect "nessuna chiamata a gh" hasnt '^gh\|'
expect "nessun segreto in log o output" no_canary

scenario "DRY-RUN --neon-auto senza URL preimpostato" "" BOOT_OWNER_URL= MOCK_NEON_URL="postgres://neondb_owner:CANARY_OWNER_PW_7f3a@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require" -- --dry-run --neon-auto
expect "esce con 0" test "$RC" -eq 0
expect "ha usato neonctl (connection-string, non pooled)" has 'npx\|.*connection-string.*--pooled=false'
expect "nessun segreto in log o output" no_canary
expect "nessuna scrittura" hasnt 'ro=no|kind=WRITE'

scenario "DRY-RUN --neon-auto: neonctl che farebbe una domanda interattiva NON resta appeso e si passa all'ID manuale" "x\n" BOOT_OWNER_URL= MOCK_NPX_NEEDS_STDIN=1 -- --dry-run --neon-auto
expect "neonctl non ha ricevuto stdin" hasnt 'BLOCCATO su stdin'
expect "spiega dove trovare l'ID del progetto" out_has 'Project ID'
expect "nessun segreto in log o output" no_canary

# ---------------------------------------------------------------------------------------------------------------------------
scenario "APPLY annullato alla conferma generale: nessuna modifica" "\n" -- --apply
expect "esce con 1" test "$RC" -eq 1
expect "nessuna scrittura su Neon" hasnt 'ro=no|kind=WRITE'
expect "gh mai chiamato" hasnt '^gh\|'
expect "nessun segreto in log o output" no_canary

scenario "APPLY con migrazioni mancanti: si ferma e spiega, non le applica" "neondb\n" MOCK_MIGRATED=f -- --apply
expect "esce con 1" test "$RC" -eq 1
expect "spiega come procedere (avvio del sito o db:migrate a mano)" out_has 'NON le applica mai'
expect "nessuna migrazione eseguita" hasnt '^npm\|argv=run.*db:migrate'
expect "nessuna scrittura su Neon" hasnt 'ro=no|kind=WRITE'
expect "gh mai chiamato" hasnt '^gh\|'

scenario "APPLY con backup_reader esistente: NON ne cambia la password" "neondb\n" MOCK_READER_EXISTS=t -- --apply
expect "esce con 1" test "$RC" -eq 1
expect "nessun ALTER ROLE" hasnt 'alter role'
expect "nessun CREATE ROLE" hasnt 'create role'
expect "propone la rotazione sicura con --new-reader-role" out_has -- '--new-reader-role'
expect "nessuna scrittura su Neon" hasnt 'ro=no|kind=WRITE'
expect "gh mai chiamato" hasnt '^gh\|'

scenario "APPLY: S3 con la stessa chiave dell'app in modalità predefinita → rifiutato" "neondb\ns\ns\ns\ns\ns\ns\n" S3_ACCESS_KEY_ID=CANARY_S3_KEYID_2d4e -- --apply
expect "esce con errore" test "$RC" -ne 0
expect "i secret NON sono stati scritti" hasnt '^gh\|secret set'
expect "nessun segreto in log o output" no_canary

# ---------------------------------------------------------------------------------------------------------------------------
scenario "APPLY percorso completo (mock): conferme, ruolo, database di prova, secret" "neondb\ns\ns\ns\ns\ns\ns\n" -- --apply
expect "esce con 0" test "$RC" -eq 0
expect "crea il ruolo con un verificatore SCRAM (mai la password in chiaro)" bash -c "grep -q 'create role' '$LOG' && ! grep -q -i 'password.*[0-9a-f]\{48\}' '$LOG'"
expect "ruolo creato: backup_reader (nome standard, non esisteva)" has "argv=.*reader=backup_reader( |$)"
expect "setup-backup-reader.sql applicato" has 'file=setup-backup-reader.sql'
expect "NESSUN ALTER ROLE" hasnt 'alter role'
expect "esattamente un CREATE DATABASE" test "$(lines 'sql=create database ')" -eq 1
expect "esattamente un DROP DATABASE" test "$(lines 'sql=drop database ')" -eq 1
DB=$(tmp_db_name)
expect "il database di prova ha il formato restore_rehearsal_<utc>_<hex>" bash -c "[[ '$DB' =~ ^restore_rehearsal_[0-9]{14}_[0-9a-f]{6}\$ ]]"
expect "il database di prova NON coincide con quello vero (neondb)" test "$DB" != "neondb"
expect "DROP riguarda esattamente il database creato" has "sql=drop database \"$DB\""
expect "nessun DROP di altri database" test "$(grep -E 'sql=drop database ' "$LOG" | grep -vc "\"$DB\"")" -eq 0
expect "CREATE/DROP eseguiti sul database vero come utente proprietario, mai in sola lettura" bash -c "grep -E 'sql=(create|drop) database' '$LOG' | grep -q 'ro=no'"
expect "ripristino eseguito solo nel database di prova" has "^pg_restore\|argv=--no-owner.*\|db=$DB\|"
expect "nessun ripristino su neondb" hasnt "^pg_restore\|argv=--no-owner.*\|db=neondb\|"
expect "5 secret impostati, via stdin (solo nomi e dimensioni nel log)" test "$(lines '^gh\|secret set BACKUP_')" -eq 5
expect "nessun secret scritto prima delle verifiche (gh secret set dopo drop database)" bash -c "awk '/sql=drop database/{d=NR} /gh\\|secret set/{s=NR; if(!d||s<d) exit 1}' '$LOG'"
expect "nessuna migrazione" hasnt 'db:migrate'
expect "nessuna password/URL tra gli argomenti dei processi e nell'output" no_canary
expect "BACKUP_ENABLED mai menzionato come impostato" out_hasnt 'BACKUP_ENABLED.*impostat'

scenario "APPLY con backup_reader esistente e --new-reader-role: ruolo NUOVO, vecchio intatto" "neondb\ns\ns\ns\ns\ns\ns\n" MOCK_READER_EXISTS=t -- --apply --new-reader-role
expect "esce con 0" test "$RC" -eq 0
expect "usa un nome nuovo backup_reader_<data>" has "argv=.*reader=backup_reader_[0-9]{8}"
expect "NESSUN ALTER ROLE (password del vecchio ruolo intatta)" hasnt 'alter role'
expect "nessun segreto in log o output" no_canary

scenario "APPLY con ripristino diverso dall'originale: i secret NON vengono scritti" "neondb\ns\ns\ns\ns\ns\ns\n" MOCK_VERIFY_DIFF=1 -- --apply
expect "esce con errore" test "$RC" -ne 0
expect "nessun secret scritto" hasnt '^gh\|secret set'
expect "segnala che il ripristino non coincide" out_has 'NON coincide'
expect "avvisa del database di prova rimasto e di come eliminarlo" out_has 'DROP DATABASE'
expect "non ha eliminato nulla da solo" hasnt 'sql=drop database '

scenario "APPLY rifiuta il database di prova uguale al vero (--restore-to-url con la stessa stringa)" "neondb\n" BOOT_RESTORE_URL="postgres://neondb_owner:CANARY_OWNER_PW_7f3a@ep-test.eu-central-1.aws.neon.tech/neondb?sslmode=require" -- --apply --restore-to-url
expect "esce con errore" test "$RC" -ne 0
expect "rifiutato" out_has 'coincide con quello vero'
expect "nessuna scrittura" hasnt 'ro=no|kind=WRITE'

# ---------------------------------------------------------------------------------------------------------------------------
scenario "GUIDED con nome del database sbagliato: nessuna scrittura (la fase di lettura non scrive)" "altro\n" -- --guided
expect "esce con 1" test "$RC" -eq 1
expect "ha ispezionato Neon" has '^psql\|'
expect "nessuna scrittura su Neon" hasnt 'ro=no|kind=WRITE'
expect "gh mai chiamato" hasnt '^gh\|'
expect "nessun segreto in log o output" no_canary

scenario "GUIDED con migrazioni mancanti: si ferma prima di qualunque conferma" "" MOCK_MIGRATED=f -- --guided
expect "esce con 1" test "$RC" -eq 1
expect "nessuna scrittura su Neon" hasnt 'ro=no|kind=WRITE'
expect "gh mai chiamato" hasnt '^gh\|'
expect "nessuna migrazione" hasnt 'db:migrate'

scenario "GUIDED percorso completo: stesso risultato di --apply, in una sola esecuzione" "neondb\ns\ns\ns\ns\ns\ns\n" -- --guided
expect "esce con 0" test "$RC" -eq 0
expect "prima fase di sola lettura: la prima scrittura arriva dopo la conferma generale" bash -c "awk '/kind=WRITE/{w=1} w==0 && /ro=no/{exit 1}' '$LOG'"
expect "esattamente un CREATE e un DROP DATABASE" bash -c "[ \"\$(grep -c -i 'sql=create database ' '$LOG')\" = 1 ] && [ \"\$(grep -c -i 'sql=drop database ' '$LOG')\" = 1 ]"
expect "NESSUN ALTER ROLE e nessuna migrazione" bash -c "! grep -q -i -E 'alter role|db:migrate' '$LOG'"
expect "5 secret impostati dopo il DROP del database di prova" bash -c "[ \"\$(grep -c '^gh|secret set BACKUP_' '$LOG')\" = 5 ]"
expect "nessun segreto in log o output" no_canary

# ---------------------------------------------------------------------------------------------------------------------------
scenario "--reuse-app-s3 SENZA la frase di consenso: rifiutato" "\n" BACKUP_S3_ACCESS_KEY_ID= BACKUP_S3_SECRET_ACCESS_KEY= BACKUP_S3_ENDPOINT= \
  S3_ENDPOINT="https://example.storage.supabase.co/storage/v1/s3" S3_ACCESS_KEY_ID=CANARY_S3_KEYID_2d4e S3_SECRET_ACCESS_KEY=CANARY_APP_SECRET_55aa -- --dry-run --reuse-app-s3
expect "esce con errore" test "$RC" -ne 0
expect "dice che usa solo chiavi dedicate" out_has 'consenso non dato'
expect "nessuna chiamata a Neon" hasnt '^psql\|'
expect "nessun segreto in log o output" no_canary

scenario "--reuse-app-s3 CON la frase di consenso: procede (dry-run)" "RIUSA CHIAVI APP\n" BACKUP_S3_ACCESS_KEY_ID= BACKUP_S3_SECRET_ACCESS_KEY= BACKUP_S3_ENDPOINT= \
  S3_ENDPOINT="https://example.storage.supabase.co/storage/v1/s3" S3_ACCESS_KEY_ID=CANARY_S3_KEYID_2d4e S3_SECRET_ACCESS_KEY=CANARY_APP_SECRET_55aa -- --dry-run --reuse-app-s3
expect "esce con 0" test "$RC" -eq 0
expect "il riuso è esplicitato come meno sicuro" out_has 'meno sicuro'
expect "nessun segreto in log o output" no_canary

scenario "--reuse-app-s3 insieme a BACKUP_S3_* → conflitto, rifiutato" "RIUSA CHIAVI APP\n" S3_ACCESS_KEY_ID=x -- --dry-run --reuse-app-s3
expect "esce con errore" test "$RC" -ne 0
expect "spiega il conflitto" out_has 'scegli una sola strada'

# ---------------------------------------------------------------------------------------------------------------------------
printf '\n== libpq via ambiente: la password non compare tra gli argomenti dei processi (/proc/*/cmdline)\n'
# shellcheck source=scripts/backup/pg-env.sh
source "$root/scripts/backup/pg-env.sh"
pw=$(printf 'Q0FOQVJZX1BXX3p6OQ==' | base64 -d)   # il canarino non appare in chiaro nel testo dei comandi
pat="[${pw:0:1}]${pw:1}"                          # il pattern non corrisponde alla propria riga di comando
export TESTURL="postgres://u:${pw}@127.0.0.1:1/db"
seen() { grep -l -a "$pat" /proc/[0-9]*/cmdline 2>/dev/null | wc -l; }
control=$( ( bash -c 'sleep 2; :' _ "$pw" ) & sleep 0.7; seen; wait )
viaenv=$( ( with_pg_url TESTURL bash -c 'sleep 2; :' ) & sleep 0.7; seen; wait )
expect "controllo di sensibilità: un canarino negli argomenti VIENE rilevato" test "$control" -ge 1
expect "con with_pg_url la password NON è negli argomenti" test "$viaenv" -eq 0
# shellcheck disable=SC2016  # il comando tra apici deve essere espanso dal processo figlio, non qui
expect "ma arriva al processo figlio come PGPASSWORD" test "$(with_pg_url TESTURL bash -c 'printf %s "${PGPASSWORD:+si}"')" = "si"
expect "parametri URL sconosciuti vengono rifiutati" bash -c "source '$root/scripts/backup/pg-env.sh'; U='postgres://u:p@h/db?foo=bar'; ! pg_env_exports U >/dev/null 2>&1"

# ---------------------------------------------------------------------------------------------------------------------------
printf '\nRisultato: %d passati, %d falliti\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
