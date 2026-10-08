import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BrandMark } from "@/components/BrandMark";
import { getAdminSession } from "@/modules/admin/auth";
import { logoutAction } from "../actions";

export const metadata: Metadata = { title: "Backoffice", robots: { index: false } };

async function UserBox() {
  const session = await getAdminSession();
  if (!session) return null;
  return (
    <form action={logoutAction} className="flex items-center gap-3 text-sm">
      <span className="hidden text-concrete sm:inline">{session.email}</span>
      <button className="font-semibold underline-offset-4 hover:underline">Esci</button>
    </form>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-chalk">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-5">
            <BrandMark href="/admin" />
            <Link href="/admin" className="font-bold">
              Richieste
            </Link>
          </div>
          <Suspense>
            <UserBox />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
    </div>
  );
}
