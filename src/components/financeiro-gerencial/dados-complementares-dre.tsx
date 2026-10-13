"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { salvarEstoqueMensalAction } from "@/app/(app)/financeiro-gerencial/dre/actions";
import { CampoNumero } from "@/components/campo-numero";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaCalculo } from "@/components/dica-calculo";
import { EXPLICACAO_CALCULO } from "@/lib/financeiro-gerencial/explicacoes-dre";
import { MESES_ABREVIADOS } from "@/lib/financeiro-gerencial/dre-anual";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";
import type { SugestaoEstoqueContagem } from "@/lib/financeiro-gerencial/sugestao-estoque-contagem";

type CamposMes = {
  receitaVendasProdutos: number | null;
  estoqueInicialMercadorias: number | null;
  estoqueInicialEmbalagens: number | null;
  estoqueFinalMercadorias: number | null;
  estoqueFinalEmbalagens: number | null;
};

const LINHAS: { campo: keyof CamposMes; rotulo: string }[] = [
  { campo: "receitaVendasProdutos", rotulo: "Venda de Produtos" },
  { campo: "estoqueInicialMercadorias", rotulo: "Estoque Inicial de Mercadorias" },
  { campo: "estoqueInicialEmbalagens", rotulo: "Estoque Inicial de Embalagens" },
  { campo: "estoqueFinalMercadorias", rotulo: "Estoque Final de Mercadorias" },
  { campo: "estoqueFinalEmbalagens", rotulo: "Estoque Final de Embalagens" },
];

function paraCampos(estoque: EstoqueMensal | null): CamposMes {
  if (!estoque) {
    return {
      receitaVendasProdutos: null,
      estoqueInicialMercadorias: null,
      estoqueInicialEmbalagens: null,
      estoqueFinalMercadorias: null,
      estoqueFinalEmbalagens: null,
    };
  }
  return {
    receitaVendasProdutos: estoque.receitaVendasProdutos,
    estoqueInicialMercadorias: estoque.estoqueInicialMercadorias,
    estoqueInicialEmbalagens: estoque.estoqueInicialEmbalagens,
    estoqueFinalMercadorias: estoque.estoqueFinalMercadorias,
    estoqueFinalEmbalagens: estoque.estoqueFinalEmbalagens,
  };
}

function competenciaDoMes(ano: number, indiceMes: number): string {
  return `${ano}-${String(indiceMes + 1).padStart(2, "0")}`;
}

