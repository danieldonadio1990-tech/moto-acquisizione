#!/usr/bin/env bash
# Configurazione guidata e collaudo del backup, SUL TUO COMPUTER.
#
#   scripts/backup/bootstrap.sh --guided  [opzioni]   UN SOLO COMANDO: ispezione in sola lettura + piano; se non ci sono bloccanti
#                                                     continua come --apply (digiti il nome del database e confermi ogni scrittura)
#   scripts/backup/bootstrap.sh --dry-run [opzioni]   NON modifica nulla: né Neon, né GitHub, né file persistenti
#   scripts/backup/bootstrap.sh --apply   [opzioni]   come --guided, ma senza la pausa dopo il piano
#
# Opzioni:
#   --neon-auto        ricava la stringa DIRETTA Neon con `neonctl` (login nel browser) invece di chiederla. Non ancora provato su Neon reale.
#   --new-reader-role  se backup_reader esiste già NON ne tocca la password: crea un ruolo NUOVO (backup_reader_<data>) e
#                      imposta il secret solo dopo le verifiche; il vecchio ruolo resta valido finché non lo elimini tu
#   --restore-to-url   ripristina su un branch/database VUOTO che indichi tu, invece di crearne uno di prova
#   --reuse-app-s3     riusa le chiavi S3 dell'APP per i backup. Di norma servono chiavi DEDICATE (BACKUP_S3_*); il riuso richiede
#                      di scrivere una frase di consenso a mano
#
# GARANZIE
#   --dry-run : connessioni a Neon solo in sessioni di SOLA LETTURA (default_transaction_read_only=on, il server rifiuta scritture);
#               nessun login gh, nessun secret, nessuna migrazione, nessun CREATE/ALTER/DROP, nessun file di chiave persistente.
#   --apply   : mai migrazioni (se mancano si ferma e spiega); mai ALTER ROLE né cambio password di ruoli esistenti; l'unico
#               database creato/eliminato è quello di prova creato da questa esecuzione, con nome casuale mai uguale a quello vero.
#   sempre    : nessun segreto in output, nei log o tra gli argomenti dei processi (libpq via variabili d'ambiente, secret via stdin).
#
# Manuale: in Supabase → Storage → S3 Connection una NUOVA coppia di chiavi per i backup (bucket privato "backups").
set -euo pipefail
umask 077

mode=""
neon_auto=false
reuse_app_s3=false
restore_to_url=false
new_reader=false
for a in "$@"; do
  case "$a" in
    --dry-run) [[ -z "$mode" || "$mode" == dry ]] || { echo "usa --dry-run oppure --apply, non entrambi" >&2; exit 2; }; mode=dry ;;
    --apply)   [[ -z "$mode" || "$mode" == apply ]] || { echo "usa --dry-run oppure --apply, non entrambi" >&2; exit 2; }; mode=apply ;;
    --guided)  [[ -z "$mode" || "$mode" == guided ]] || { echo "usa una sola modalità tra --dry-run, --apply e --guided" >&2; exit 2; }; mode=guided ;;
    --neon-auto) neon_auto=true ;;
    --new-reader-role) new_reader=true ;;
    --restore-to-url) restore_to_url=true ;;
    --reuse-app-s3) reuse_app_s3=true ;;
    *) echo "Argomento sconosciuto: $a" >&2; exit 2 ;;
  esac
done
if [[ -z "$mode" ]]; then
  sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//' >&2
  echo "Indica --guided (consigliato), --dry-run (non modifica nulla) oppure --apply (collaudo reale con conferme)." >&2
  exit 2
fi

repo="${GITHUB_REPOSITORY:-danieldonadio1990-tech/moto-acquisizione}"
GH="${GH:-gh}"
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
# PATH dei programmi installati da setup-windows.sh (su Windows/Git Bash), se presente
tools_env="$HOME/.config/moto-acquisizione/tools.env"
if [[ -f "$tools_env" ]]; then
  # shellcheck source=/dev/null
  source "$tools_env"
fi
# shellcheck source=scripts/backup/pg-env.sh
source "$here/pg-env.sh"
key_file="${BACKUP_AGE_KEY_FILE:-$HOME/.config/moto-acquisizione/backup-age-key.txt}"
pg_major_wanted=$(sed -nE 's/^ *PG_MAJOR: *"([0-9]+)".*/\1/p' "$root/.github/workflows/backup.yml" | head -1)
work=$(mktemp -d)
created_db=""
blockers=()

