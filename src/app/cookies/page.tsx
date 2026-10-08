import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Cookies" };

export default function Page() {
  return (
    <LegalPage title="Política de cookies">
      <p>Por defecto este sitio no usa cookies de publicidad ni de analítica. Solo se usan elementos técnicos imprescindibles para que funcione.</p>
      <h2>Si se activan anuncios o analítica</h2>
      <p>Si en algún momento se activan, te mostraremos un aviso para que aceptes o rechaces su uso antes de cargarlas. Tu elección se guarda en tu navegador (localStorage) y puedes cambiarla borrando los datos del sitio.</p>
      <h2>Terceros</h2>
      <p>Las webs a las que te lleva «Ver oferta» pueden usar sus propias cookies, incluidas las de afiliación, conforme a sus políticas.</p>
    </LegalPage>
  );
}
