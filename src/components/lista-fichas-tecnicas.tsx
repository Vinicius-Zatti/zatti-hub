"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { ControlesTabela } from "@/components/tabela-rolavel";
import { useArrastarParaRolar } from "@/components/use-arrastar-para-rolar";
import { useTabelaExpansivel } from "@/components/use-tabela-expansivel";
import { FichaTecnicaDetalhe } from "@/components/ficha-tecnica-detalhe";
import { FichaTecnicaForm } from "@/components/ficha-tecnica-form";
import type { CamadaFicha, FichaTecnicaResumo, StatusFicha } from "@/lib/types";
import { CAMADA_LABEL, formatarQuantidade } from "@/lib/fichas-tecnicas";
import {
  abrirFichaTecnicaAction,
  prepararNovaFichaTecnicaAction,
  type ResultadoAbrirFicha,
} from "@/app/(app)/fichas-tecnicas/actions";
import type { DadosNovaFichaTecnica } from "@/lib/banco/fichas-tecnicas";

const STATUS_TONE: Record<StatusFicha, string> = {
  ativa: "bg-verde/10 text-verde",
  rascunho: "bg-ambar/10 text-ambar",
  inativa: "bg-cinza-claro text-cinza-medio",
};

const STATUS_LABEL: Record<StatusFicha, string> = {
  ativa: "Ativa",
  rascunho: "Rascunho",
  inativa: "Inativa",
};

