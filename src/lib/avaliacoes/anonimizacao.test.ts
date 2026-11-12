import { describe, expect, it } from "vitest";
import { chaveHash, dispositivoValido, hashAnonimo, ipDaRequisicao, ipParaLimite } from "./anonimizacao";

const cabecalhos = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

describe("hash do IP e do aparelho (nunca o IP puro)", () => {
  it("chave: sal próprio, senão derivada da service role; sem as duas, nada", () => {
    expect(chaveHash({ AVALIACAO_HASH_SALT: "sal-com-mais-de-16-letras" })).toBe("sal-com-mais-de-16-letras");
    const derivada = chaveHash({ SUPABASE_SERVICE_ROLE_KEY: "chave-de-servico-bem-longa" });
    expect(derivada).toMatch(/^[0-9a-f]{64}$/);
    expect(derivada).not.toContain("chave-de-servico");
    expect(chaveHash({})).toBeNull();
  });

  it("hash tem 64 letras hexadecimais e não contém o IP", () => {
    const h = hashAnonimo("chave-0123456789abcdef", "ip", "200.1.2.3", "2026-11-12");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("200");
  });

  it("o hash do IP muda de um dia para o outro; o do aparelho não", () => {
    const k = "chave-0123456789abcdef";
    expect(hashAnonimo(k, "ip", "200.1.2.3", "2026-11-12")).not.toBe(hashAnonimo(k, "ip", "200.1.2.3", "2026-11-13"));
    expect(hashAnonimo(k, "dispositivo", "abc-1234567890abcdef", "")).toBe(hashAnonimo(k, "dispositivo", "abc-1234567890abcdef", ""));
    // "Sem aparelho" carrega o IP: leva o dia, como o hash do IP (revisão de 12/11).
    expect(hashAnonimo(k, "dispositivo", "sem-dispositivo:200.1.2.3", "2026-11-12")).not.toBe(
      hashAnonimo(k, "dispositivo", "sem-dispositivo:200.1.2.3", "2026-11-13"),
    );
  });

  it("IPv6 vira o prefixo /64; IPv4 e IPv4 mapeado ficam como o IPv4", () => {
    expect(ipParaLimite("2804:14c:5b:8001:a1b2:c3d4:e5f6:1")).toBe("2804:14c:5b:8001::/64");
    expect(ipParaLimite("2804:14c:5b:8001:ffff::9")).toBe("2804:14c:5b:8001::/64");
    expect(ipParaLimite("2804:14c::1")).toBe("2804:14c:0:0::/64");
    expect(ipParaLimite("::ffff:200.1.2.3")).toBe("200.1.2.3");
    expect(ipParaLimite("200.1.2.3")).toBe("200.1.2.3");
    expect(ipParaLimite("desconhecido")).toBe("desconhecido");
  });

  it("IP do primeiro x-forwarded-for; aparelho fora do formato vira 'sem-dispositivo'", () => {
    expect(ipDaRequisicao(cabecalhos({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" }))).toBe("200.1.2.3");
    expect(ipDaRequisicao(cabecalhos({ "x-real-ip": "200.9.9.9" }))).toBe("200.9.9.9");
    expect(ipDaRequisicao(cabecalhos({}))).toBe("desconhecido");
    expect(dispositivoValido("2b1e8c4a-1111-4222-8333-123456789abc")).toBe("2b1e8c4a-1111-4222-8333-123456789abc");
    expect(dispositivoValido("<script>")).toBe("sem-dispositivo");
    expect(dispositivoValido(null)).toBe("sem-dispositivo");
  });
});
