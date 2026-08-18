"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CamadaFicha, FichaTecnicaResumo, StatusFicha } from "@/lib/types";
import { agruparFichasPorCategoria, CAMADA_LABEL, formatarQuantidade } from "@/lib/fichas-tecnicas";
import { abrirFichaTecnicaAction, type ResultadoAbrirFicha } from "@/app/(app)/fichas-tecnicas/actions";
import { FichaTecnicaDetalhe } from "@/components/ficha-tecnica-detalhe";

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

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ListaFichasTecnicas({ fichas, podeGerir }: { fichas: FichaTecnicaResumo[]; podeGerir: boolean }) {
  const router = useRouter();
  const [camada, setCamada] = useState<CamadaFicha>("PRE");
  const [fichaAbertaId, setFichaAbertaId] = useState<string | null>(null);
  const [dadosAbertos, setDadosAbertos] = useState<ResultadoAbrirFicha & { ok: true }>();
  const [carregando, setCarregando] = useState(false);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);

  const daCamada = fichas.filter((f) => f.camada === camada);
  const grupos = agruparFichasPorCategoria(daCamada);

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

  return (
    <div className="flex flex-col gap-4">
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

      {grupos.length === 0 && (
        <p className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-sm text-cinza-medio">
          Nenhuma ficha cadastrada em {CAMADA_LABEL[camada]} ainda.
        </p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.categoriaId} className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">{grupo.categoriaNome}</div>
          <div className="flex flex-col gap-2">
            {grupo.fichas.map((ficha) => (
              <button
                key={ficha.id}
                type="button"
                onClick={() => abrir(ficha.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-cinza-claro bg-branco p-4 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-azul-noite">{ficha.nome}</div>
                  <div className="text-xs text-cinza-medio">
                    {ficha.sku} · Rende {formatarQuantidade(ficha.rendimentoQuantidade)} {ficha.rendimentoUnidade}
                  </div>
                  {podeGerir && ficha.custo.custoPorUnidade !== null && (
                    <div className="text-xs font-semibold text-azul-petroleo">
                      {brl(ficha.custo.custoPorUnidade)}/{ficha.rendimentoUnidade}
                      {!ficha.custo.completo && " (parcial)"}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[ficha.status]}`}>
                  {STATUS_LABEL[ficha.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

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
                aoFechar={fechar}
                aoSalvar={() => {
                  if (fichaAbertaId) void carregar(fichaAbertaId);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
