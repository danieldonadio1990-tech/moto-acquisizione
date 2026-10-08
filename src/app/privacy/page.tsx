import type { Metadata } from "next";
import { BrandMark } from "@/components/BrandMark";
import { BRAND, LEGAL, PRIVACY_POLICY_VERSION } from "@/config/brand";

export const metadata: Metadata = { title: `Informativa privacy | ${BRAND.name}` };

/**
 * BOZZA da far verificare a chi segue la privacy dell'azienda prima della messa online.
 * Se il testo cambia, aggiornare PRIVACY_POLICY_VERSION in src/config/brand.ts.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 md:py-16">
      <BrandMark />
      <h1 className="display mt-10 text-5xl">Informativa privacy</h1>
      <p className="mt-3 text-sm text-concrete">Versione {PRIVACY_POLICY_VERSION}</p>

      <div className="mt-8 space-y-6 leading-relaxed text-asphalt-soft [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-asphalt">
        <section>
          <h2>Chi tratta i tuoi dati</h2>
          <p>
            {LEGAL.companyName}, {LEGAL.address}, P.IVA {LEGAL.vatNumber}. Per qualsiasi richiesta:{" "}
            {LEGAL.privacyEmail}.
          </p>
        </section>
        <section>
          <h2>Quali dati raccogliamo</h2>
          <p>
            Nome, cognome, telefono, email e comune; i dati della moto che ci descrivi (marca, modello, anno,
            chilometri, condizioni) e le foto che carichi. Dalle foto eliminiamo automaticamente i metadati, inclusa
            la posizione GPS. Non ti chiediamo documenti d&apos;identità.
          </p>
        </section>
        <section>
          <h2>Perché li usiamo</h2>
          <p>
            Per valutare la tua moto, ricontattarti con il canale che preferisci e, se vuoi, concludere l&apos;acquisto.
            La base giuridica è la tua richiesta di valutazione (misure precontrattuali, art. 6.1.b GDPR). Non usiamo
            i tuoi dati per pubblicità e non li vendiamo.
          </p>
        </section>
        <section>
          <h2>Per quanto tempo</h2>
          <p>
            Se non concludiamo l&apos;acquisto, cancelliamo i dati entro 12 mesi dall&apos;ultimo contatto. Se
            acquistiamo la moto, conserviamo i dati necessari per gli obblighi di legge.
          </p>
        </section>
        <section>
          <h2>Chi li vede</h2>
          <p>
            Solo il nostro personale e i fornitori tecnici che ospitano il sito e il database, all&apos;interno
            dell&apos;Unione Europea.
          </p>
        </section>
        <section>
          <h2>I tuoi diritti</h2>
          <p>
            Puoi chiedere in ogni momento di vedere, correggere o cancellare i tuoi dati scrivendo a{" "}
            {LEGAL.privacyEmail}. Puoi anche presentare reclamo al Garante per la protezione dei dati personali.
          </p>
        </section>
      </div>
    </main>
  );
}
