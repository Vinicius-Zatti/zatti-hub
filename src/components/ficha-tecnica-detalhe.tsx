"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CAMADA_LABEL, formatarQuantidade } from "@/lib/fichas-tecnicas";
import { ExcluirFichaTecnicaBotao } from "@/components/excluir-ficha-tecnica-botao";
import { FichaTecnicaForm, type OpcaoFicha, type OpcaoProduto } from "@/components/ficha-tecnica-form";
import { PrecosCanalFicha } from "@/components/precos-canal-ficha";
import type { CategoriaFicha, FichaTecnica } from "@/lib/types";

const STATUS_LABEL = { ativa: "Ativa", rascunho: "Rascunho", inativa: "Inativa" } as const;

/** Editar troca a própria tela de detalhe pelo formulário, no mesmo lugar -
 * sem navegar pra outra URL. Categorias/produtos/fichas pra editar só vêm
 * preenchidas quando `podeGerir` (Operacional nunca edita, não precisa
 * carregar isso).
 *
 * `aoFechar`/`aoSalvar` são opcionais - sem eles (uso direto na rota
 * `/fichas-tecnicas/[id]`), "Voltar" chama `router.back()` (preserva a
 * posição de rolagem da listagem, é navegação de verdade pelo histórico) e
 * salvar dá `router.refresh()`. Com eles (uso dentro da janela sobreposta
 * na listagem, ver `ListaFichasTecnicas`), o botão vira "Fechar" e quem
 * decide o que fazer é o componente pai. */
