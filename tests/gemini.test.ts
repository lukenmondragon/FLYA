import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toGeminiSchema } from "@/lib/llm/gemini";
import { LlmParseSchema } from "@/lib/llm/schema";

describe("esquema para Gemini", () => {
  it("quita $schema/additionalProperties y convierte tipos anulables en anyOf", () => {
    const s = toGeminiSchema(z.toJSONSchema(z.object({ a: z.string().nullable(), b: z.array(z.string()) }))) as Record<string, any>;
    expect(s.$schema).toBeUndefined();
    expect(s.additionalProperties).toBeUndefined();
    expect(s.properties.a).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    expect(s.properties.b.type).toBe("array");
  });
  it("el esquema completo del parser no contiene arrays de tipos", () => {
    const json = JSON.stringify(toGeminiSchema(z.toJSONSchema(LlmParseSchema)));
    expect(json).not.toMatch(/"type":\[/);
    expect(json).not.toContain("$schema");
  });
});
