import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 py-16">
      <BrandMark />
      <h1 className="display mt-10 text-6xl">Pagina non trovata</h1>
      <p className="mt-4 text-lg text-asphalt-soft">L&apos;indirizzo potrebbe essere sbagliato o la pagina non esiste più.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/valuta" className="inline-flex h-14 items-center justify-center rounded-xl bg-plate px-8 text-lg font-bold text-paper">
          Valuta la tua moto
        </Link>
        <Link href="/" className="inline-flex h-14 items-center justify-center rounded-xl border-2 border-asphalt px-8 text-lg font-bold">
          Torna alla home
        </Link>
      </div>
    </main>
  );
}
