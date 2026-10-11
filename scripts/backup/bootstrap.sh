#!/usr/bin/env bash
# Configurazione guidata e collaudo del backup, SUL TUO COMPUTER. Un solo comando:
#
#   scripts/backup/bootstrap.sh [--dry-run] [--neon-auto] [--reuse-app-s3] [--restore-to-url]
#
#   --dry-run         prova completa senza scrivere i secret su GitHub (non serve gh)
#   --neon-auto       niente copia della stringa Neon: usa `neonctl` (login nel browser, gratuito) per ricavare quella diretta
#                     del progetto; se non riesce, la chiede a schermo nascosto. NON ancora provato contro Neon reale.
#   --reuse-app-s3    niente nuova coppia di chiavi Supabase: riusa quella dell'app (S3_* nell'ambiente o in .env.local).
#                     Meno sicuro: non è revocabile separatamente (le chiavi S3 di Supabase hanno comunque accesso a tutti i bucket).
#   --restore-to-url  ripristina su un branch/database vuoto indicato da te invece di crearne uno di prova
#   Se gh non è autenticato, parte il login nel browser (una sola autorizzazione).
#
# Cosa fa (nessun valore viene mai stampato; i segreti si digitano a schermo nascosto, non passano da chat né da file):
#   1. crea (o riusa) la coppia di chiavi age: la privata resta in ~/.config/moto-acquisizione/backup-age-key.txt (600)
#   2. con la stringa DIRETTA di Neon del proprietario: crea il ruolo di sola lettura backup_reader con una password casuale
#      (la password non viene mostrata: finisce solo nel secret GitHub) e gli dà i permessi (setup-backup-reader.sql)
#   3. verifica i permessi, esegue un backup REALE in sola lettura (pg_dump → age) e controlla che si decifri
#   4. prova di ripristino: crea un database di prova VUOTO nello stesso progetto Neon (o usa l'URL di un branch vuoto che
#      indichi tu con --restore-to-url), ripristina, confronta i conteggi con verify.sql e poi elimina il database di prova
#   5. prova il bucket Supabase dei backup con le chiavi DEDICATE
#   6. solo se tutto è riuscito imposta i 5 secret GitHub (BACKUP_*) con `gh`
# Non imposta BACKUP_ENABLED: va fatto a mano dopo la prova.
#
# Prima serve (a mano, una volta): in Supabase → Storage → S3 Connection una NUOVA coppia di chiavi per i backup
# (non quelle dell'app) e il bucket privato "backups".
set -euo pipefail
umask 077

dry_run=false
restore_to_url=false
neon_auto=false
reuse_app_s3=false
for a in "$@"; do
  case "$a" in
    --dry-run) dry_run=true ;;
    --restore-to-url) restore_to_url=true ;;
    --neon-auto) neon_auto=true ;;
    --reuse-app-s3) reuse_app_s3=true ;;
    *) echo "Argomento sconosciuto: $a" >&2; exit 2 ;;
  esac
done

repo="${GITHUB_REPOSITORY:-danieldonadio1990-tech/moto-acquisizione}"
GH="${GH:-gh}"
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
key_file="${BACKUP_AGE_KEY_FILE:-$HOME/.config/moto-acquisizione/backup-age-key.txt}"
pg_major_wanted=$(sed -nE 's/^ *PG_MAJOR: *"([0-9]+)".*/\1/p' "$root/.github/workflows/backup.yml" | head -1)
work=$(mktemp -d)
created_db=""
cleanup() { rm -rf "$work"; }
trap cleanup EXIT

say()  { printf '\n== %s\n' "$1"; }
ok()   { printf '✓ %s\n' "$1"; }
die()  { printf '✗ %s\n' "$1" >&2; exit 1; }
ask_secret() { # ask_secret VARIABILE "domanda"  (usa la variabile d'ambiente se già impostata)
  local var="$1" prompt="$2" val
  if [[ -z "${!var:-}" ]]; then
    read -rsp "$prompt: " val; echo
    [[ -n "$val" ]] || die "$var vuoto"
    export "$var=$val"
  fi
}
confirm() { local r; read -rp "$1 [s/N] " r; [[ "$r" == [sS] ]]; }

say "0. Controlli preliminari"
for t in age age-keygen psql pg_dump pg_restore openssl python3 npm; do
  command -v "$t" >/dev/null || die "$t non installato"
done
if ! $dry_run; then
  command -v "$GH" >/dev/null || die "gh non installato"
  if ! "$GH" auth status >/dev/null 2>&1; then
    echo "gh non è autenticato: apro il login nel browser (serve per scrivere i secret del repository)."
    "$GH" auth login --web --git-protocol https || die "login gh non riuscito"
  fi
fi
ok "strumenti presenti"

say "1. Chiavi age"
if [[ -e "$key_file" ]]; then
  ok "riuso la chiave esistente (${key_file/#$HOME/~})"
else
  "$here/setup-age-key.sh" "$key_file" >/dev/null
  ok "creata la chiave privata in ${key_file/#$HOME/~} (permessi 600, non stampata): COPIALA OFFLINE"
