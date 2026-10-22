#!/usr/bin/env bash
# Chiama la rotta di recupero automatico delle notifiche email del sito (usata da .github/workflows/notify-retry.yml).
#
# Variabili (da GitHub Actions; mai scritte nel repository):
#   NOTIFY_RETRY_URL    indirizzo del sito, solo origine: https://<sito>
#   NOTIFY_RETRY_TOKEN  token condiviso con il sito (segreto)
#
# Protezione dall'esfiltrazione del token: l'origine in NOTIFY_RETRY_URL deve coincidere ESATTAMENTE con una riga di
# scripts/notify-retry/allowed-origins.txt (file nel repository, modificabile solo con una PR). Altrimenti lo script si
# ferma prima di qualsiasi richiesta di rete. Nessun redirect viene seguito. (NOTIFY_RETRY_ALLOWED_ORIGINS_FILE esiste
# solo per i test e non è impostato dal workflow.)
#
# Il token viaggia SOLO nell'intestazione Authorization, passata a curl tramite standard input (--config -):
# non compare nell'URL, negli argomenti del processo né nei log. La risposta del sito (solo conteggi) viene riassunta;
# in caso di errore non viene stampato il corpo della risposta.
# Uscita 0 = il sito ha risposto 200 (anche se alcuni invii sono falliti: in quel caso c'è un avviso, e il giro dopo riprova).
set -euo pipefail

: "${NOTIFY_RETRY_URL:?NOTIFY_RETRY_URL mancante (variabile di repository)}"
: "${NOTIFY_RETRY_TOKEN:?NOTIFY_RETRY_TOKEN mancante (secret di repository)}"

base="${NOTIFY_RETRY_URL%/}"
if ! [[ "$base" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ || "$base" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
  echo "::error::NOTIFY_RETRY_URL non valido: deve essere solo l'origine https://… del sito (senza percorso)"
  exit 1
fi
allowed_file="${NOTIFY_RETRY_ALLOWED_ORIGINS_FILE:-$(dirname "${BASH_SOURCE[0]}")/allowed-origins.txt}"
if ! [ -r "$allowed_file" ] || ! grep -v '^[[:space:]]*#' "$allowed_file" | grep -Fxq -- "$base"; then
  echo "::error::NOTIFY_RETRY_URL non è tra le origini autorizzate (scripts/notify-retry/allowed-origins.txt): il token NON è stato inviato"
  exit 1
fi
endpoint="$base/api/internal/notifications/retry"

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

# --retry: errori di rete/timeout/5xx si ripetono (sicuro: il sito prenota ogni notifica in modo atomico)
status="$(printf 'header = "Authorization: Bearer %s"\n' "$NOTIFY_RETRY_TOKEN" |
  curl --silent --show-error --config - --request POST --max-time 30 \
    --retry 2 --retry-delay 5 --retry-connrefused --max-redirs 0 \
    --output "$body" --write-out '%{http_code}' "$endpoint")" || {
  echo "::error::Sito non raggiungibile o richiesta non riuscita"
  exit 1
}

case "$status" in
  200) ;;
  401)
    echo "::error::Token rifiutato (401): NOTIFY_RETRY_TOKEN su GitHub e su Netlify devono coincidere"
    exit 1
    ;;
  404)
    echo "::error::Recupero non attivo sul sito (404): su Netlify manca NOTIFY_RETRY_TOKEN o è più corto di 32 caratteri"
    exit 1
    ;;
  429)
    echo "::error::Troppe richieste (429)"
    exit 1
    ;;
  *)
    echo "::error::Risposta inattesa dal sito (HTTP $status)"
    exit 1
    ;;
esac

# la risposta è JSON con soli conteggi: si leggono i numeri senza dipendere da jq
num() { sed -n "s/.*\"$1\":\([0-9][0-9]*\).*/\1/p" "$body" | head -n 1; }
configured="false"
grep -q '"configured":true' "$body" && configured="true"
candidates="$(num candidates)"
sent="$(num sent)"
failed="$(num failed)"
unsent="$(num unsent)"
throttled="$(num throttled)"
echo "Notifiche: recuperabili=${candidates:-?} inviate=${sent:-?} fallite=${failed:-?} sospese=${throttled:-0} ancora senza notifica=${unsent:-?}"

if [ "$configured" != "true" ]; then
  echo "::warning::Le notifiche email non sono configurate sul sito (RESEND_API_KEY, NOTIFY_EMAIL_TO): nessun recupero eseguito"
elif [ "${failed:-0}" != "0" ] || [ "${unsent:-0}" != "0" ]; then
  echo "::warning::Ci sono notifiche non ancora inviate (fallite=${failed:-?}, senza notifica=${unsent:-?}): controlla il back office e la configurazione di Resend"
fi
if [ "${throttled:-0}" != "0" ]; then
  echo "::warning::${throttled} notifiche sospese per il limite giornaliero (NOTIFY_DAILY_LIMIT): ripartono dal giorno UTC successivo; se succede spesso verifica un possibile abuso"
fi
