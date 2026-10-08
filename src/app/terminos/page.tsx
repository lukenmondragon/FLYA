import { LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Términos de uso" };

export default function Page() {
  return (
    <LegalPage title="Términos de uso">
      <h2>Naturaleza del servicio</h2>
      <p>Es un comparador informativo. Los precios proceden de proveedores externos, pueden estar en caché y cambiar en cualquier momento. El precio y las condiciones definitivas se confirman siempre en la web del vendedor.</p>
      <h2>Estimaciones</h2>
      <p>Los traslados terrestres, sobrecostes (equipaje, hoteles por escalas nocturnas) y «coste real» son estimaciones aproximadas y se indican como tales. Las explicaciones las genera una IA a partir de los resultados y pueden contener errores.</p>
      <h2>Enlaces de afiliado y publicidad</h2>
      <p>Algunos enlaces de compra son de afiliado: si compras, podemos recibir una comisión sin coste para ti. Se indican como tales. La publicidad, si existe, se muestra separada de los resultados y etiquetada.</p>
      <h2>Responsabilidad</h2>
      <p>No somos parte del contrato de transporte ni respondemos de cambios de precio, disponibilidad o incidencias del vuelo. Uso razonable: se aplican límites de búsquedas por IP.</p>
    </LegalPage>
  );
}