function brl(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Só cadastro da receita (nome, custo, status) - preço de venda e margem
 * por canal saíram daqui e viraram a Tabela de Precificação
 * (`/fichas-tecnicas/precificacao`), que edita os 4 preços de uma vez sem
 * misturar com esta listagem. */
export function ListaFichasTecnicas({
  fichas,
  podeGerir,
  margemNecessaria,
  margemPontoEquilibrio,
  deducoesTotal,
  deducoesIfood,
  deducoes99Food,
}: {
  fichas: FichaTecnicaResumo[];
  podeGerir: boolean;
  /** Repassados só pro card "Preços por Canal" dentro do detalhe da ficha
   * (`FichaTecnicaDetalhe`) - a listagem em si não mostra mais preço/margem
   * (ver Tabela de Precificação, `/fichas-tecnicas/precificacao`). */
  margemNecessaria: number | null;
  margemPontoEquilibrio: number | null;
  deducoesTotal: number;
  deducoesIfood: number;
  deducoes99Food: number;
}) {
  const router = useRouter();
  const [camada, setCamada] = useState<CamadaFicha>("PRE");
  const [busca, setBusca] = useState("");
  const { expandido, alternar } = useTabelaExpansivel();
  const { scrollRef, handlers, arrastando } = useArrastarParaRolar<HTMLDivElement>();

  const [fichaAbertaId, setFichaAbertaId] = useState<string | null>(null);
  const [dadosAbertos, setDadosAbertos] = useState<ResultadoAbrirFicha & { ok: true }>();
  const [carregando, setCarregando] = useState(false);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);

  const [criando, setCriando] = useState(false);
  const [dadosNovo, setDadosNovo] = useState<DadosNovaFichaTecnica>();
  const [carregandoNovo, setCarregandoNovo] = useState(false);
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  const daCamada = useMemo(() => fichas.filter((f) => f.camada === camada), [fichas, camada]);
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return daCamada;
    return daCamada.filter(
      (f) =>
        f.nome.toLowerCase().includes(termo) ||
        f.sku.toLowerCase().includes(termo) ||
        f.categoriaNome.toLowerCase().includes(termo),
    );
  }, [daCamada, busca]);

  async function carregar(id: string) {
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

  function abrir(id: string) {
    setFichaAbertaId(id);
    setDadosAbertos(undefined);
    void carregar(id);
  }

  function fechar() {
    setFichaAbertaId(null);
    setDadosAbertos(undefined);
    setErroAbertura(null);
    router.refresh();
  }

  async function abrirNovo() {
    setCriando(true);
    setDadosNovo(undefined);
    setErroNovo(null);
    setCarregandoNovo(true);
    const resultado = await prepararNovaFichaTecnicaAction();
    setCarregandoNovo(false);
    if (!resultado.ok) {
      setErroNovo(resultado.mensagem);
      return;
    }
    setDadosNovo(resultado.dados);
  }

  function fecharNovo() {
    setCriando(false);
    setDadosNovo(undefined);
    setErroNovo(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["PRE", "VEN"] as CamadaFicha[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCamada(c)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                camada === c ? "bg-azul-noite text-branco" : "border border-cinza-claro text-cinza-medio"
              }`}
            >
              {CAMADA_LABEL[c]}
            </button>
          ))}
        </div>
        {podeGerir && (
          <button
            type="button"
            onClick={abrirNovo}
            className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
          >
            + Criar Nova F.T
          </button>
        )}
      </div>

      <div className={expandido ? "fixed inset-0 z-40 flex flex-col gap-2 bg-branco p-3" : "flex flex-col gap-2"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-azul-noite">
            {filtradas.length}
            {filtradas.length !== daCamada.length ? ` de ${daCamada.length}` : ""} fichas
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Buscar por nome, SKU ou categoria..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full max-w-[220px] rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-xs focus:border-ambar focus:outline-none"
            />
            <ControlesTabela scrollRef={scrollRef} expandido={expandido} onAlternarExpandir={alternar} />
          </div>
        </div>

        <div
          ref={scrollRef}
          {...handlers}
          className={`${expandido ? "min-h-0 flex-1" : "max-h-[70vh]"} overflow-auto rounded-lg border border-cinza-claro bg-branco select-none ${
            arrastando ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th fixo>Nome</Th>
                {camada === "PRE" ? (
                  <>
                    <Th align="right">Rende</Th>
                    {podeGerir && <Th align="right">Valor da Unidade</Th>}
                  </>
                ) : (
                  podeGerir && (
                    <>
                      <Th align="right">Custo Insumos (Presencial)</Th>
                      <Th align="right">Custo Insumos Delivery</Th>
                    </>
                  )
                )}
                <Th align="center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-cinza-medio">
                    Nenhuma ficha encontrada em {CAMADA_LABEL[camada]}.
                  </td>
                </tr>
              )}
              {filtradas.map((ficha) => {
                const custoInsumos = ficha.custo.custoPorUnidade;
                const custoDelivery = ficha.custoComEmbalagem?.custoPorUnidade ?? custoInsumos;
                return (
                  <tr
                    key={ficha.id}
                    onClick={() => abrir(ficha.id)}
                    data-nao-arrastar
                    className="cursor-pointer border-b border-cinza-claro last:border-0 hover:bg-off-white"
                  >
                    <td className="max-w-[160px] px-2 py-1.5 font-medium text-cinza">
                      <div className="truncate">{ficha.nome}</div>
                      <div className="truncate text-[10px] text-cinza-medio">
                        {ficha.sku} · {ficha.categoriaNome}
                      </div>
                    </td>
                    {camada === "PRE" ? (
                      <>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right text-cinza-medio">
                          {formatarQuantidade(ficha.rendimentoQuantidade)} {ficha.rendimentoUnidade}
                        </td>
                        {podeGerir && (
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-azul-noite">{brl(custoInsumos)}</td>
                        )}
                      </>
                    ) : (
                      podeGerir && (
                        <>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-azul-noite">{brl(custoInsumos)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-azul-noite">{brl(custoDelivery)}</td>
                        </>
                      )
                    )}
                    <td className="px-2 py-1.5 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[ficha.status]}`}>
                        {STATUS_LABEL[ficha.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {fichaAbertaId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-azul-noite/60 sm:items-center sm:p-4"
          onClick={fechar}
        >
          <div
            className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-off-white p-4 sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {carregando && <p className="p-6 text-center text-sm text-cinza-medio">Carregando...</p>}
            {erroAbertura && (
              <div className="flex flex-col items-start gap-3 p-2">
                <p className="text-sm text-vermelho">{erroAbertura}</p>
                <button type="button" onClick={fechar} className="text-sm font-semibold text-azul-petroleo">
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
                deducoesSalao={deducoesTotal}
                deducoesIfood={deducoesIfood}
                deducoes99Food={deducoes99Food}
                aoFechar={fechar}
                aoSalvar={() => {
                  if (fichaAbertaId) void carregar(fichaAbertaId);
                }}
              />
            )}
          </div>
        </div>
      )}

      {criando && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-azul-noite/60 sm:items-center sm:p-4"
          onClick={fecharNovo}
        >
          <div
            className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-off-white p-4 sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {carregandoNovo && <p className="p-6 text-center text-sm text-cinza-medio">Carregando...</p>}
            {erroNovo && (
              <div className="flex flex-col items-start gap-3 p-2">
                <p className="text-sm text-vermelho">{erroNovo}</p>
                <button type="button" onClick={fecharNovo} className="text-sm font-semibold text-azul-petroleo">
                  ← Fechar
                </button>
              </div>
            )}
            {dadosNovo && (
              <FichaTecnicaForm
                categorias={dadosNovo.categorias}
                produtos={dadosNovo.produtos}
                fichasDisponiveis={dadosNovo.fichasDisponiveis}
                onSalvo={() => {
                  fecharNovo();
                  router.refresh();
                }}
                onCancelar={fecharNovo}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
