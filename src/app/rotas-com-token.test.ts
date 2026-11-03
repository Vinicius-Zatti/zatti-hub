import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { ROTAS_PUBLICAS, ROTAS_PUBLICAS_EXATAS } from "../../middleware";

// Rota chamada pelo Vini, fora do navegador, não tem sessão: fora da lista do middleware ela cai no
// /login e o token nem é conferido (a captura de NF-e ficou 3 dias assim, 03/11/2026).
const API = join(process.cwd(), "src", "app", "api");

function rotasComToken(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = join(pasta, item.name);
    if (item.isDirectory()) return rotasComToken(caminho);
    if (item.name !== "route.ts" || !readFileSync(caminho, "utf8").includes("tokenValido(")) return [];
    return ["/api/" + relative(API, pasta).split(sep).join("/")];
  });
}

describe("rotas com token próprio", () => {
  const rotas = rotasComToken(API);

  it("acha as rotas do robô da SEFAZ", () => {
    expect(rotas).toContain("/api/financeiro/sefaz/pendencias");
    expect(rotas).toContain("/api/financeiro/sefaz/progresso");
  });

  it.each(rotas)("%s passa pelo middleware sem sessão", (rota) => {
    expect(ROTAS_PUBLICAS_EXATAS.has(rota) || ROTAS_PUBLICAS.some((r) => rota.startsWith(r))).toBe(true);
  });
});
