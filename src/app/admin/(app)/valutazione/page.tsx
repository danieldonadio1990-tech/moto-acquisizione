import { Suspense } from "react";
import { requireAdmin } from "@/modules/admin/auth";
import { ValuationSettingsView } from "@/modules/admin/ui/ValuationSettingsView";

export default function ValuationSettingsPage() {
  return (
    <Suspense fallback={<p className="text-concrete">Carico…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireAdmin();
  return <ValuationSettingsView />;
}
