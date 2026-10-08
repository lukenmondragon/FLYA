import Link from "next/link";
import { t } from "@/lib/i18n/es";

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-6 text-center text-xs text-muted sm:px-6">
      <p>{t.footer.note}</p>
      <nav className="mt-2 flex justify-center gap-4">
        <Link href="/privacidad" className="hover:text-accent">{t.footer.privacy}</Link>
        <Link href="/cookies" className="hover:text-accent">{t.footer.cookies}</Link>
        <Link href="/terminos" className="hover:text-accent">{t.footer.terms}</Link>
      </nav>
    </footer>
  );
}
