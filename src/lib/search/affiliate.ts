import "server-only";
import { env } from "../env";

export interface PurchaseLink {
  url: string;
  /** true si el enlace lleva parámetros de afiliado (se indica en la UI). */
  affiliate: boolean;
}

/**
 * Punto ÚNICO por el que pasan todos los enlaces de compra.
 * Añade los parámetros de afiliado configurados en el entorno, si existen.
 */
export function purchaseLink(rawUrl: string | undefined, provider: string): PurchaseLink | undefined {
  if (!rawUrl) return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const e = env();
  if (provider === "travelpayouts" && e.TRAVELPAYOUTS_MARKER) {
    url.searchParams.set("marker", e.TRAVELPAYOUTS_MARKER);
    return { url: url.toString(), affiliate: true };
  }
  return { url: url.toString(), affiliate: false };
}
