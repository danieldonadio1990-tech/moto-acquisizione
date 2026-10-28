import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { LEGAL, PROVIDERS } from "@/config/business";

export const metadata: Metadata = { title: "Informativa privacy", alternates: { canonical: "/privacy" } };

/**
 * Informativa privacy. I dati del titolare e dei fornitori vengono da src/config/business.ts (forniti dal titolare). Non è una dichiarazione
 * di conformità: restano da verificare i punti elencati in docs/FOTO-E-PRIVACY.md. Se il testo cambia, aggiornare PRIVACY_POLICY_VERSION.
 * Regola: nessun segnaposto, nessuna evidenziazione e nessuna affermazione non verificata (località dei dati, garanzie, tempi) nel testo pubblico.
 */
const mail = (a: string) => (
  <a href={`mailto:${a}`} className="font-semibold underline underline-offset-4">
    {a}
  </a>
);

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:py-16">
      <BrandMark />
      <p className="label mt-10 text-concrete">Privacy</p>
      <h1 className="display mt-2 text-5xl sm:text-6xl">Informativa privacy</h1>

      <div className="mt-8 space-y-8 text-base leading-relaxed text-asphalt-soft [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:uppercase [&_h2]:leading-none [&_h2]:text-asphalt [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Chi tratta i tuoi dati</h2>
          <p>
            Titolare del trattamento: <strong>{LEGAL.holderName}</strong>, {LEGAL.legalForm}, che esercita l&apos;attività di {LEGAL.activity}. Sede legale:{" "}
            {LEGAL.address}. Partita IVA {LEGAL.vatNumber}. Il sito è gestito direttamente dal titolare.
          </p>
          <p className="mt-2">
            Per qualsiasi domanda sui tuoi dati scrivi a {mail(LEGAL.privacyEmail)} oppure, via PEC, a {mail(LEGAL.pec)}.
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
              interne sulla tua richiesta.
            </li>
            <li>
              <strong>Provenienza</strong>: se arrivi da un nostro annuncio o link, i parametri del link (es. il nome della
              campagna, &quot;UTM&quot;), salvati insieme alla richiesta.
            </li>
            <li>
              <strong>Presa visione</strong>: data e ora in cui hai confermato di aver letto questa informativa e la sua versione.
            </li>
          </ul>
          <p className="mt-2">
            <strong>Sicurezza.</strong> Il database non registra il tuo indirizzo IP. Per limitare gli abusi, mentre invii il
            modulo il sito conta i tentativi con codici derivati da indirizzo IP, telefono ed email (non leggibili e non
            l&apos;indirizzo in chiaro); questi codici restano per la durata del controllo, da pochi minuti a un giorno, e vengono poi rimossi dal sito. I fornitori che ospitano il sito possono conservare registri tecnici (log) per sicurezza e funzionamento.
          </p>
        </section>

        <section>
          <h2>Perché li usiamo</h2>
          <ul>
            <li>
              Valutare la tua moto, ricontattarti e, se vuoi, concludere l&apos;acquisto. Base giuridica: la tua
              richiesta, cioè misure precontrattuali e contratto (art. 6.1.b GDPR).
            </li>
            <li>Adempiere agli obblighi fiscali e civilistici se acquistiamo la moto (art. 6.1.c GDPR).</li>
            <li>
              Statistiche interne aggregate per capire come migliorare il servizio e quanto rendono i nostri annunci;
              sicurezza del sito e prevenzione di abusi. Base giuridica: nostro legittimo interesse (art. 6.1.f GDPR),
              al quale puoi opporti.
            </li>
          </ul>
          <p className="mt-2">
            I dati di contatto e della moto servono per la valutazione: senza, non possiamo rispondere. Le foto sono
            facoltative. Non usiamo i tuoi dati per pubblicità e non li vendiamo. Il prezzo della moto si stima dai dati
            della moto e di mercato, non da caratteristiche personali; al momento nessuna offerta ti viene comunicata in
            modo automatico: ti risponde una persona.
          </p>
        </section>

        <section>
          <h2>Cookie e dati nel tuo browser</h2>
          <p>
            Il sito non usa cookie né strumenti di analisi o pubblicità di terze parti. Mentre compili il modulo, il tuo
            browser conserva sul tuo dispositivo, solo per la scheda aperta (<em>sessionStorage</em>), i dati che hai inserito, così non li
            perdi se ricarichi la pagina, insieme a un identificativo casuale e ai parametri del link: tutto si cancella quando chiudi
            la scheda.
          </p>
          <p className="mt-2">
            Contiamo in forma aggregata visite, clic e passaggi del modulo, con quell&apos;identificativo casuale. Questi
            conteggi non sono collegati al tuo nome né alla tua richiesta.
          </p>
        </section>

        <section>
          <h2>Chi può vedere i dati</h2>
          <ul>
            <li>Il titolare e, se presenti, le persone da lui autorizzate, solo per gestire la tua richiesta.</li>
            <li>
              Fornitori di servizi tecnici che trattano i dati per nostro conto: <strong>{PROVIDERS.hosting}</strong> (hosting del sito);{" "}
              <strong>{PROVIDERS.database}</strong> (database con i dati delle richieste, {PROVIDERS.databaseRegion}); <strong>{PROVIDERS.storage}</strong> (archivio
              delle foto); <strong>{PROVIDERS.notifications}</strong> (invio della notifica interna di nuova richiesta, che contiene il codice della richiesta e i
              dati della moto ma non i tuoi contatti); <strong>{PROVIDERS.mail}</strong> (posta elettronica con cui gestiamo le richieste e ti scriviamo).
            </li>
            <li>
              <strong>WhatsApp</strong>: se scegli WhatsApp come canale o ci scrivi su WhatsApp, la conversazione passa
              attraverso il servizio di Meta Platforms Ireland Ltd., che la tratta anche secondo la propria informativa. Lo usiamo solo se lo scegli
              tu: puoi sempre chiedere di essere contattato per telefono o email.
            </li>
          </ul>
        </section>

        <section>
          <h2>Trasferimenti fuori dall&apos;Unione europea</h2>
          <p>
            Questa informativa non dichiara se i fornitori trasferiscano dati fuori dallo Spazio economico europeo né con quali garanzie,
            perché non è stato ancora verificato con ciascuno di loro. Puoi chiedere informazioni aggiornate a {mail(LEGAL.privacyEmail)}.
          </p>
        </section>

        <section>
          <h2>Per quanto tempo li conserviamo</h2>
          <ul>
            <li>
              Richiesta senza acquisto: per il tempo necessario a gestire la richiesta e le eventuali trattative. Il termine
              oltre il quale cancelliamo dati, foto e trattativa non è ancora stato fissato; finché non lo sarà puoi chiedere la cancellazione in
              qualsiasi momento (vedi sotto).
            </li>
            <li>
              Moto acquistata: i dati necessari agli obblighi di legge fiscali e civilistici, per il periodo che la normativa
              prevede; le foto non necessarie possono essere cancellate prima.
            </li>
            <li>Statistiche: solo conteggi aggregati senza collegamento alla tua identità.</li>
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
            Scrivi a {mail(LEGAL.privacyEmail)} (o via PEC a {mail(LEGAL.pec)}) indicando il codice della richiesta (lo trovi nella pagina
            di conferma) oppure email e telefono che hai usato. Potremmo chiederti di confermare la tua identità. Rispondiamo
            entro un mese: cancelliamo dati di contatto, dati della moto, foto e trattativa, salvo ciò che dobbiamo
            conservare per legge.
          </p>
        </section>
      </div>

      <p className="mt-10 border-t border-line pt-6 text-sm">
        <Link href="/" className="font-semibold underline underline-offset-4">
          Torna al sito
        </Link>
      </p>
    </main>
  );
}