export function FichaTecnicaDetalhe({
  ficha,
  podeGerir,
  categorias,
  produtos,
  fichasDisponiveis,
  margemNecessaria,
  margemPontoEquilibrio,
  deducoesSalao,
  deducoesIfood,
  deducoes99Food,
  aoFechar,
  aoSalvar,
}: {
  ficha: FichaTecnica;
  podeGerir: boolean;
  categorias: CategoriaFicha[];
  produtos: OpcaoProduto[];
  fichasDisponiveis: OpcaoFicha[];
  margemNecessaria: number | null;
  margemPontoEquilibrio: number | null;
  deducoesSalao: number;
  deducoesIfood: number;
  deducoes99Food: number;
  aoFechar?: () => void;
  aoSalvar?: (id: string) => void;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);

  function fechar() {
    if (aoFechar) aoFechar();
    else router.back();
  }

  if (editando) {
    return (
      <FichaTecnicaForm
        existente={ficha}
        categorias={categorias}
        produtos={produtos}
        fichasDisponiveis={fichasDisponiveis}
        onSalvo={(id) => {
          setEditando(false);
          if (aoSalvar) aoSalvar(id);
          else router.refresh();
        }}
        onCancelar={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-10">
      <button
        type="button"
        onClick={fechar}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-azul-petroleo"
      >
        ← {aoFechar ? "Fechar" : "Voltar"}
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">{ficha.nome}</h1>
          <p className="text-sm text-cinza-medio">
            {ficha.sku} · {CAMADA_LABEL[ficha.camada]} · {ficha.categoriaNome} · {STATUS_LABEL[ficha.status]}
          </p>
        </div>
        {podeGerir && (
          <div className="flex shrink-0 items-start gap-2">
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo"
            >
              Editar
            </button>
            <ExcluirFichaTecnicaBotao id={ficha.id} aoExcluir={aoFechar} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-cinza-claro bg-branco p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Rendimento</div>
          <div className="mt-1 text-lg font-bold text-azul-noite">
            {formatarQuantidade(ficha.rendimentoQuantidade)} {ficha.rendimentoUnidade}
          </div>
        </div>
        <div className="rounded-lg border border-cinza-claro bg-branco p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Tempo de preparo</div>
          <div className="mt-1 text-lg font-bold text-azul-noite">
            {ficha.tempoPreparoMinutos !== null ? `${ficha.tempoPreparoMinutos} min` : "-"}
          </div>
        </div>
      </div>

      {podeGerir && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Custo</div>
          {ficha.custo.custoTotal === null ? (
            <p className="text-sm text-cinza-medio">Sem componentes com preço cadastrado ainda.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-cinza-medio">Total da receita</span>
                <span className="font-display text-lg font-bold text-azul-noite">
                  {ficha.custo.custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              {ficha.custo.custoPorUnidade !== null && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm text-cinza-medio">Por {ficha.rendimentoUnidade}</span>
                  <span className="font-semibold text-azul-noite">
                    {ficha.custo.custoPorUnidade.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                </div>
              )}
              {!ficha.custo.completo && (
                <p className="mt-2 text-xs text-ambar">Custo parcial - algum componente ainda não tem preço no Estoque.</p>
              )}
              {ficha.camada === "VEN" && (
                <>
                  <div className="mt-2 flex items-center justify-between border-t border-cinza-claro pt-2">
                    <span className="text-sm text-cinza-medio">Embalagem (delivery)</span>
                    <span className="font-semibold text-azul-noite">{ficha.embalagemNome ?? "Nenhuma vinculada"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-cinza-medio">Preço de venda (Salão)</span>
                    <span className="font-semibold text-azul-noite">
                      {ficha.precoVenda !== null ? ficha.precoVenda.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-"}
                    </span>
                  </div>
                  {ficha.custo.custoPorUnidade !== null && ficha.precoVenda !== null && ficha.precoVenda > 0 && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-sm text-cinza-medio">CMV</span>
                      <span className="font-semibold text-azul-noite">
                        {((ficha.custo.custoPorUnidade / ficha.precoVenda) * 100).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        %
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {podeGerir && ficha.camada === "VEN" && (
        <PrecosCanalFicha
          fichaId={ficha.id}
          custoBase={ficha.custo.custoPorUnidade}
          custoComEmbalagem={ficha.custoComEmbalagem?.custoPorUnidade ?? null}
          temEmbalagem={ficha.embalagemFichaId !== null}
          precoVendaSalao={ficha.precoVenda}
          precoVendaDeliveryProprioInicial={ficha.precoVendaDeliveryProprio}
          precoVendaIfoodInicial={ficha.precoVendaIfood}
          precoVenda99FoodInicial={ficha.precoVenda99Food}
          margemNecessaria={margemNecessaria}
          margemPontoEquilibrio={margemPontoEquilibrio}
          deducoesSalao={deducoesSalao}
          deducoesIfood={deducoesIfood}
          deducoes99Food={deducoes99Food}
        />
      )}

      <div className="rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
          Componentes ({ficha.componentes.length})
        </div>
        {ficha.componentes.length === 0 ? (
          <p className="text-sm text-cinza-medio">Nenhum componente cadastrado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-cinza-claro">
            {ficha.componentes.map((c) => (
              <li key={c.id ?? `${c.produtoSku}-${c.fichaComponenteId}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-cinza">{c.nomeExibicao}</div>
                  {c.observacoes && <div className="text-xs text-cinza-medio">{c.observacoes}</div>}
                </div>
                <span className="shrink-0 text-sm font-bold text-azul-noite">
                  {formatarQuantidade(c.quantidade)} {c.unidadeUso}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Modo de preparo</div>
        {ficha.etapas.length === 0 ? (
          <p className="text-sm text-cinza-medio">Nenhuma etapa cadastrada.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {ficha.etapas.map((etapa, indice) => (
              <li key={etapa.ordem} className="flex gap-3 text-sm text-cinza">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-azul-noite text-xs font-bold text-branco">
                  {indice + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{etapa.descricao}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {ficha.observacoesOperacionais && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Observações</div>
          <p className="text-sm leading-relaxed text-cinza">{ficha.observacoesOperacionais}</p>
        </div>
      )}

      {podeGerir && ficha.observacoesGerenciais && (
        <div className="rounded-lg border border-ambar/60 bg-ambar/5 p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ambar">Gerencial</div>
          <p className="text-sm leading-relaxed text-cinza">{ficha.observacoesGerenciais}</p>
        </div>
      )}
    </div>
  );
}
