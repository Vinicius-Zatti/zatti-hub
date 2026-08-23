"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { ControlesTabela } from "@/components/tabela-rolavel";
import { useArrastarParaRolar } from "@/components/use-arrastar-para-rolar";
import { useTabelaExpansivel } from "@/components/use-tabela-expansivel";
import { useGuardaEdicao } from "@/components/guarda-edicao";
import { FichaTecnicaDetalhe } from "@/components/ficha-tecnica-detalhe";
import {
  abrirFichaTecnicaAction,
  atualizarPrecosTodosCanaisFichasAction,
  type ResultadoAbrirFicha,
} from "@/app/(app)/fichas-tecnicas/actions";
import { CLASSIFICACAO_TAG, calcularCmv, montarPrecosPorCanal } from "@/lib/fichas-tecnicas";
import type { CanalVenda, FichaTecnicaResumo } from "@/lib/types";

type Precos = {
  precoVenda: number | null;
  precoVendaDeliveryProprio: number | null;
  precoVendaIfood: number | null;
  precoVenda99Food: number | null;
};

const CAMPO_POR_CANAL: Record<CanalVenda, keyof Precos> = {
  salao: "precoVenda",
  delivery_proprio: "precoVendaDeliveryProprio",
  ifood: "precoVendaIfood",
  "99food": "precoVenda99Food",
};

