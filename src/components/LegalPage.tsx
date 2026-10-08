import Link from "next/link";
import { t } from "@/lib/i18n/es";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 leading-relaxed sm:px-6">
      <Link href="/" className="font-serif text-xl text-accent">
        ← {t.appName}
      </Link>
      <h1 className="mt-6 font-serif text-3xl text-accent">{title}</h1>
      <p className="mt-2 rounded-xl border border-warn/40 p-3 text-sm text-warn">Texto genérico de ejemplo. Debe revisarlo un profesional antes de lanzar el servicio al público.</p>
      <div className="mt-6 space-y-4 text-ink [&_h2]:mt-6 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:text-accent">{children}</div>
    </main>
  );
}
