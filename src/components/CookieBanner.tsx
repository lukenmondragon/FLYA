"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/i18n/es";

/** Solo se muestra si hay anuncios o analítica activados. Guarda la elección en localStorage. */
export function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem("cookie-consent"));
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const choose = (v: "accepted" | "rejected") => {
    try {
      localStorage.setItem("cookie-consent", v);
    } catch {}
    setShow(false);
  };
  return (
    <div role="dialog" aria-label="Cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-line bg-card p-4 text-sm shadow-xl">
      <p>
        {t.cookieBanner.text} <Link href="/cookies" className="text-accent underline">Más información</Link>
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => choose("rejected")} className="rounded-full border border-line px-3 py-1.5">{t.cookieBanner.reject}</button>
        <button onClick={() => choose("accepted")} className="rounded-full bg-accent px-3 py-1.5 font-semibold text-accent-ink">{t.cookieBanner.accept}</button>
      </div>
    </div>
  );
}
