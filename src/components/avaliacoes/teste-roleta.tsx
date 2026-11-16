"use client";

import type { CSSProperties } from "react";
import { RoletaPremios } from "@/app/avaliar/[slug]/[origem]/roleta";
import { contraste, corTextoSobre } from "@/lib/avaliacoes/marca";

/** Teste da roleta na tela Configurar (14/11/2026, pedido do Vinícius: "aparecer o teste da roleta
 * abaixo da roleta de prêmios pra ver como está funcionando e a disposição"). Mesma peça e mesmas
 * cores da página do cliente, num celular de mentira; o sorteio é aqui mesmo, com os pesos da tela
 * (inclusive o que ainda não foi salvo), e nada é gravado. */
export function TesteRoleta({
  premios,
  validadeDias,
  nome,
  corPrincipal,
  corFundo,
  linkPedidoDireto,
}: {
  premios: { nome: string; regra: string; peso: number }[];
  validadeDias: number;
  nome: string;
  corPrincipal: string;
  corFundo: string;
  linkPedidoDireto: string | null;
}) {
  const validos = premios.filter((p) => p.nome.trim().length >= 2);
  if (validos.length === 0) return <p className="text-sm text-cinza-medio">Cadastre ao menos um prêmio para testar a roleta.</p>;

  const tinta = corTextoSobre(corFundo);
  const textoBotao = contraste(corPrincipal, tinta) >= 3 ? corPrincipal : corFundo;
  const claro = tinta === "#111111";
  const estiloCartao: CSSProperties = claro
    ? { backgroundColor: "#FFFFFF", borderColor: "#11111117", color: tinta }
    : { backgroundColor: "#FFFFFF10", borderColor: "#FFFFFF26", color: tinta };
  // Muda a chave quando os prêmios mudam: a roda recomeça com as fatias novas.
  const chave = validos.map((p) => `${p.nome}|${p.regra}|${p.peso}`).join(";");

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full max-w-[380px] overflow-hidden rounded-[28px] border-[6px] border-[#111111] shadow-xl">
        <div className="flex flex-col items-center px-4 py-6 text-center" style={{ backgroundColor: corFundo, color: tinta }}>
          <p className="text-2xl font-extrabold">Obrigado!</p>
          <p className="mb-4 text-sm opacity-70">(o que o cliente vê depois de enviar a pesquisa do app)</p>
          <RoletaPremios
            key={chave}
            respostaId=""
            teste={{ pesos: validos.map((p) => p.peso), validadeDias }}
            premios={validos.map((p, i) => ({ id: `teste-${i}`, nome: p.nome.trim(), regra: p.regra.trim() || null }))}
            nome={nome}
            corPrincipal={corPrincipal}
            tinta={tinta}
            textoBotao={textoBotao}
            estiloCartao={estiloCartao}
            linkPedidoDireto={linkPedidoDireto}
          />
        </div>
      </div>
      <p className="max-w-[380px] text-center text-xs text-cinza-medio">
        Teste: digite qualquer WhatsApp válido e gire. O sorteio usa as chances da tela, mesmo antes de salvar. Nada é gravado e o cupom TESTE0 não vale.
      </p>
    </div>
  );
}