function brl(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(n: number | null): string {
  return n === null ? "-" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Uma cor de fundo por canal no cabeçalho - a pessoa vê de longe onde um
 * bloco de canal termina e o outro começa, sem precisar ler o rótulo de cada
 * coluna pra saber que mudou de Salão pra iFood no meio da rolagem. */
const CANAL_ESTILO: Record<CanalVenda, { bg: string; texto: string; rotulo: string }> = {
  salao: { bg: "bg-azul-petroleo", texto: "text-branco", rotulo: "Salão" },
  delivery_proprio: { bg: "bg-azul-noite", texto: "text-branco", rotulo: "Delivery Próprio" },
  ifood: { bg: "bg-vermelho", texto: "text-branco", rotulo: "iFood" },
  "99food": { bg: "bg-ambar", texto: "text-azul-noite", rotulo: "99Food" },
};

const COLUNAS_POR_CANAL = 6;

/** Tabela de Precificação - todos os pratos de Venda de uma vez, Salão e os
 * 3 canais de delivery lado a lado. Preço de venda edita direto aqui, sem
 * precisar abrir a ficha (mesmo padrão de "Salvar todos" já usado na
 * listagem principal, só que agora com os 4 preços de cada linha juntos). */
export function TabelaPrecificacao({
  fichas,
  margemNecessaria,
  margemPontoEquilibrio,
  deducoesSalao,
  deducoesIfood,
  deducoes99Food,
}: {
  fichas: FichaTecnicaResumo[];
  margemNecessaria: number | null;
  margemPontoEquilibrio: number | null;
  deducoesSalao: number;
  deducoesIfood: number;
  deducoes99Food: number;
}) {
  const router = useRouter();
  const { ativar, desativar } = useGuardaEdicao();
  const { expandido, alternar } = useTabelaExpansivel();
  const { scrollRef, handlers, arrastando } = useArrastarParaRolar<HTMLDivElement>();
  const [busca, setBusca] = useState("");

  const baseline = useMemo<Record<string, Precos>>(
    () =>
      Object.fromEntries(
        fichas.map((f) => [
          f.id,
          {
            precoVenda: f.precoVenda,
            precoVendaDeliveryProprio: f.precoVendaDeliveryProprio,
            precoVendaIfood: f.precoVendaIfood,
            precoVenda99Food: f.precoVenda99Food,
          },
        ]),
      ),
    [fichas],
  );
  const [estado, setEstado] = useState<Record<string, Precos>>({});
  const [salvandoTodos, setSalvandoTodos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [fichaAbertaId, setFichaAbertaId] = useState<string | null>(null);
  const [dadosAbertos, setDadosAbertos] = useState<ResultadoAbrirFicha & { ok: true }>();
  const [carregando, setCarregando] = useState(false);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);

  async function carregarFicha(id: string) {
    setCarregando(true);
    setErroAbertura(null);
    const resultado = await abrirFichaTecnicaAction(id);
    setCarregando(false);
    if (!resultado.ok) {
      setErroAbertura(resultado.mensagem);
      return;
    }
    setDadosAbertos(resultado);
  }

  function abrirFicha(id: string) {
    setFichaAbertaId(id);
    setDadosAbertos(undefined);
    void carregarFicha(id);
  }

  function fecharFicha() {
    setFichaAbertaId(null);
    setDadosAbertos(undefined);
    setErroAbertura(null);
    router.refresh();
  }

  function valores(id: string): Precos {
    return estado[id] ?? baseline[id];
  }

  function atualizarCampo(id: string, campo: keyof Precos, valor: number | null) {
    setEstado((atual) => ({ ...atual, [id]: { ...valores(id), [campo]: valor } }));
    setErro(null);
  }

  const alterados = useMemo(
    () => Object.keys(estado).filter((id) => id in baseline && JSON.stringify(estado[id]) !== JSON.stringify(baseline[id])),
    [estado, baseline],
  );

  // Ref sempre com a versão mais nova de `salvarTodos` (redefinida a cada
  // render, closando sobre o `estado` atual) - o aviso de sair guarda essa
  // ref, não a função direto, senão "Salvar e sair" clicado bem depois do
  // aviso abrir salvaria um estado velho.
  const salvarTodosRef = useRef<() => Promise<boolean>>(async () => true);

  useEffect(() => {
    if (alterados.length > 0) {
      ativar("Você tem preços não salvos na Tabela de Precificação. Se sair agora, eles se perdem.", () => salvarTodosRef.current());
    } else {
      desativar();
    }
  }, [alterados.length, ativar, desativar]);
  useEffect(() => () => desativar(), [desativar]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return fichas;
    return fichas.filter(
      (f) => f.nome.toLowerCase().includes(termo) || f.sku.toLowerCase().includes(termo) || f.categoriaNome.toLowerCase().includes(termo),
    );
  }, [fichas, busca]);

  async function salvarTodos(): Promise<boolean> {
    const ids = alterados;
    if (ids.length === 0) return true;
    setErro(null);
    setSalvandoTodos(true);
    const resultado = await atualizarPrecosTodosCanaisFichasAction(ids.map((id) => ({ id, ...valores(id) })));
    setSalvandoTodos(false);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      return false;
    }
    setEstado({});
    router.refresh();
    return true;
  }
  useEffect(() => {
    salvarTodosRef.current = salvarTodos;
  });

  return (
    <div className={expandido ? "fixed inset-0 z-40 flex flex-col gap-2 bg-branco p-3" : "flex flex-col gap-2"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-azul-noite">
          {filtradas.length}
          {filtradas.length !== fichas.length ? ` de ${fichas.length}` : ""} pratos
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nome, SKU ou categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full max-w-[220px] rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-xs focus:border-ambar focus:outline-none"
          />
          <button
            type="button"
            onClick={salvarTodos}
            disabled={alterados.length === 0 || salvandoTodos}
            className="shrink-0 rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco hover:bg-azul-petroleo disabled:opacity-40"
          >
            {salvandoTodos ? "Salvando..." : `Salvar todos (${alterados.length})`}
          </button>
          <ControlesTabela scrollRef={scrollRef} expandido={expandido} onAlternarExpandir={alternar} />
        </div>
      </div>

      {erro && <p className="text-xs text-vermelho">{erro}</p>}

      <div
        ref={scrollRef}
        {...handlers}
        className={`${expandido ? "min-h-0 flex-1" : "max-h-[70vh]"} overflow-auto rounded-lg border border-cinza-claro bg-branco select-none ${
          arrastando ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        <table className="w-full min-w-[2300px] text-xs">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 whitespace-nowrap bg-azul-petroleo px-3 py-2 text-left font-semibold text-branco"
              >
                Nome
              </th>
              {(["salao", "delivery_proprio", "ifood", "99food"] as CanalVenda[]).map((canal) => {
                const estilo = CANAL_ESTILO[canal];
                return (
                  <th
                    key={canal}
                    colSpan={COLUNAS_POR_CANAL}
                    className={`sticky top-0 z-20 h-8 whitespace-nowrap border-l-2 border-branco/30 px-3 text-center text-sm font-bold ${estilo.bg} ${estilo.texto}`}
                  >
                    {estilo.rotulo}
                  </th>
                );
              })}
            </tr>
            <tr>
              {(["salao", "delivery_proprio", "ifood", "99food"] as CanalVenda[]).map((canal) => {
                const estilo = CANAL_ESTILO[canal];
                return (
                  <Fragment key={canal}>
                    <th className={`sticky top-8 z-20 whitespace-nowrap border-l-2 border-branco/30 px-2 py-2 text-right font-semibold ${estilo.bg} ${estilo.texto}`}>
                      Custo Insumos
                    </th>
                    <th className={`sticky top-8 z-20 whitespace-nowrap px-2 py-2 text-right font-semibold ${estilo.bg} ${estilo.texto}`}>
                      Preço Venda
                    </th>
                    <th className={`sticky top-8 z-20 whitespace-nowrap px-2 py-2 text-right font-semibold ${estilo.bg} ${estilo.texto}`}>
                      CMV
                    </th>
                    <th className={`sticky top-8 z-20 whitespace-nowrap px-2 py-2 text-right font-semibold ${estilo.bg} ${estilo.texto}`}>
                      Margem Contrib.
                    </th>
                    <th className={`sticky top-8 z-20 whitespace-nowrap px-2 py-2 text-center font-semibold ${estilo.bg} ${estilo.texto}`}>
                      Situação
                    </th>
                    <th className={`sticky top-8 z-20 whitespace-nowrap px-2 py-2 text-right font-semibold ${estilo.bg} ${estilo.texto}`}>
                      Preço Sugerido
                    </th>
                  </Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={1 + 4 * COLUNAS_POR_CANAL} className="p-6 text-center text-cinza-medio">
                  Nenhum prato encontrado.
                </td>
              </tr>
            )}
            {filtradas.map((ficha) => {
              const precos = valores(ficha.id);
              const canais = montarPrecosPorCanal({
                custoBase: ficha.custo.custoPorUnidade,
                custoComEmbalagem: ficha.custoComEmbalagem?.custoPorUnidade ?? null,
                precoVendaSalao: precos.precoVenda,
                precoVendaDeliveryProprio: precos.precoVendaDeliveryProprio,
                precoVendaIfood: precos.precoVendaIfood,
                precoVenda99Food: precos.precoVenda99Food,
                margemNecessaria,
                margemPontoEquilibrio,
                deducoesSalao,
                deducoesIfood,
                deducoes99Food,
              });
              return (
                <tr key={ficha.id} className="border-t border-cinza-claro">
                  <td className="sticky left-0 z-10 max-w-[160px] bg-branco px-3 py-1.5 font-medium text-cinza">
                    <button
                      type="button"
                      onClick={() => abrirFicha(ficha.id)}
                      className="block max-w-full truncate text-left hover:underline"
                      title="Abrir ficha técnica"
                    >
                      {ficha.nome}
                    </button>
                    <div className="truncate text-[10px] text-cinza-medio">
                      {ficha.sku} · {ficha.categoriaNome}
                    </div>
                  </td>
                  {canais.map((canal) => {
                    const cmv = canal.custoPorUnidade !== null ? calcularCmv(canal.custoPorUnidade, canal.precoPraticado) : null;
                    return (
                      <Fragment key={canal.canal}>
                        <td className="whitespace-nowrap border-l border-cinza-claro px-2 py-1.5 text-right text-cinza-medio">
                          {brl(canal.custoPorUnidade)}
                        </td>
                        <td className="px-1.5 py-1.5 text-right">
                          <CampoNumero
                            value={canal.precoPraticado}
                            onChange={(v) => atualizarCampo(ficha.id, CAMPO_POR_CANAL[canal.canal], v)}
                            className="w-[8ch]"
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-azul-noite">{pct(cmv)}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-cinza-medio">{brl(canal.margemContribuicaoValor)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {canal.classificacao ? (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${CLASSIFICACAO_TAG[canal.classificacao].classe}`}>
                              {CLASSIFICACAO_TAG[canal.classificacao].label}
                            </span>
                          ) : (
                            <span className="text-cinza-medio">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-azul-petroleo">{brl(canal.precoSugerido)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {fichaAbertaId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-azul-noite/60 sm:items-center sm:p-4"
          onClick={fecharFicha}
        >
          <div
            className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-off-white p-4 sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {carregando && <p className="p-6 text-center text-sm text-cinza-medio">Carregando...</p>}
            {erroAbertura && (
              <div className="flex flex-col items-start gap-3 p-2">
                <p className="text-sm text-vermelho">{erroAbertura}</p>
                <button type="button" onClick={fecharFicha} className="text-sm font-semibold text-azul-petroleo">
                  ← Fechar
                </button>
              </div>
            )}
            {dadosAbertos && (
              <FichaTecnicaDetalhe
                ficha={dadosAbertos.dados.ficha}
                podeGerir={dadosAbertos.podeGerir}
                categorias={dadosAbertos.dados.categorias}
                produtos={dadosAbertos.dados.produtos}
                fichasDisponiveis={dadosAbertos.dados.fichasDisponiveis}
                margemNecessaria={margemNecessaria}
                margemPontoEquilibrio={margemPontoEquilibrio}
                deducoesSalao={deducoesSalao}
                deducoesIfood={deducoesIfood}
                deducoes99Food={deducoes99Food}
                aoFechar={fecharFicha}
                aoSalvar={() => {
                  if (fichaAbertaId) void carregarFicha(fichaAbertaId);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
