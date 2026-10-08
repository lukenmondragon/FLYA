import { describe, expect, it } from "vitest";
import { accessFor, allowedEmails, isAllowedEmail } from "@/lib/access";

const configured = { AUTH_SECRET: "x", AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s", ALLOWED_EMAILS: " Yo@Gmail.com , otra@gmail.com" };

describe("acceso", () => {
  it("normaliza la lista de correos", () => {
    expect(allowedEmails(configured.ALLOWED_EMAILS)).toEqual(["yo@gmail.com", "otra@gmail.com"]);
    expect(isAllowedEmail("YO@gmail.com", configured.ALLOWED_EMAILS)).toBe(true);
    expect(isAllowedEmail("intruso@gmail.com", configured.ALLOWED_EMAILS)).toBe(false);
    expect(isAllowedEmail(undefined, configured.ALLOWED_EMAILS)).toBe(false);
  });
  it("con Auth configurado solo entran los correos permitidos", () => {
    expect(accessFor("yo@gmail.com", { ...configured, NODE_ENV: "production" })).toBe("allow");
    expect(accessFor("intruso@gmail.com", { ...configured, NODE_ENV: "production" })).toBe("login");
    expect(accessFor(undefined, { ...configured, NODE_ENV: "production" })).toBe("login");
  });
  it("sin configurar: abierto en desarrollo, bloqueado en producción", () => {
    expect(accessFor(undefined, { NODE_ENV: "development" })).toBe("allow");
    expect(accessFor("yo@gmail.com", { NODE_ENV: "production" })).toBe("locked");
    expect(accessFor("yo@gmail.com", { ...configured, ALLOWED_EMAILS: "", NODE_ENV: "production" })).toBe("locked");
  });
});