function formatarNumero(v: number | null): string {
  if (v === null) return "-";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Status = "salvando" | "salvo" | "erro" | undefined;

/** "DD/MM/AAAA" -> "DD/MM". */
function diaMes(data: string): string {
  return data.split("/").slice(0, 2).join("/");
}

/** Célula da linha "Sugestão da Contagem" de um mês (Fase 3, item 2): mostra a
 * última contagem completa do mês e, para a Gestão, o botão que só preenche o
 * campo de Estoque Final de Mercadorias. Nunca grava sozinho. */
function CelulaSugestao({
  sugestao,
  podeGerir,
  status,
  pendente,
  erro,
  jaIgual,
  onUsar,
  onSalvar,
}: {
  sugestao: SugestaoEstoqueContagem | null;
  podeGerir: boolean;
  status: Status;
  /** Valor da Contagem posto no campo pelo "Usar este valor" e ainda não
   * salvo. Só sai daqui com o mês salvo com sucesso: se o salvamento falhar,
   * o botão continua para nova tentativa. */
  pendente: boolean;
  erro: string | undefined;
  jaIgual: boolean;
  onUsar: () => void;
  onSalvar: () => void;
}) {
  if (!sugestao) return <span className="text-[11px] leading-tight text-cinza-medio">Nenhuma contagem completa neste mês</span>;
  return (
    <span className="flex flex-col items-end gap-0.5 text-[11px] leading-tight">
      <span className="text-cinza-medio">Contagem de {diaMes(sugestao.data)}:</span>
      <span className="font-mono font-semibold text-cinza">R$ {formatarNumero(sugestao.valor)}</span>
      {sugestao.itensSemValor > 0 && (
        <span className="text-ambar" title="Itens sem preço no cadastro ou sem quantidade valem R$ 0: o valor é parcial.">
          {sugestao.itensSemValor} {sugestao.itensSemValor === 1 ? "item" : "itens"} sem preço (parcial)
        </span>
      )}
      {podeGerir && pendente ? (
        <>
          {status === "erro" && erro && (
            <span role="alert" className="max-w-[120px] text-right text-vermelho">
              Não salvou: {erro}
            </span>
          )}
          <button
            type="button"
            onClick={onSalvar}
            disabled={status === "salvando"}
            className="rounded bg-azul-noite px-1.5 py-0.5 font-bold text-branco disabled:opacity-50"
          >
            {status === "salvando" ? "Salvando..." : status === "erro" ? "Tentar salvar de novo" : "Salvar mês"}
          </button>
        </>
      ) : (
        podeGerir &&
        !jaIgual && (
          <button type="button" onClick={onUsar} className="rounded border border-azul-petroleo px-1.5 py-0.5 font-semibold text-azul-petroleo">
            Usar este valor
          </button>
        )
      )}
    </span>
  );
}

/** Exceção pontual e aprovada ao padrão de modal: estes 5 dados mensais são
 * editados direto na grade, célula a célula, como na planilha modelo (nunca
 * generalizar isso pra outro dado do app). Cada mês é uma linha só em
 * `fin_estoque_mensal` (5 colunas) - por isso o blur de qualquer uma das 5
 * células daquele mês reenvia a linha inteira (upsert único). Receita de
 * Vendas de Produtos nunca soma na Receita Operacional Bruta nem entra no
 * CMV em R$ - só serve de denominador do % CMV. */
export function DadosComplementaresDre({
  ano,
  estoquesDoAno,
  sugestoesContagem = null,
  podeGerir,
}: {
  ano: number;
  estoquesDoAno: (EstoqueMensal | null)[];
  /** Fase 3 (13/10): sugestão de Estoque Final de Mercadorias vinda da
   * Contagem, por mês. `null` = a Contagem não pôde ser lida agora. */
  sugestoesContagem?: (SugestaoEstoqueContagem | null)[] | null;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [valores, setValores] = useState<CamposMes[]>(() => estoquesDoAno.map(paraCampos));
  const [statusPorMes, setStatusPorMes] = useState<Record<number, Status>>({});
  const [erroPorMes, setErroPorMes] = useState<Record<number, string>>({});
  const [sugestaoPendentePorMes, setSugestaoPendentePorMes] = useState<Record<number, boolean>>({});

  function alterarCampo(indiceMes: number, campo: keyof CamposMes, valor: number | null) {
    setValores((atual) => atual.map((mes, i) => (i === indiceMes ? { ...mes, [campo]: valor } : mes)));
  }

  /** "Usar este valor": só preenche o campo; a pessoa confere e salva. */
  function usarSugestao(indiceMes: number, valor: number) {
    alterarCampo(indiceMes, "estoqueFinalMercadorias", Math.round(valor * 100) / 100);
    setSugestaoPendentePorMes((atual) => ({ ...atual, [indiceMes]: true }));
  }

  async function salvarMes(indiceMes: number) {
    const mes = valores[indiceMes];
    setStatusPorMes((atual) => ({ ...atual, [indiceMes]: "salvando" }));
    // Falha de rede (a chamada rejeita) vira o mesmo erro do retorno {ok:false}:
    // o botão volta e a sugestão continua pendente para nova tentativa.
    const resultado = await salvarEstoqueMensalAction({
      competencia: competenciaDoMes(ano, indiceMes),
      receitaVendasProdutos: mes.receitaVendasProdutos ?? 0,
      estoqueInicialMercadorias: mes.estoqueInicialMercadorias ?? 0,
      estoqueInicialEmbalagens: mes.estoqueInicialEmbalagens ?? 0,
      estoqueFinalMercadorias: mes.estoqueFinalMercadorias ?? 0,
      estoqueFinalEmbalagens: mes.estoqueFinalEmbalagens ?? 0,
    }).catch(() => ({ ok: false as const, mensagem: "Sem conexão com o servidor. Tente salvar de novo." }));
    if (!resultado.ok) {
      setStatusPorMes((atual) => ({ ...atual, [indiceMes]: "erro" }));
      setErroPorMes((atual) => ({ ...atual, [indiceMes]: resultado.mensagem }));
      return;
    }
    setErroPorMes((atual) => {
      if (!(indiceMes in atual)) return atual;
      const proximo = { ...atual };
      delete proximo[indiceMes];
      return proximo;
    });
    setSugestaoPendentePorMes((atual) => ({ ...atual, [indiceMes]: false }));
    setStatusPorMes((atual) => ({ ...atual, [indiceMes]: "salvo" }));
    router.refresh();
    setTimeout(() => setStatusPorMes((atual) => (atual[indiceMes] === "salvo" ? { ...atual, [indiceMes]: undefined } : atual)), 2000);
  }

  return (
    <div id="dados-complementares-da-dre" className="flex scroll-mt-20 flex-col gap-2">
      <div>
        <h2 className="font-display text-lg font-bold text-azul-noite">Dados Complementares da DRE</h2>
        <p className="text-sm text-cinza-medio">
          Venda de Produtos: valor dos produtos vendidos, produzidos ou entregues no mês, com ou sem entrada de dinheiro (inclui voucher,
          cortesia, bonificação e produção de conteúdo). É só a base do % CMV (CMV ÷ Venda de Produtos): não soma na Receita
          Operacional Bruta e não gera lançamento. O estoque final de um mês é o estoque inicial do mês seguinte: basta informar um dos dois
          (embalagens, se houver) para fechar o CMV do mês.
        </p>
        <p className="mt-1 text-sm text-cinza-medio">
          Sugestão da Contagem: valor da última contagem completa de cada mês. A Contagem não separa mercadorias de embalagens, então o
          valor inteiro é sugerido só para o Estoque Final de Mercadorias: confira antes de usar. Nada é salvo sem você.
        </p>
      </div>
      <TabelaRolavel ariaLabel="Tabela de dados complementares da DRE">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="220px" fixo>
                Mês de Competência
              </Th>
              {MESES_ABREVIADOS.map((mes) => (
                <Th key={mes} align="right" larguraFixa="84px">
                  {mes}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINHAS.map(({ campo, rotulo }) => (
              <Fragment key={campo}>
              <tr className="border-t border-cinza-claro">
                <td className="sticky left-0 z-10 bg-branco py-2 pr-3 pl-3 font-semibold text-cinza">
                  <span className="flex items-center gap-1.5">
                    <span className="block min-w-0 truncate" title={rotulo}>
                      {rotulo}
                    </span>
                    {campo === "receitaVendasProdutos" && <DicaCalculo texto={EXPLICACAO_CALCULO.venda_produtos} rotulo={rotulo} />}
                  </span>
                </td>
                {valores.map((mes, indiceMes) => {
                  const status = statusPorMes[indiceMes];
                  return (
                    <td key={indiceMes} className="px-2 py-1.5 text-right" onBlur={() => podeGerir && salvarMes(indiceMes)}>
                      {podeGerir ? (
                        <div
                          className={`inline-block rounded ${
                            status === "erro"
                              ? "ring-2 ring-vermelho"
                              : status === "salvo"
                                ? "ring-2 ring-verde"
                                : sugestaoPendentePorMes[indiceMes] && campo === "estoqueFinalMercadorias"
                                  ? "ring-2 ring-ambar"
                                  : ""
                          }`}
                          title={status === "erro" ? erroPorMes[indiceMes] : undefined}
                        >
                          <CampoNumero value={mes[campo]} onChange={(v) => alterarCampo(indiceMes, campo, v)} className="w-20" />
                        </div>
                      ) : (
                        <span className="font-mono">{formatarNumero(mes[campo])}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              {campo === "estoqueFinalMercadorias" && (
                <tr className="bg-off-white">
                  <td className="sticky left-0 z-10 bg-off-white py-2 pr-3 pl-3 text-xs font-semibold text-cinza-medio">
                    <span className="flex items-center gap-1.5">
                      <span className="block min-w-0 truncate" title="Sugestão da Contagem (Mercadorias)">
                        Sugestão da Contagem
                      </span>
                      <DicaCalculo texto={EXPLICACAO_CALCULO.sugestao_contagem_estoque} rotulo="Sugestão da Contagem" />
                    </span>
                  </td>
                  {sugestoesContagem === null ? (
                    <td colSpan={12} className="px-2 py-1.5 text-xs text-cinza-medio">
                      Não foi possível ler a Contagem agora. Os campos continuam funcionando normalmente.
                    </td>
                  ) : (
                    valores.map((mes, indiceMes) => {
                      const sugestao = sugestoesContagem[indiceMes] ?? null;
                      return (
                        <td key={indiceMes} className="px-2 py-1.5 text-right align-top">
                          <CelulaSugestao
                            sugestao={sugestao}
                            podeGerir={podeGerir}
                            status={statusPorMes[indiceMes]}
                            pendente={sugestaoPendentePorMes[indiceMes] === true}
                            erro={erroPorMes[indiceMes]}
                            jaIgual={sugestao !== null && mes.estoqueFinalMercadorias === Math.round(sugestao.valor * 100) / 100}
                            onUsar={() => sugestao && usarSugestao(indiceMes, sugestao.valor)}
                            onSalvar={() => salvarMes(indiceMes)}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}