fi
export BACKUP_AGE_PUBLIC_KEY
BACKUP_AGE_PUBLIC_KEY=$(age-keygen -y "$key_file")
[[ "$BACKUP_AGE_PUBLIC_KEY" == age1* ]] || die "chiave pubblica non valida"

say "2. Neon: ruolo backup_reader"
if $neon_auto && [[ -z "${BOOT_OWNER_URL:-}" ]]; then
  neon_cli() { npx --yes neonctl@latest "$@"; }
  if ! neon_cli me >/dev/null 2>&1; then
    echo "Login Neon nel browser (gratuito, una volta sola)."
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
    if [[ -z "$project_id" ]]; then read -rp "ID del progetto Neon (o invio per incollare la stringa): " project_id; fi
    if [[ -n "$project_id" ]]; then
      BOOT_OWNER_URL=$(neon_cli connection-string --project-id "$project_id" --pooled=false --ssl require 2>/dev/null || true)
      [[ -n "$BOOT_OWNER_URL" ]] && export BOOT_OWNER_URL && ok "stringa diretta Neon ricavata con neonctl (non mostrata)"
    fi
  fi
fi
ask_secret BOOT_OWNER_URL "Stringa DIRETTA Neon del proprietario del database (senza -pooler; digitazione nascosta)"
[[ "$BOOT_OWNER_URL" =~ ^postgres(ql)?:// ]] || die "la stringa deve iniziare con postgres:// o postgresql://"
[[ "$BOOT_OWNER_URL" != *-pooler* ]] || die "serve la stringa DIRETTA (senza -pooler)"
server_num=$(psql "$BOOT_OWNER_URL" -Atqc "show server_version_num") || die "connessione al database non riuscita"
server_major=$((server_num / 10000))
client_major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
ok "connesso: PostgreSQL $server_major (client locale $client_major, workflow PG_MAJOR=$pg_major_wanted)"
(( client_major >= server_major )) || die "pg_dump/pg_restore locali ($client_major) più vecchi del server ($server_major): installa il client $server_major (es. brew install postgresql@$server_major)"
(( server_major <= pg_major_wanted )) || die "Neon è alla $server_major ma il workflow installa la $pg_major_wanted: alza PG_MAJOR in backup.yml"

if [[ "$(psql "$BOOT_OWNER_URL" -Atqc "select to_regnamespace('drizzle') is not null")" != "t" ]]; then
  echo "Le migrazioni non risultano applicate (schema drizzle assente)."
  confirm "Le applico ora su questo database con 'npm run db:migrate'?" || die "applica prima le migrazioni (primo avvio del sito o npm run db:migrate)"
  [[ -d "$root/node_modules" ]] || (cd "$root" && npm ci --silent)
  (cd "$root" && DATABASE_URL_DIRECT="$BOOT_OWNER_URL" npm run --silent db:migrate)
  ok "migrazioni applicate"
fi

export BOOT_READER_PW
BOOT_READER_PW=$(openssl rand -hex 24)
role_exists=$(psql "$BOOT_OWNER_URL" -Atqc "select exists (select 1 from pg_roles where rolname = 'backup_reader')")
if [[ "$role_exists" == "t" ]]; then
  echo "Il ruolo backup_reader esiste già."
  confirm "Ne reimposto la password con una nuova casuale (la vecchia smette di funzionare)?" || die "interrotto: nessuna modifica al ruolo"
  verb="alter"
else
  verb="create"
fi
# la password viene trasformata in verificatore SCRAM sul tuo computer: in chiaro non arriva mai al server né ai suoi log
export BOOT_VERIFIER
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
psql "$BOOT_OWNER_URL" -v ON_ERROR_STOP=1 -q <<SQL
\\set v \`printf %s "\$BOOT_VERIFIER"\`
select format('$verb role backup_reader login password %L', :'v') \\gexec
SQL
psql "$BOOT_OWNER_URL" -v ON_ERROR_STOP=1 -q -f "$here/setup-backup-reader.sql"
ok "ruolo backup_reader pronto, con soli permessi di lettura"

export BACKUP_DATABASE_URL
BACKUP_DATABASE_URL=$(NEWUSER=backup_reader NEWPW="$BOOT_READER_PW" python3 - <<'PY'
import os
from urllib.parse import urlsplit, urlunsplit
u = urlsplit(os.environ["BOOT_OWNER_URL"])
host = u.hostname + (f":{u.port}" if u.port else "")
print(urlunsplit((u.scheme, f"{os.environ['NEWUSER']}:{os.environ['NEWPW']}@{host}", u.path, u.query, "")))
PY
)

say "3. Verifica dei permessi e backup reale (sola lettura)"
psql "$BACKUP_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$here/check-permissions.sql" 2>&1 | sed 's/^psql:[^ ]* //' || die "permessi non corretti"
ok "permessi corretti"
BACKUP_OUT_DIR="$work/out" "$here/backup.sh" | sed -E 's#(creato: ).*/#\1#'
dump_age="$work/out/$(cat "$work/out/LATEST")"
age -d -i "$key_file" -o "$work/check.dump" "$dump_age"
pg_restore --list "$work/check.dump" >/dev/null
ok "backup cifrato, decifrato con la chiave privata e leggibile"

say "4. Prova di ripristino su un database di prova VUOTO"
if $restore_to_url; then
  ask_secret BOOT_RESTORE_URL "Stringa diretta del branch/database VUOTO di prova (digitazione nascosta)"
  [[ "$BOOT_RESTORE_URL" != "$BOOT_OWNER_URL" ]] || die "l'URL di prova coincide con quello del database vero: rifiutato"
else
  created_db="restore_rehearsal_$(date -u +%Y%m%d%H%M%S)"
  psql "$BOOT_OWNER_URL" -v ON_ERROR_STOP=1 -q -c "create database \"$created_db\""
  BOOT_RESTORE_URL=$(NEWDB="/$created_db" python3 - <<'PY'
import os
from urllib.parse import urlsplit, urlunsplit
u = urlsplit(os.environ["BOOT_OWNER_URL"])
print(urlunsplit((u.scheme, u.netloc, os.environ["NEWDB"], u.query, "")))
PY
)
  ok "creato il database di prova $created_db (il database vero non viene toccato)"
fi
AGE_IDENTITY_FILE="$key_file" "$here/restore.sh" "$dump_age" "$BOOT_RESTORE_URL" | tail -1
psql "$BOOT_OWNER_URL" -Atq -f "$here/verify.sql" > "$work/v_src.txt"
psql "$BOOT_RESTORE_URL" -Atq -f "$here/verify.sql" > "$work/v_dst.txt"
if diff -q "$work/v_src.txt" "$work/v_dst.txt" >/dev/null; then
  ok "conteggi del ripristino IDENTICI a quelli del database vero ($(wc -l < "$work/v_src.txt" | tr -d ' ') controlli)"
else
  diff "$work/v_src.txt" "$work/v_dst.txt" || true
  die "il ripristino NON coincide con l'originale: non imposto i secret"
fi
if [[ -n "$created_db" ]]; then
  if confirm "Elimino il database di prova $created_db (creato da questo script)?"; then
    psql "$BOOT_OWNER_URL" -v ON_ERROR_STOP=1 -q -c "drop database \"$created_db\"" && ok "database di prova eliminato"
  else
    echo "Database di prova lasciato: $created_db (eliminalo tu quando vuoi)."
  fi
fi

say "5. Bucket Supabase dei backup (chiavi dedicate)"
if $reuse_app_s3 && [[ -z "${BACKUP_S3_ACCESS_KEY_ID:-}" ]]; then
  # S3_* dall'ambiente o da .env.local, senza stamparli
  envfile="$root/.env.local"
  for v in ENDPOINT ACCESS_KEY_ID SECRET_ACCESS_KEY; do
    cur="S3_$v"; val="${!cur:-}"
    if [[ -z "$val" && -f "$envfile" ]]; then val=$(sed -nE "s/^S3_$v=//p" "$envfile" | tail -1 | tr -d "\"'"); fi
    [[ -n "$val" ]] || die "S3_$v non trovata nell'ambiente né in .env.local: usa una coppia dedicata"
    export "BACKUP_S3_$v=$val"
  done
  export ALLOW_SAME_S3_KEY=true
  echo "! Riuso la coppia di chiavi dell'app per i backup (meno sicuro: non revocabile separatamente)."
fi
ask_secret BACKUP_S3_ENDPOINT "BACKUP_S3_ENDPOINT (https://<ref>.storage.supabase.co/storage/v1/s3)"
ask_secret BACKUP_S3_ACCESS_KEY_ID "BACKUP_S3_ACCESS_KEY_ID (coppia DEDICATA ai backup)"
ask_secret BACKUP_S3_SECRET_ACCESS_KEY "BACKUP_S3_SECRET_ACCESS_KEY"
[[ -d "$root/node_modules" ]] || (cd "$root" && npm ci --silent)
"$here/check-bucket.sh"

say "6. Secret GitHub"
set_secret() { # nome, valore da una variabile: passa da stdin, mai da argomenti
  local name="$1"
  if $dry_run; then ok "(prova) imposterei $name"; else printf '%s' "${!name}" | "$GH" secret set "$name" --repo "$repo" >/dev/null && ok "$name impostato"; fi
}
for s in BACKUP_DATABASE_URL BACKUP_AGE_PUBLIC_KEY BACKUP_S3_ENDPOINT BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
  set_secret "$s"
done
$dry_run || "$here/check-config.sh" || true

cat <<'EOF'

Fatto. Restano a mano:
  - copiare la chiave privata age in un posto OFFLINE;
  - dopo il merge: Actions → Backup database → Run workflow (deve essere verde);
  - solo dopo, impostare la variabile di repository BACKUP_ENABLED=true per attivare i backup notturni.
EOF
