# shellcheck shell=bash
# Libreria (da "source"): converte una stringa postgres:// in variabili d'ambiente libpq (PGHOST, PGUSER, PGPASSWORD…),
# così la password NON compare mai tra gli argomenti dei processi (visibili con `ps` ad altri utenti della macchina).
#
#   source pg-env.sh
#   with_pg_url BACKUP_DATABASE_URL psql -Atc "select 1"      # il nome della VARIABILE, non il suo valore
#
# Parametri dell'URL supportati: sslmode, channel_binding, options, connect_timeout, application_name. Altri → errore.

pg_env_exports() { # pg_env_exports NOME_VARIABILE → stampa gli `export` da valutare in una subshell
  URL="${!1}" python3 -c '
import os, shlex, sys
from urllib.parse import urlsplit, unquote, parse_qsl
u = urlsplit(os.environ["URL"])
if u.scheme not in ("postgres", "postgresql") or not u.hostname:
    sys.exit("stringa di connessione non valida")
env = {"PGHOST": u.hostname}
if u.port: env["PGPORT"] = str(u.port)
if u.username: env["PGUSER"] = unquote(u.username)
if u.password: env["PGPASSWORD"] = unquote(u.password)
if u.path and u.path != "/": env["PGDATABASE"] = unquote(u.path[1:])
known = {"sslmode": "PGSSLMODE", "channel_binding": "PGCHANNELBINDING", "options": "PGOPTIONS",
         "connect_timeout": "PGCONNECT_TIMEOUT", "application_name": "PGAPPNAME"}
for k, v in parse_qsl(u.query):
    if k not in known:
        sys.exit("parametro non supportato nella stringa di connessione: " + k)
    env[known[k]] = v
for k, v in env.items():
    print("export %s=%s" % (k, shlex.quote(v)))
'
}

with_pg_url() { # with_pg_url NOME_VARIABILE comando [argomenti…]
  local var="$1"; shift
  local exports
  exports=$(pg_env_exports "$var") || return 1
  ( eval "$exports"; "$@" )
}

with_pg_url_ro() { # come with_pg_url, ma la sessione è in SOLA LETTURA: qualsiasi scrittura viene rifiutata dal server
  local var="$1"; shift
  local exports
  exports=$(pg_env_exports "$var") || return 1
  ( eval "$exports"; export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on"; "$@" )
}

pg_url_database() { # nome del database contenuto nella stringa (per i controlli di sicurezza)
  URL="${!1}" python3 -c '
import os
from urllib.parse import urlsplit, unquote
print(unquote(urlsplit(os.environ["URL"]).path[1:]))'
}

pg_url_identity() { # host:porta/database, per confrontare due stringhe senza stamparne le credenziali
  URL="${!1}" python3 -c '
import os
from urllib.parse import urlsplit, unquote
u = urlsplit(os.environ["URL"])
print("%s:%s/%s" % (u.hostname, u.port or 5432, unquote(u.path[1:])))'
}

# --- Python su Windows (Git Bash) ---------------------------------------------------------------------------------------
# Su Windows "python3" può mancare o essere l'alias di Microsoft Store; l'interprete nativo scrive "\r\n": i \r finirebbero nei valori
# catturati con $(...) (URL, impostazioni). Qui si risolve un vero Python 3 e si definisce una funzione python3 che toglie i \r.
ensure_python3() {
  local v cmd exe
  for cmd in "python3" "python" "py -3"; do
    # shellcheck disable=SC2086  # "py -3" va diviso di proposito
    v=$($cmd -c 'import sys; print(sys.version_info[0])' 2>/dev/null | tr -d '\r')
    if [[ "$v" == 3 ]]; then
      case "$(uname -s 2>/dev/null)" in
        MINGW*|MSYS*|CYGWIN*)
          # percorso ASSOLUTO dell'interprete vero: evita di richiamare per nome l'alias del Microsoft Store ("Python non è stato trovato")
          # shellcheck disable=SC2086
          exe=$($cmd -c 'import sys; print(sys.executable)' 2>/dev/null | tr -d '\r')
          [[ -n "$exe" ]] && command -v cygpath >/dev/null 2>&1 && exe=$(cygpath -u "$exe" 2>/dev/null || printf '%s' "$exe")
          if [[ -n "$exe" && -x "$exe" ]]; then
            eval "python3() { command '$exe' \"\$@\" | tr -d '\\r'; }"
          else
            eval "python3() { command $cmd \"\$@\" | tr -d '\\r'; }"
          fi ;;
        *) [[ "$cmd" == python3 ]] || eval "python3() { command $cmd \"\$@\"; }" ;;
      esac
      return 0
    fi
  done
  return 1
}
ensure_python3 || true
