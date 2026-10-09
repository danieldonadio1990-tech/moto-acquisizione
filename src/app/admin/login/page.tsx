import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LoginForm } from "@/modules/admin/ui/LoginForm";

export const metadata: Metadata = { title: "Accesso backoffice", robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-12">
      <BrandMark />
      <h1 className="display mt-8 text-5xl">Backoffice</h1>
      <p className="mt-2 text-asphalt-soft">Accesso riservato al team.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
