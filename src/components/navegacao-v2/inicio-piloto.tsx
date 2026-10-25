import { BlocosModulo, type BlocoModulo } from "@/components/navegacao-v2/blocos-modulo";
import { DICAS_BLOCO_CONTAGEM } from "@/components/navegacao-v2/bloco-contagem";
import { DICA_PEDIDOS_PENDENTES } from "@/lib/estoque/resumo";
import type { AcaoRapida } from "@/lib/navegacao/acoes";

// Início do piloto (Navegação V2, fase 3, 24/10/2026): atalhos por operação,
// separado do Dashboard (aba ao lado, só gestão). A equipe operacional vê só
// as ações do dia que o menu dela já tem; gestão e master veem também as de
// gestão. Os poucos números são os do Painel geral (`resumirEstoque`), sem
// consulta nova; o resto dos indicadores fica no Dashboard.

export type ResumoInicio = {
  ultimaContagem: string | null;
  alertasCompra: number;
  pedidosPendentes: number;
};

/** Atalho em cartão; alguns ganham o número do estoque que já vem pronto. */
function blocoDaAcao(acao: AcaoRapida, resumo: ResumoInicio): BlocoModulo {
  const base: BlocoModulo = { titulo: acao.titulo, descricao: acao.descricao, href: acao.href, icone: acao.icone };
  switch (acao.href) {
    case "/estoque/contagem":
      return { ...base, descricao: resumo.ultimaContagem ? `Última em ${resumo.ultimaContagem}` : "Ainda sem contagem" };
    case "/estoque/pedidos":
      return {
        ...base,
        descricao: "Itens que pedem compra",
        numero: String(resumo.alertasCompra),
        alerta: resumo.alertasCompra > 0,
        dica: DICAS_BLOCO_CONTAGEM.compra,
      };
    case "/estoque/pedidos/feitos":
      return {
        ...base,
        descricao: "Pedidos aguardando receber",
        numero: String(resumo.pedidosPendentes),
        alerta: resumo.pedidosPendentes > 0,
        dica: DICA_PEDIDOS_PENDENTES,
      };
    default:
      return base;
  }
}

export function InicioPiloto({
  saudacao,
  dataHoje,
  operacao,
  gestao,
  resumo,
}: {
  saudacao: string;
  dataHoje: string;
  operacao: AcaoRapida[];
  gestao: AcaoRapida[];
  resumo: ResumoInicio;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Início</h1>
      <p className="text-sm text-cinza-medio">
        <span className="font-semibold text-azul-noite">{saudacao}.</span> {dataHoje}
      </p>

      <section aria-labelledby="inicio-operacao" className="flex flex-col gap-2.5">
        <h2 id="inicio-operacao" className="text-xs font-bold uppercase tracking-[0.12em] text-cinza-medio">
          Operação do dia
        </h2>
        {operacao.length > 0 ? (
          <BlocosModulo blocos={operacao.map((acao) => blocoDaAcao(acao, resumo))} rotulo="Atalhos da operação do dia" />
        ) : (
          <p className="text-sm text-cinza-medio">Nenhum atalho de operação liberado para o seu acesso.</p>
        )}
      </section>

      {gestao.length > 0 && (
        <section aria-labelledby="inicio-gestao" className="flex flex-col gap-2.5">
          <h2 id="inicio-gestao" className="text-xs font-bold uppercase tracking-[0.12em] text-cinza-medio">
            Gestão
          </h2>
          <BlocosModulo blocos={gestao.map((acao) => blocoDaAcao(acao, resumo))} rotulo="Atalhos de gestão" />
        </section>
      )}
    </div>
  );
}