finish() {
  rm -rf "$work"
  if [[ -n "$created_db" ]]; then
    echo "! Database di prova rimasto su Neon: \"$created_db\" (creato da questa esecuzione). Eliminalo con:  DROP DATABASE \"$created_db\";" >&2
  fi
}
trap finish EXIT

say()  { printf '\n== %s\n' "$1"; }
ok()   { printf '✓ %s\n' "$1"; }
warn() { printf '! %s\n' "$1"; }
die()  { printf '✗ %s\n' "$1" >&2; exit 1; }
blocker() { blockers+=("$1"); warn "BLOCCANTE per --apply: $1"; }
confirm() { local r; read -rp "$1 [s/N] " r || r=""; [[ "$r" == [sS] ]]; }
ask_secret() { # ask_secret VARIABILE "domanda"  (usa la variabile d'ambiente se già impostata)
  local var="$1" prompt="$2" val
  if [[ -z "${!var:-}" ]]; then
    read -rsp "$prompt: " val || val=""; echo
    [[ -n "$val" ]] || die "$var vuoto"
    export "$var=$val"
  fi
}

# --- Accesso a Neon: due sole porte, entrambe senza URL negli argomenti dei processi ---
sql_ro() { with_pg_url_ro "$1" psql -v ON_ERROR_STOP=1 -Atqc "$2"; }
sql_rw() { # scritture: impossibili in --dry-run (difesa in profondità oltre al controllo a monte)
  [[ "$mode" == apply ]] || die "BUG: scrittura su Neon richiesta fuori da --apply"
  local var="$1"; shift
  with_pg_url "$var" psql -v ON_ERROR_STOP=1 -q "$@"
}

# ===========================================================================================================================
say "0. Controlli preliminari ($([[ $mode == dry ]] && echo 'DRY-RUN: nessuna modifica' || echo "$mode: collaudo reale con conferme"))"
missing=()
ensure_python3 || missing+=("python3 (Python 3)")
for t in age age-keygen psql pg_dump pg_restore openssl npm; do
  command -v "$t" >/dev/null 2>&1 || missing+=("$t")
