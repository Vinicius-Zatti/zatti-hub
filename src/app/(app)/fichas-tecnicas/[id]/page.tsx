import Link from "next/link";
import { getAcessoAtual } from "@/lib/acesso";
import { getFichaTecnicaCompleta } from "@/lib/banco/fichas-tecnicas";
import { CAMADA_LABEL } from "@/lib/fichas-tecnicas";
import { ExcluirFichaTecnicaBotao } from "@/components/excluir-ficha-tecnica-botao";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { ativa: "Ativa", rascunho: "Rascunho", inativa: "Inativa" } as const;

export default async function FichaTecnicaPage({ params }: { params: Promise<{ id: string }> }) {
  const acesso = await getAcessoAtual();
  const { id } = await params;
  const ficha = await getFichaTecnicaCompleta(acesso.unidadeId, id);
  const podeGerir = acesso.role !== "operacional";

  if (!ficha) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
        Ficha técnica não encontrada - pode já ter sido removida, ou o link está errado.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">{ficha.nome}</h1>
          <p className="text-sm text-cinza-medio">
            {ficha.sku} · {CAMADA_LABEL[ficha.camada]} · {ficha.categoriaNome} · {STATUS_LABEL[ficha.status]}
          </p>
        </div>
        {podeGerir && (
          <div className="flex shrink-0 items-start gap-2">
            <Link
              href={`/fichas-tecnicas/${ficha.id}/editar`}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo"
            >
              Editar
            </Link>
            <ExcluirFichaTecnicaBotao id={ficha.id} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-cinza-claro bg-branco p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Rendimento</div>
          <div className="mt-1 text-lg font-bold text-azul-noite">
            {ficha.rendimentoQuantidade} {ficha.rendimentoUnidade}
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
            </>
          )}
        </div>
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
                  {c.quantidade} {c.unidadeUso}
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
