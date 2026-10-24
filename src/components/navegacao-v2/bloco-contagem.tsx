import Link from "next/link";
import { DicaCalculo } from "@/components/dica-calculo";
import { IconeNavegacao } from "@/components/icones-navegacao";

// Bloco principal da Visão geral do Estoque (pedido de Vinícius, 24/10/2026):
// o valor em estoque da última contagem em destaque, com data e tipo da
// contagem como contexto em cima e itens contados e itens que pedem compra
// embaixo. Os números são os do Painel geral (`resumirEstoque`); este
// componente só mostra, não calcula.

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export type DadosBlocoContagem = {
  /** Data da última contagem (dd/mm/aaaa) ou null quando ainda não houve. */
  data: string | null;
  /** Tipo da contagem com o rótulo do app (ex.: "Por setor - completa");
   * vazio quando o tipo não fica gravado (contagem por grupo ou planilha). */
  tipo: string;
  valorEstoque: number;
  itensContados: number;
  alertasCompra: number;
};

export const DICAS_BLOCO_CONTAGEM = {
  valor:
    "Soma do valor total (quantidade contada x preço unitário) de todos os itens registrados na última contagem. Mesmo número do Painel geral.",
  itens:
    "Linhas registradas na data da última contagem. Na contagem por setor, o item contado em dois setores conta duas vezes. Mesmo número do Painel geral.",
  compra:
    "Itens da última contagem com o alerta \"Comprar emergencial\" (estoque abaixo do mínimo). Mesmo número do Painel geral.",
};

export function BlocoContagem({ dados, href }: { dados: DadosBlocoContagem; href: string }) {
  const contexto = dados.data ? [`Última em ${dados.data}`, dados.tipo].filter(Boolean).join(" · ") : "Ainda sem contagem";
  return (
    <section
      aria-label="Contagem"
      className="relative rounded-2xl border border-cinza-claro bg-branco p-4 transition-colors focus-within:border-ambar hover:border-ambar sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-ambar/15 text-azul-noite">
          <IconeNavegacao nome="contagem" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <Link
            href={href}
            className="font-bold text-azul-noite after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ambar"
          >
            Contagem
          </Link>
          <p className="truncate text-[12.5px] text-cinza-medio" title={contexto}>
            {contexto}
          </p>
        </div>
      </div>

      {dados.data ? (
        <>
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cinza-medio">
              Valor em estoque
              <span className="relative z-10 normal-case tracking-normal">
                <DicaCalculo rotulo="Valor em estoque" texto={DICAS_BLOCO_CONTAGEM.valor} />
              </span>
            </p>
            <p className="mt-1 break-words text-[32px] font-extrabold leading-tight tracking-tight text-azul-noite sm:text-4xl">
              {moeda.format(dados.valorEstoque)}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-cinza-claro pt-3">
            <Numero valor={dados.itensContados} rotulo="itens contados" dica={DICAS_BLOCO_CONTAGEM.itens} />
            <Numero
              valor={dados.alertasCompra}
              rotulo="pedem compra"
              dica={DICAS_BLOCO_CONTAGEM.compra}
              alerta={dados.alertasCompra > 0}
            />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-cinza-medio">Faça a primeira contagem para ver o valor em estoque.</p>
      )}
    </section>
  );
}

function Numero({ valor, rotulo, dica, alerta = false }: { valor: number; rotulo: string; dica: string; alerta?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`text-xl font-extrabold ${alerta ? "text-ambar" : "text-azul-noite"}`}>{valor}</p>
      <p className="flex items-center gap-1 text-[12.5px] text-cinza-medio">
        {rotulo}
        <span className="relative z-10">
          <DicaCalculo rotulo={rotulo} texto={dica} />
        </span>
      </p>
    </div>
  );
}