done
if ((${#missing[@]})); then
  printf '✗ Strumenti mancanti: %s\n' "${missing[*]}" >&2
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) echo "  Su Windows li installa e verifica uno script solo:  bash scripts/backup/setup-windows.sh" >&2 ;;
    *) echo "  Installali con il gestore pacchetti del sistema (client PostgreSQL >= 18, age, openssl, python3, npm)." >&2 ;;
  esac
  exit 1
fi
ok "strumenti presenti"

# ===========================================================================================================================
say "1. Credenziali in ingresso (a schermo nascosto, mai stampate)"
if $neon_auto && [[ -z "${BOOT_OWNER_URL:-}" ]]; then
  neon_cli() { npx --yes neonctl@latest "$@"; }
  if ! neon_cli me >/dev/null 2>&1; then
    echo "Login Neon nel browser (gratuito; autentica la CLI, non modifica nulla)."
    neon_cli login || echo "Login Neon non riuscito: passo all'inserimento manuale."
  fi
  if neon_cli me >/dev/null 2>&1; then
    project_id=$(neon_cli projects list --output json 2>/dev/null | python3 -c '
import json, sys
d = json.load(sys.stdin)
ps = d.get("projects", d) if isinstance(d, dict) else d
ps = [p for p in ps if isinstance(p, dict) and p.get("id")]
if len(ps) == 1:
    print(ps[0]["id"])
elif ps:
    sys.stderr.write("Più progetti Neon: " + ", ".join(p.get("name", "?") + " (" + p["id"] + ")" for p in ps) + "\n")
' || true)
    if [[ -z "$project_id" ]]; then read -rp "ID del progetto Neon (o invio per incollare la stringa): " project_id || project_id=""; fi
    if [[ -n "$project_id" ]]; then
      BOOT_OWNER_URL=$(neon_cli connection-string --project-id "$project_id" --pooled=false --ssl require 2>/dev/null || true)
      if [[ -n "$BOOT_OWNER_URL" ]]; then export BOOT_OWNER_URL; ok "stringa diretta Neon ricavata con neonctl (non mostrata)"; fi
    fi
  fi
fi
ask_secret BOOT_OWNER_URL "Stringa DIRETTA Neon del proprietario del database (senza -pooler)"
[[ "$BOOT_OWNER_URL" =~ ^postgres(ql)?:// ]] || die "la stringa deve iniziare con postgres:// o postgresql://"
[[ "$BOOT_OWNER_URL" != *-pooler* ]] || die "serve la stringa DIRETTA (senza -pooler)"
prod_db=$(pg_url_database BOOT_OWNER_URL)
[[ -n "$prod_db" ]] || die "la stringa Neon deve indicare il nome del database"

if $reuse_app_s3; then
  [[ -z "${BACKUP_S3_ACCESS_KEY_ID:-}" ]] || die "--reuse-app-s3 e BACKUP_S3_* impostati insieme: scegli una sola strada"
  for v in ENDPOINT ACCESS_KEY_ID SECRET_ACCESS_KEY; do
    cur="S3_$v"; val="${!cur:-}"
    if [[ -z "$val" && -f "$root/.env.local" ]]; then val=$(sed -nE "s/^S3_$v=//p" "$root/.env.local" | tail -1 | tr -d "\"'"); fi
    [[ -n "$val" ]] || die "S3_$v non trovata nell'ambiente né in .env.local: usa una coppia dedicata (BACKUP_S3_*)"
    export "BACKUP_S3_$v=$val"
  done
  echo "RIUSO DELLE CHIAVI DELL'APP per i backup: meno sicuro (non sono revocabili separatamente; le chiavi S3 di Supabase hanno"
  echo "comunque accesso a tutti i bucket). Il default sono chiavi dedicate. Per consentire il riuso scrivi esattamente:  RIUSA CHIAVI APP"
  read -rp "> " phrase || phrase=""
  [[ "$phrase" == "RIUSA CHIAVI APP" ]] || die "consenso non dato: uso solo chiavi dedicate (BACKUP_S3_*)"
  export ALLOW_SAME_S3_KEY=true
else
  ask_secret BACKUP_S3_ENDPOINT "BACKUP_S3_ENDPOINT (https://<ref>.storage.supabase.co/storage/v1/s3)"
  ask_secret BACKUP_S3_ACCESS_KEY_ID "BACKUP_S3_ACCESS_KEY_ID (coppia DEDICATA ai backup)"
  ask_secret BACKUP_S3_SECRET_ACCESS_KEY "BACKUP_S3_SECRET_ACCESS_KEY"
fi

# ===========================================================================================================================
say "2. Ispezione in SOLA LETTURA di Neon e del bucket"
server_num=$(sql_ro BOOT_OWNER_URL "show server_version_num") || die "connessione a Neon non riuscita"
server_major=$((server_num / 10000))
client_major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
db_check=$(sql_ro BOOT_OWNER_URL "select current_database()")
[[ "$db_check" == "$prod_db" ]] || die "il database a cui sono connesso non coincide con quello della stringa"
ok "connesso (sola lettura) al database \"$prod_db\": PostgreSQL $server_major, client locale $client_major, workflow PG_MAJOR=$pg_major_wanted"
(( client_major >= server_major )) || blocker "pg_dump/pg_restore locali ($client_major) più vecchi del server ($server_major): installa il client $server_major"
(( server_major <= pg_major_wanted )) || blocker "Neon è alla $server_major ma il workflow installa la $pg_major_wanted: alza PG_MAJOR in backup.yml"

migrated=$(sql_ro BOOT_OWNER_URL "select to_regnamespace('drizzle') is not null")
if [[ "$migrated" != "t" ]]; then
  blocker "le migrazioni non risultano applicate (schema drizzle assente). Questo script NON le applica mai: avvia il sito una volta (le applica all'avvio) oppure, dopo aver letto cosa contengono (cartella drizzle/), lancia 'DATABASE_URL_DIRECT=<stringa diretta> npm run db:migrate' tu stesso"
fi

reader="backup_reader"
reader_exists=$(sql_ro BOOT_OWNER_URL "select exists (select 1 from pg_roles where rolname = 'backup_reader')")
if [[ "$reader_exists" == "t" ]]; then
  if $new_reader; then
    reader="backup_reader_$(date -u +%Y%m%d)"
    taken=$(sql_ro BOOT_OWNER_URL "select exists (select 1 from pg_roles where rolname = '$reader')")
    [[ "$taken" != "t" ]] || reader="${reader}_$(openssl rand -hex 2)"
    warn "backup_reader esiste già e NON verrà toccato (password inclusa). Userò un ruolo NUOVO: $reader"
  else
    blocker "il ruolo backup_reader esiste già: non ne cambio la password (romperebbe un eventuale secret già in uso). Rotazione sicura: rilancia con --new-reader-role (crea un ruolo nuovo, imposta il secret solo dopo le verifiche; il vecchio resta valido finché non lo elimini tu)"
  fi
fi

tmp_db=""
if $restore_to_url; then
  ask_secret BOOT_RESTORE_URL "Stringa diretta del branch/database VUOTO di prova"
  [[ "$(pg_url_identity BOOT_RESTORE_URL)" != "$(pg_url_identity BOOT_OWNER_URL)" ]] || die "il database di prova coincide con quello vero: rifiutato"
  restore_desc="un database VUOTO indicato da te (non viene creato né eliminato nulla)"
else
  tmp_db="restore_rehearsal_$(date -u +%Y%m%d%H%M%S)_$(openssl rand -hex 3)"
  [[ "$tmp_db" =~ ^restore_rehearsal_[0-9]{14}_[0-9a-f]{6}$ && "$tmp_db" != "$prod_db" ]] || die "nome del database di prova non valido"
  restore_desc="un database di prova NUOVO: \"$tmp_db\""
fi

bucket_ro=$(CHECK_READONLY=true "$here/check-bucket.sh" 2>&1 | tail -1) || true
printf '  bucket: %s\n' "$bucket_ro"

# ===========================================================================================================================
say "3. Riepilogo di ciò che farebbe/farà --apply"
cat <<SUMMARY
  Database Neon : "$prod_db" (PostgreSQL $server_major)       Repository: $repo
  Ruolo lettura : $reader $([[ "$reader_exists" == t && $new_reader == false ]] && echo '(ESISTE: bloccante)' || echo '(da creare)')
  Database prova: $restore_desc

  Operazioni in ordine (ognuna richiede conferma esplicita in --apply):
   a. [locale ] chiave age: $([[ -e $key_file ]] && echo "riuso ${key_file/#$HOME/~}" || echo "creazione di ${key_file/#$HOME/~} (600)")
   b. [Neon   ] CREATE ROLE $reader LOGIN PASSWORD <verificatore SCRAM, password casuale mai mostrata>
   c. [Neon   ] GRANT di sola lettura a $reader su "$prod_db" (CONNECT, USAGE, SELECT + privilegi di default per le migrazioni future)
   d. [Neon   ] sola lettura: backup con $reader, controllo permessi, decifratura di prova
   e. [Neon   ] $([[ -n $tmp_db ]] && echo "CREATE DATABASE \"$tmp_db\"" || echo "nessuna creazione")  → ripristino SOLO lì → confronto dei conteggi
   f. [Neon   ] $([[ -n $tmp_db ]] && echo "DROP DATABASE \"$tmp_db\" (solo quello creato da questa esecuzione)" || echo "nessuna eliminazione")
   g. [GitHub ] secret set (valori da stdin): BACKUP_DATABASE_URL, BACKUP_AGE_PUBLIC_KEY, BACKUP_S3_ENDPOINT,
                BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY
  NON viene mai fatto: migrazioni, ALTER ROLE / cambio password di ruoli esistenti, modifica di database esistenti, BACKUP_ENABLED.
SUMMARY

if [[ "$mode" == dry ]]; then
  say "4. Simulazioni locali (DRY-RUN: nessuna modifica)"
  sim_key="$work/sim-key.txt"
  age-keygen -o "$sim_key" >/dev/null 2>&1
  sim_pub=$(age-keygen -y "$sim_key")
  echo "prova" > "$work/sim.txt"
  age -r "$sim_pub" -o "$work/sim.age" "$work/sim.txt"
  [[ "$(age -d -i "$sim_key" "$work/sim.age")" == "prova" ]] || die "simulazione age fallita"
  ok "cifratura/decifratura age simulata con una coppia temporanea (nessun file di chiave persistente creato)"
  BOOT_READER_PW=$(openssl rand -hex 24) python3 - <<'PY' >/dev/null
import hashlib, hmac, os
pw = os.environ["BOOT_READER_PW"].encode()
sp = hashlib.pbkdf2_hmac("sha256", pw, os.urandom(16), 4096)
hmac.new(sp, b"Client Key", "sha256").digest()
PY
  ok "verificatore SCRAM calcolabile in locale"
  with_pg_url_ro BOOT_OWNER_URL true && ok "conversione stringa → variabili libpq riuscita (nessun URL negli argomenti dei processi)"
  if ((${#blockers[@]})); then
    echo; warn "Prima di --apply risolvi: ${#blockers[@]} bloccante/i (elencati sopra)."
  else
    echo; ok "nessun bloccante: --apply può partire (richiederà conferme)"
  fi
  echo "DRY-RUN terminato: nessuna scrittura su Neon, GitHub o file persistenti."
  exit 0
fi

# ===========================================================================================================================
((${#blockers[@]} == 0)) || die "ci sono bloccanti (sopra): nessuna modifica eseguita"
mode=apply   # da qui in poi le scritture sono consentite, ma solo dopo la conferma generale e quelle di ogni operazione
say "4. Conferma generale"
read -rp "Per procedere digita il nome del database Neon (\"$prod_db\"), oppure invio per annullare: " typed || typed=""
[[ "$typed" == "$prod_db" ]] || die "annullato: nessuna modifica eseguita"

command -v "$GH" >/dev/null || die "gh non installato"
if ! "$GH" auth status >/dev/null 2>&1; then
  echo "gh non è autenticato: apro il login nel browser (serve solo per scrivere i secret del repository)."
  "$GH" auth login --web --git-protocol https || die "login gh non riuscito: nessuna modifica eseguita"
fi

say "5. Chiavi age (locale)"
if [[ -e "$key_file" ]]; then
  ok "riuso la chiave esistente (${key_file/#$HOME/~})"
else
  confirm "Creo la coppia di chiavi age in ${key_file/#$HOME/~}?" || die "annullato"
  "$here/setup-age-key.sh" "$key_file" >/dev/null
  ok "creata la chiave privata (permessi 600, non stampata): COPIALA OFFLINE"
fi
export BACKUP_AGE_PUBLIC_KEY
BACKUP_AGE_PUBLIC_KEY=$(age-keygen -y "$key_file")
[[ "$BACKUP_AGE_PUBLIC_KEY" == age1* ]] || die "chiave pubblica non valida"

say "6. Ruolo di sola lettura su Neon"
confirm "Creo il ruolo $reader su Neon (CREATE ROLE, sola lettura, password casuale)?" || die "annullato"
export BOOT_READER_PW BOOT_VERIFIER
BOOT_READER_PW=$(openssl rand -hex 24)
BOOT_VERIFIER=$(python3 - <<'PY'
import base64, hashlib, hmac, os
pw = os.environ["BOOT_READER_PW"].encode()
salt, it = os.urandom(16), 4096
sp = hashlib.pbkdf2_hmac("sha256", pw, salt, it)
ck = hmac.new(sp, b"Client Key", "sha256").digest()
sk = hmac.new(sp, b"Server Key", "sha256").digest()
b = lambda x: base64.b64encode(x).decode()
print(f"SCRAM-SHA-256${it}:{b(salt)}${b(hashlib.sha256(ck).digest())}:{b(sk)}")
PY
)
# la password è già un verificatore SCRAM calcolato qui: in chiaro non arriva mai al server né ai suoi log
sql_rw BOOT_OWNER_URL -v reader="$reader" <<'SQL'
\set v `printf %s "$BOOT_VERIFIER"`
select format('create role %I login password %L', :'reader', :'v') \gexec
SQL
ok "ruolo $reader creato"
confirm "Concedo a $reader i soli permessi di lettura su \"$prod_db\" (setup-backup-reader.sql)?" || die "annullato (il ruolo $reader resta creato, senza permessi)"
sql_rw BOOT_OWNER_URL -v reader="$reader" -f "$here/setup-backup-reader.sql"
ok "permessi concessi"

export BACKUP_DATABASE_URL
BACKUP_DATABASE_URL=$(NEWUSER="$reader" NEWPW="$BOOT_READER_PW" python3 - <<'PY'
import os
from urllib.parse import urlsplit, urlunsplit, quote
u = urlsplit(os.environ["BOOT_OWNER_URL"])
host = u.hostname + (f":{u.port}" if u.port else "")
print(urlunsplit((u.scheme, f"{quote(os.environ['NEWUSER'])}:{quote(os.environ['NEWPW'])}@{host}", u.path, u.query, "")))
PY
)

say "7. Verifica dei permessi e backup reale (sola lettura)"
with_pg_url_ro BACKUP_DATABASE_URL psql -v ON_ERROR_STOP=1 -q -f "$here/check-permissions.sql" 2>&1 | sed 's/^psql:[^ ]* //' || die "permessi non corretti"
ok "permessi corretti"
BACKUP_OUT_DIR="$work/out" "$here/backup.sh" | sed -E 's#(creato: ).*/#\1#'
dump_age="$work/out/$(cat "$work/out/LATEST")"
age -d -i "$key_file" -o "$work/check.dump" "$dump_age"
pg_restore --list "$work/check.dump" >/dev/null
rm -f "$work/check.dump"
ok "backup cifrato, decifrato con la chiave privata e leggibile"

say "8. Prova di ripristino"
if $restore_to_url; then
  export RESTORE_DATABASE_URL="$BOOT_RESTORE_URL"
else
  confirm "Creo il database di prova \"$tmp_db\" su Neon (CREATE DATABASE) e ci ripristino il backup?" || die "annullato"
  exists=$(sql_ro BOOT_OWNER_URL "select exists (select 1 from pg_database where datname = '$tmp_db')")
  [[ "$exists" != "t" ]] || die "il database $tmp_db esiste già: non lo tocco"
  sql_rw BOOT_OWNER_URL -c "create database \"$tmp_db\""
  created_db="$tmp_db"
  ok "creato il database di prova \"$tmp_db\" (il database vero non viene toccato)"
  RESTORE_DATABASE_URL=$(NEWDB="/$tmp_db" python3 - <<'PY'
import os
from urllib.parse import urlsplit, urlunsplit
u = urlsplit(os.environ["BOOT_OWNER_URL"])
print(urlunsplit((u.scheme, u.netloc, os.environ["NEWDB"], u.query, "")))
PY
)
  export RESTORE_DATABASE_URL
fi
BOOT_RESTORE_URL="$RESTORE_DATABASE_URL"
AGE_IDENTITY_FILE="$key_file" "$here/restore.sh" "$dump_age" | tail -1
with_pg_url_ro BOOT_OWNER_URL psql -Atq -f "$here/verify.sql" > "$work/v_src.txt"
with_pg_url_ro BOOT_RESTORE_URL psql -Atq -f "$here/verify.sql" > "$work/v_dst.txt"
if diff -q "$work/v_src.txt" "$work/v_dst.txt" >/dev/null; then
  ok "conteggi del ripristino IDENTICI a quelli del database vero ($(wc -l < "$work/v_src.txt" | tr -d ' ') controlli)"
else
  diff "$work/v_src.txt" "$work/v_dst.txt" || true
  die "il ripristino NON coincide con l'originale: non imposto i secret"
fi
if [[ -n "$created_db" ]]; then
  # si elimina SOLO il database creato da questa esecuzione, con nome del formato atteso e diverso da quello vero
  if [[ "$created_db" =~ ^restore_rehearsal_[0-9]{14}_[0-9a-f]{6}$ && "$created_db" != "$prod_db" ]] \
     && confirm "Elimino il database di prova \"$created_db\" (creato da questo script)?"; then
    sql_rw BOOT_OWNER_URL -c "drop database \"$created_db\""
    ok "database di prova eliminato"
    created_db=""
  else
    echo "Database di prova lasciato: $created_db"
  fi
fi

say "9. Bucket Supabase dei backup (scrive e cancella solo oggetti di prova sotto healthcheck/)"
[[ -d "$root/node_modules" ]] || (cd "$root" && npm ci --silent)
"$here/check-bucket.sh"

say "10. Secret GitHub"
confirm "Imposto i 5 secret BACKUP_* sul repository $repo?" || die "annullato: i secret NON sono stati scritti"
for s in BACKUP_DATABASE_URL BACKUP_AGE_PUBLIC_KEY BACKUP_S3_ENDPOINT BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
  printf '%s' "${!s}" | "$GH" secret set "$s" --repo "$repo" >/dev/null && ok "$s impostato"
done
"$here/check-config.sh" || true

cat <<'DONE'

Fatto. Restano a mano:
  - copiare la chiave privata age in un posto OFFLINE;
  - dopo il merge: Actions → Backup database → Run workflow (deve essere verde);
  - solo dopo, impostare la variabile di repository BACKUP_ENABLED=true per attivare i backup notturni.
DONE
