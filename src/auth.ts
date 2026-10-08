import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/access";

/**
 * Inicio de sesión con Google (Auth.js). Variables: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET y ALLOWED_EMAILS.
 * Solo se acepta un correo verificado que esté en ALLOWED_EMAILS; el resto ve "sin acceso".
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    signIn({ profile }) {
      return profile?.email_verified === true && isAllowedEmail(profile.email);
    },
  },
});
