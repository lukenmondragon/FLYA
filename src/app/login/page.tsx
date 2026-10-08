import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { accessFor, authConfigured, missingAuthVars } from "@/lib/access";
import { t } from "@/lib/i18n/es";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await auth();
  if (accessFor(session?.user?.email) === "allow" && authConfigured()) redirect("/");
  const configured = authConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-4xl text-accent">{t.appName}</h1>
      <p className="mt-3 text-muted">Acceso privado.</p>
      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-danger/60 p-3 text-sm text-danger">
          {error === "AccessDenied" ? "Esta cuenta no tiene acceso." : "No se pudo iniciar sesión. Inténtalo de nuevo."}
        </p>
      )}
      {configured ? (
        <form
          className="mt-8"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:brightness-110">
            Entrar con Google
          </button>
        </form>
      ) : (
        <div className="mt-8 text-sm text-warn">
          <p>El acceso todavía no está configurado. Faltan estas variables de entorno:</p>
          <p className="mt-2 font-mono">{missingAuthVars().join(", ")}</p>
        </div>
      )}
    </main>
  );
}
