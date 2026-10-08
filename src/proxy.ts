import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessFor } from "@/lib/access";

/** Protege toda la app: solo los correos permitidos pueden usarla. */
export default auth((req) => {
  const decision = accessFor(req.auth?.user?.email);
  if (decision === "allow") return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: decision === "locked" ? "Acceso no configurado." : "Inicia sesión para usar el buscador." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
});

export const config = {
  // Todo salvo el propio inicio de sesión, las páginas legales y los archivos estáticos.
  matcher: ["/((?!api/auth|login|privacidad|cookies|terminos|_next/static|_next/image|favicon.ico).*)"],
};
