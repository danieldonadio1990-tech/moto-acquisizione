/**
 * Email di PROVA per verificare le notifiche dopo la configurazione.
 *
 *   npm run notify:test                (anteprima: mostra cosa farebbe, NON invia)
 *   npm run notify:test -- --yes       (invia UNA email di prova)
 *
 * Protezioni:
 *  - invia solo al destinatario configurato in NOTIFY_EMAIL_TO (nessuna opzione per indicarne un altro);
 *  - senza --yes non spedisce nulla;
 *  - non apre il database: non crea richieste e non legge né modifica dati dei clienti;
 *  - il messaggio è marcato [PROVA] e non contiene dati personali.
 *
 * Variabili: RESEND_API_KEY, NOTIFY_EMAIL_TO, (NOTIFY_EMAIL_FROM). Si leggono dall'ambiente o da .env.local
 * (il file è ignorato da git: non committare mai la chiave). Su Netlify le variabili stanno solo nel pannello:
 * per provarle in locale vanno impostate nel proprio .env.local, oppure si verifica con una richiesta di prova sul sito.
 */
import { randomUUID } from "node:crypto";
import { loadNotificationConfig } from "@/modules/notifications/config";
import { ResendTransport } from "@/modules/notifications/transport";
import { siteUrl } from "@/config/business";

async function main() {
  const send = process.argv.includes("--yes");
  const cfg = loadNotificationConfig();
  if (!cfg.enabled) {
    console.error(`✗ Notifiche non configurate: ${cfg.reasons.join("; ")}`);
    process.exit(1);
  }

  const to = cfg.to.join(", ");
  console.log(`Mittente:     ${cfg.from}`);
  console.log(`Destinatario: ${to}`);
  if (!send) {
    console.log("\nAnteprima: nessuna email inviata. Per inviare la prova: npm run notify:test -- --yes");
    return;
  }

  const result = await new ResendTransport(cfg.apiKey).send({
    from: cfg.from,
    to: cfg.to,
    subject: "[PROVA] Notifiche Compro Moto",
    text: [
      "Questa è un'email di prova delle notifiche di Compro Moto.",
      "Non è stata creata nessuna richiesta e non contiene dati di clienti.",
      "",
      `Back office: ${new URL("/admin", siteUrl()).toString()}`,
    ].join("\n"),
    idempotencyKey: `notify-test-${randomUUID()}`,
  });

  if (result.ok) {
    console.log(`✓ Email di prova inviata${result.id ? ` (id ${result.id})` : ""}. Controlla la casella di ${to} (anche lo spam).`);
    return;
  }
  console.error(`✗ Invio non riuscito: ${result.code}`);
  if (result.code === "http_403") {
    console.error(
      "  Con il mittente di prova di Resend (onboarding@resend.dev) si può scrivere solo all'indirizzo con cui è registrato l'account Resend.",
    );
  } else if (result.code === "http_401") {
    console.error("  Chiave API non valida o revocata.");
  }
  process.exit(1);
}

main().catch(() => {
  console.error("✗ Errore imprevisto durante la prova (nessun dato è stato modificato).");
  process.exit(1);
});
