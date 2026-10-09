import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import { LEGAL, PRIVACY_POLICY_IS_DRAFT, PRIVACY_POLICY_VERSION, PROVIDERS } from "@/config/business";

export const metadata: Metadata = { title: "Informativa privacy", alternates: { canonical: "/privacy" } };

/**
 * BOZZA tecnica, da far verificare a chi segue la privacy dell'azienda prima della pubblicazione.
 * Non costituisce una dichiarazione di conformità legale.
 * Se il testo cambia, aggiornare PRIVACY_POLICY_VERSION in src/config/business.ts.
 */

/** Evidenzia i segnaposto "[DA COMPLETARE…]" / "[DA CONFERMARE…]" ancora presenti nel testo. */
function T({ children }: { children: string }) {
  const parts = children.split(/(\[DA (?:COMPLETARE|CONFERMARE|VERIFICARE)[^\]]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[DA /.test(p) ? (
          <mark key={i} className="rounded bg-signal px-1 font-semibold text-asphalt">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:py-16">
      <BrandMark />
      <h1 className="display mt-10 text-5xl">Informativa privacy</h1>
      <p className="mt-3 text-sm text-concrete">Versione {PRIVACY_POLICY_VERSION}</p>

      {PRIVACY_POLICY_IS_DRAFT && (
        <p role="note" className="mt-6 rounded-xl border-2 border-asphalt bg-signal/40 p-4 text-sm font-semibold">
          Bozza in revisione: il testo e i dati evidenziati in giallo devono essere completati e verificati prima della
          pubblicazione.
        </p>
      )}

      <div className="mt-8 space-y-7 leading-relaxed text-asphalt-soft [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-asphalt [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Chi tratta i tuoi dati</h2>
          <p>
            Titolare del trattamento: <T>{LEGAL.companyName}</T>, <T>{LEGAL.address}</T>, P.IVA <T>{LEGAL.vatNumber}</T>.
            Contatti per la privacy: <T>{LEGAL.privacyEmail}</T> – PEC: <T>{LEGAL.pec}</T>.
          </p>
        </section>

        <section>
          <h2>Quali dati raccogliamo</h2>
          <ul>
            <li>
              <strong>Dati di contatto</strong>: nome, cognome, telefono, email, comune e il canale con cui preferisci
              essere ricontattato.
            </li>
            <li>
              <strong>Dati della moto</strong>: marca, modello, versione, anno, cilindrata, chilometri e le tue risposte
              sulle condizioni (funzionamento, incidenti, problemi meccanici, manutenzione).
            </li>
            <li>
              <strong>Fotografie</strong> che scegli di caricare. Possono mostrare la targa, persone o luoghi: ti
              chiediamo di inquadrare solo la moto. Dalle foto eliminiamo automaticamente i metadati, compresa la
              posizione GPS. Non ti chiediamo documenti d&apos;identità.
            </li>
            <li>
              <strong>Dati della trattativa</strong>: offerte, esito, prezzo e data dell&apos;eventuale acquisto, note
              interne del nostro team sulla tua richiesta.
            </li>
            <li>
              <strong>Provenienza</strong>: se arrivi da una nostra campagna, i parametri del link (es. il nome della
              campagna, &quot;UTM&quot;), salvati insieme alla richiesta.
            </li>
            <li>
              <strong>Consenso</strong>: data e ora in cui hai accettato questa informativa e la sua versione.
            </li>
          </ul>
          <p className="mt-2">
            Il nostro database non registra il tuo indirizzo IP. I fornitori che ospitano il sito possono conservare
            registri tecnici (log) per sicurezza e funzionamento, per un periodo limitato.
          </p>
        </section>

        <section>
          <h2>Perché li usiamo</h2>
          <ul>
            <li>
              Valutare la tua moto, ricontattarti e, se vuoi, concludere l&apos;acquisto. Base giuridica: la tua
              richiesta, cioè misure precontrattuali e contratto (art. 6.1.b GDPR).
            </li>
            <li>
              Adempiere agli obblighi fiscali e civilistici se acquistiamo la moto (art. 6.1.c GDPR).
            </li>
            <li>
              Statistiche interne aggregate per capire come migliorare il servizio e quanto rendono le nostre campagne;
              sicurezza del sito e prevenzione di abusi. Base giuridica: nostro legittimo interesse (art. 6.1.f GDPR),
              al quale puoi opporti.
            </li>
          </ul>
          <p className="mt-2">
            I dati di contatto e della moto servono per la valutazione: senza, non possiamo rispondere. Le foto sono
            facoltative. Non usiamo i tuoi dati per pubblicità, non li vendiamo e non prendiamo decisioni automatiche
            sul prezzo.
          </p>
        </section>

        <section>
          <h2>Statistiche interne</h2>
          <p>
            Contiamo in forma aggregata visite, clic e passaggi del modulo. Non usiamo cookie né strumenti di
            analisi di terze parti: il browser conserva solo un identificativo casuale, che si cancella quando chiudi la
            scheda. Questi conteggi non sono collegati al tuo nome né alla tua richiesta.
          </p>
        </section>

        <section>
          <h2>Chi può vedere i dati</h2>
          <ul>
            <li>Il nostro personale autorizzato, solo per gestire la tua richiesta.</li>
            <li>
              Fornitori tecnici che trattano i dati per nostro conto, come responsabili del trattamento: hosting del
              sito <T>{PROVIDERS.hosting}</T>; database <T>{PROVIDERS.database}</T>; archivio delle foto{" "}
              <T>{PROVIDERS.storage}</T>.
            </li>
            <li>
              <strong>WhatsApp</strong>: se scegli WhatsApp come canale o ci scrivi su WhatsApp, la conversazione passa
              attraverso il servizio di Meta Platforms Ireland Ltd., che tratta i dati scambiati anche secondo la propria
              informativa e può trasferirli fuori dall&apos;Unione Europea. Usiamo WhatsApp solo se lo scegli tu: puoi
              sempre chiedere di essere contattato per telefono o email.
            </li>
          </ul>
          <p className="mt-2">
            Trasferimenti fuori dall&apos;UE da parte dei fornitori:{" "}
            <T>[DA VERIFICARE per i fornitori scelti e indicare le garanzie applicate]</T>.
          </p>
        </section>

        <section>
          <h2>Per quanto tempo li conserviamo</h2>
          <ul>
            <li>
              Richiesta senza acquisto: cancelliamo dati, foto e trattativa entro{" "}
              <T>[DA CONFERMARE: 12 mesi]</T> dall&apos;ultimo contatto.
            </li>
            <li>
              Moto acquistata: conserviamo i dati necessari agli obblighi di legge per il periodo previsto dalla
              normativa fiscale e civilistica <T>[DA CONFERMARE: di norma 10 anni]</T>; le foto non necessarie vengono
              cancellate prima.
            </li>
            <li>Statistiche: solo conteggi aggregati e anonimi.</li>
          </ul>
        </section>

        <section>
          <h2>I tuoi diritti</h2>
          <p>
            Puoi chiedere in ogni momento di accedere ai tuoi dati, correggerli, cancellarli, limitarne l&apos;uso,
            riceverli in un formato leggibile (portabilità) e opporti ai trattamenti basati sul nostro legittimo
            interesse. Puoi anche presentare reclamo al Garante per la protezione dei dati personali
            (garanteprivacy.it).
          </p>
        </section>

        <section>
          <h2>Come chiedere la cancellazione</h2>
          <p>
            Scrivi a <T>{LEGAL.privacyEmail}</T> indicando il codice della richiesta (lo trovi nella pagina di
            conferma) oppure email e telefono che hai usato. Potremmo chiederti di confermare la tua identità. Rispondiamo
            entro 30 giorni: cancelliamo dati di contatto, dati della moto, foto e trattativa, salvo ciò che dobbiamo
            conservare per legge.
          </p>
        </section>
      </div>
    </main>
  );
}
