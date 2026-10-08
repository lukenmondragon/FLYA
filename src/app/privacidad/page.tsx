import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Aviso de privacidad" };

export default function Page() {
  return (
    <LegalPage title="Aviso de privacidad">
      <p>Este servicio es un buscador informativo de vuelos. No vende billetes, no procesa pagos y no requiere registro.</p>
      <h2>Qué datos tratamos</h2>
      <p>El texto de tus búsquedas (por ejemplo, origen, destino y fechas) se procesa para mostrarte resultados. No pedimos ni guardamos nombres, documentos ni datos de pasajeros. Por seguridad y para limitar abusos, tratamos tu dirección IP de forma temporal (contadores que caducan en 24 horas).</p>
      <h2>Con quién se comparten</h2>
      <p>Para responder, el texto de la búsqueda puede enviarse a un proveedor de inteligencia artificial (Anthropic o Google) y los parámetros de vuelo a un proveedor de precios (por ejemplo, Travelpayouts/Aviasales). Al pulsar «Ver oferta» sales a la web de un tercero, que tiene su propia política de privacidad.</p>
      <h2>Conservación</h2>
      <p>Guardamos en caché resultados de búsqueda durante un tiempo corto y precios agregados por ruta (sin datos personales) para detectar chollos.</p>
      <h2>Tus derechos</h2>
      <p>Puedes ejercer tus derechos de acceso, rectificación, supresión u oposición escribiendo al responsable del servicio. [Completa aquí identidad y contacto del responsable.]</p>
    </LegalPage>
  );
}
