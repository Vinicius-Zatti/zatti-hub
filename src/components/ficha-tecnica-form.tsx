"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { useGuardaEdicao } from "@/components/guarda-edicao";
import { salvarFichaTecnicaAction } from "@/app/(app)/fichas-tecnicas/actions";
import { CAMADA_LABEL, reordenarComponentes, reordenarEtapas } from "@/lib/fichas-tecnicas";
import type {
  CamadaFicha,
  CategoriaFicha,
  ComponenteFicha,
  EtapaFicha,
  FichaTecnica,
  StatusFicha,
  UnidadeRendimentoFicha,
} from "@/lib/types";
import type { EntradaFichaTecnica } from "@/lib/banco/fichas-tecnicas";

const STATUS_LABEL: Record<StatusFicha, string> = {
  rascunho: "Rascunho",
  ativa: "Ativa",
  inativa: "Inativa",
};

const MENSAGEM_GUARDA = "Você tem uma ficha técnica não salva. Se sair agora, ela se perde.";

export type OpcaoProduto = { sku: string; nome: string; unidadeBase: string };
export type OpcaoFicha = { id: string; nome: string; sku: string };

function novoComponente(ordem: number): ComponenteFicha {
  return {
    id: null,
    tipo: "produto",
    produtoSku: "",
    fichaComponenteId: null,
    nomeExibicao: "",
    unidadeUso: "",
    quantidade: 0,
    ordem,
    observacoes: "",
  };
}

function novaEtapa(ordem: number): EtapaFicha {
  return { ordem, descricao: "" };
}

export function FichaTecnicaForm({
  existente,
  categorias,
  produtos,
  fichasDisponiveis,
}: {
  existente?: FichaTecnica;
  categorias: CategoriaFicha[];
  produtos: OpcaoProduto[];
  fichasDisponiveis: OpcaoFicha[];
}) {
  const router = useRouter();
  const { ativar, desativar } = useGuardaEdicao();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [camada, setCamada] = useState<CamadaFicha>(existente?.camada ?? "PRE");
  const [categoriaId, setCategoriaId] = useState(existente?.categoriaId ?? "");
  const [nome, setNome] = useState(existente?.nome ?? "");
  const [rendimentoQuantidade, setRendimentoQuantidade] = useState<number | null>(
    existente?.rendimentoQuantidade ?? null,
  );
  const [rendimentoUnidade, setRendimentoUnidade] = useState<UnidadeRendimentoFicha>(
    existente?.rendimentoUnidade ?? "KG",
  );
  const [precoVenda, setPrecoVenda] = useState<number | null>(existente?.precoVenda ?? null);
  const [tempoPreparoMinutos, setTempoPreparoMinutos] = useState<number | null>(
    existente?.tempoPreparoMinutos ?? null,
  );
  const [status, setStatus] = useState<StatusFicha>(existente?.status ?? "rascunho");
  const [obsOperacionais, setObsOperacionais] = useState(existente?.observacoesOperacionais ?? "");
  const [obsGerenciais, setObsGerenciais] = useState(existente?.observacoesGerenciais ?? "");
  const [componentes, setComponentes] = useState<ComponenteFicha[]>(existente?.componentes ?? []);
  const [etapas, setEtapas] = useState<EtapaFicha[]>(existente?.etapas ?? []);

  const categoriasFiltradas = categorias.filter((c) => c.camada === camada && c.ativo);
  const fichasParaEscolher = fichasDisponiveis.filter((f) => f.id !== existente?.id);

  function editar<T>(setter: (v: T) => void, valor: T) {
    setter(valor);
    ativar(MENSAGEM_GUARDA);
  }

  function mudarCamada(valor: CamadaFicha) {
    editar(setCamada, valor);
    if (!categorias.some((c) => c.camada === valor && c.id === categoriaId)) {
      setCategoriaId("");
    }
  }

  function atualizarComponente(indice: number, valor: ComponenteFicha) {
    editar(
      setComponentes,
      componentes.map((c, i) => (i === indice ? valor : c)),
    );
  }

  function removerComponente(indice: number) {
    editar(
      setComponentes,
      reordenarComponentes(componentes.filter((_, i) => i !== indice)),
    );
  }

  function moverComponente(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= componentes.length) return;
    const copia = [...componentes];
    [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
    editar(setComponentes, reordenarComponentes(copia));
  }

  function atualizarEtapa(indice: number, valor: EtapaFicha) {
    editar(
      setEtapas,
      etapas.map((e, i) => (i === indice ? valor : e)),
    );
  }

  function removerEtapa(indice: number) {
    editar(setEtapas, reordenarEtapas(etapas.filter((_, i) => i !== indice)));
  }

  function moverEtapa(indice: number, direcao: -1 | 1) {
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= etapas.length) return;
    const copia = [...etapas];
    [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
    editar(setEtapas, reordenarEtapas(copia));
  }

  function montarInput(): EntradaFichaTecnica {
    return {
      categoriaId,
      camada,
      nome,
      rendimentoQuantidade: rendimentoQuantidade ?? 0,
      rendimentoUnidade,
      precoVenda,
      tempoPreparoMinutos,
      fotoPath: existente?.fotoPath ?? null,
      observacoesOperacionais: obsOperacionais,
      observacoesGerenciais: obsGerenciais,
      status,
      componentes: reordenarComponentes(componentes).map((c) => ({
        tipo: c.tipo,
        produtoSku: c.tipo === "produto" ? c.produtoSku : null,
        fichaComponenteId: c.tipo === "ficha" ? c.fichaComponenteId : null,
        quantidade: c.quantidade,
        unidadeUso: c.unidadeUso,
        ordem: c.ordem,
        observacoes: c.observacoes,
      })),
      etapas: reordenarEtapas(etapas).map((e) => ({ ordem: e.ordem, descricao: e.descricao })),
    };
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await salvarFichaTecnicaAction(existente?.id ?? null, montarInput());
      if (resultado.ok) {
        desativar();
        router.push(`/fichas-tecnicas/${resultado.id}`);
        router.refresh();
        return;
      }
      setErro(resultado.mensagem);
    });
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">
          {existente ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}
        </h1>
        <p className="text-sm text-cinza-medio">
          {existente ? `SKU ${existente.sku} - versão ${existente.versao}` : "O SKU é gerado automaticamente ao salvar."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Identificação</div>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Camada
              <select
                value={camada}
                disabled={!!existente}
                onChange={(e) => mudarCamada(e.target.value as CamadaFicha)}
                className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza disabled:opacity-60"
              >
                <option value="PRE">{CAMADA_LABEL.PRE} (insumo interno)</option>
                <option value="VEN">{CAMADA_LABEL.VEN} (item vendável)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Categoria
              <select
                required
                value={categoriaId}
                onChange={(e) => editar(setCategoriaId, e.target.value)}
                className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
              >
                <option value="" disabled>
                  Selecione uma categoria
                </option>
                {categoriasFiltradas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              {categoriasFiltradas.length === 0 && (
                <span className="text-xs text-ambar">
                  Nenhuma categoria cadastrada pra essa camada ainda - crie uma em Categorias.
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Nome da ficha
              <input
                required
                value={nome}
                onChange={(e) => editar(setNome, e.target.value)}
                className="w-full rounded-md border border-cinza-claro px-3 py-2 text-base text-cinza"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Status
              <select
                value={status}
                onChange={(e) => editar(setStatus, e.target.value as StatusFicha)}
                className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
              >
                {(Object.keys(STATUS_LABEL) as StatusFicha[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Rendimento e custo</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Rendimento
              <CampoNumero value={rendimentoQuantidade} onChange={(v) => editar(setRendimentoQuantidade, v)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Unidade
              <select
                value={rendimentoUnidade}
                onChange={(e) => editar(setRendimentoUnidade, e.target.value as UnidadeRendimentoFicha)}
                className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
              >
                <option value="KG">KG</option>
                <option value="LT">LT</option>
                <option value="UN">UN</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Preço de venda
              <CampoNumero value={precoVenda} onChange={(v) => editar(setPrecoVenda, v)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Tempo de preparo (min)
              <CampoNumero
                value={tempoPreparoMinutos}
                onChange={(v) => editar(setTempoPreparoMinutos, v === null ? null : Math.round(v))}
                decimais={0}
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Componentes</span>
            <button
              type="button"
              onClick={() => editar(setComponentes, [...componentes, novoComponente(componentes.length)])}
              className="rounded-md border border-azul-noite px-2 py-1 text-xs font-semibold text-azul-noite"
            >
              + Adicionar
            </button>
          </div>
          {componentes.length === 0 && (
            <p className="text-sm text-cinza-medio">Nenhum componente ainda - adicione o primeiro insumo.</p>
          )}
          <div className="flex flex-col gap-3">
            {componentes.map((componente, indice) => (
              <LinhaComponente
                key={indice}
                componente={componente}
                produtos={produtos}
                fichasDisponiveis={fichasParaEscolher}
                onChange={(v) => atualizarComponente(indice, v)}
                onRemover={() => removerComponente(indice)}
                onSubir={() => moverComponente(indice, -1)}
                onDescer={() => moverComponente(indice, 1)}
                podeSubir={indice > 0}
                podeDescer={indice < componentes.length - 1}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Modo de preparo</span>
            <button
              type="button"
              onClick={() => editar(setEtapas, [...etapas, novaEtapa(etapas.length)])}
              className="rounded-md border border-azul-noite px-2 py-1 text-xs font-semibold text-azul-noite"
            >
              + Adicionar etapa
            </button>
          </div>
          {etapas.length === 0 && <p className="text-sm text-cinza-medio">Nenhuma etapa ainda.</p>}
          <div className="flex flex-col gap-3">
            {etapas.map((etapa, indice) => (
              <div key={indice} className="rounded-md border border-cinza-claro p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-cinza-medio">Passo {indice + 1}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moverEtapa(indice, -1)}
                      disabled={indice === 0}
                      className="rounded border border-cinza-claro px-2 py-0.5 text-xs disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moverEtapa(indice, 1)}
                      disabled={indice === etapas.length - 1}
                      className="rounded border border-cinza-claro px-2 py-0.5 text-xs disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button type="button" onClick={() => removerEtapa(indice)} className="text-xs font-semibold text-vermelho">
                      Remover
                    </button>
                  </div>
                </div>
                <textarea
                  required
                  value={etapa.descricao}
                  onChange={(e) => atualizarEtapa(indice, { ...etapa, descricao: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Observações</div>
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Pra quem prepara (visível pra todos)
            <textarea
              value={obsOperacionais}
              onChange={(e) => editar(setObsOperacionais, e.target.value)}
              rows={3}
              className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
            />
          </label>
          <label className="mt-3 flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Gerenciais (custo, fornecedor alternativo etc.)
            <textarea
              value={obsGerenciais}
              onChange={(e) => editar(setObsGerenciais, e.target.value)}
              rows={3}
              className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
            />
          </label>
        </div>

        {erro && <p className="text-sm text-vermelho">{erro}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-ambar px-4 py-3.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar ficha técnica"}
        </button>
      </form>
    </div>
  );
}

function LinhaComponente({
  componente,
  produtos,
  fichasDisponiveis,
  onChange,
  onRemover,
  onSubir,
  onDescer,
  podeSubir,
  podeDescer,
}: {
  componente: ComponenteFicha;
  produtos: OpcaoProduto[];
  fichasDisponiveis: OpcaoFicha[];
  onChange: (v: ComponenteFicha) => void;
  onRemover: () => void;
  onSubir: () => void;
  onDescer: () => void;
  podeSubir: boolean;
  podeDescer: boolean;
}) {
  return (
    <div className="rounded-md border border-cinza-claro p-3">
      <div className="flex items-center justify-between gap-2">
        <select
          value={componente.tipo}
          onChange={(e) =>
            onChange({
              ...componente,
              tipo: e.target.value as "produto" | "ficha",
              produtoSku: "",
              fichaComponenteId: null,
            })
          }
          className="rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-cinza"
        >
          <option value="produto">Produto do Estoque</option>
          <option value="ficha">Sub-receita (outra ficha)</option>
        </select>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onSubir} disabled={!podeSubir} className="rounded border border-cinza-claro px-2 py-0.5 text-xs disabled:opacity-30">
            ↑
          </button>
          <button type="button" onClick={onDescer} disabled={!podeDescer} className="rounded border border-cinza-claro px-2 py-0.5 text-xs disabled:opacity-30">
            ↓
          </button>
          <button type="button" onClick={onRemover} className="text-xs font-semibold text-vermelho">
            Remover
          </button>
        </div>
      </div>

      {componente.tipo === "produto" ? (
        <select
          required
          value={componente.produtoSku ?? ""}
          onChange={(e) => onChange({ ...componente, produtoSku: e.target.value })}
          className="mt-2 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        >
          <option value="" disabled>
            Selecione um produto
          </option>
          {produtos.map((p) => (
            <option key={p.sku} value={p.sku}>
              {p.nome} ({p.unidadeBase})
            </option>
          ))}
        </select>
      ) : (
        <select
          required
          value={componente.fichaComponenteId ?? ""}
          onChange={(e) => onChange({ ...componente, fichaComponenteId: e.target.value })}
          className="mt-2 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        >
          <option value="" disabled>
            Selecione uma ficha
          </option>
          {fichasDisponiveis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.sku})
            </option>
          ))}
        </select>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-cinza-medio">
          Quantidade
          <CampoNumero value={componente.quantidade} onChange={(v) => onChange({ ...componente, quantidade: v ?? 0 })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-cinza-medio">
          Unidade de uso
          <input
            required
            value={componente.unidadeUso}
            onChange={(e) => onChange({ ...componente, unidadeUso: e.target.value.toUpperCase() })}
            placeholder="KG, UN, ML..."
            className="rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
      </div>

      <input
        value={componente.observacoes}
        onChange={(e) => onChange({ ...componente, observacoes: e.target.value })}
        placeholder="Observação (opcional)"
        className="mt-2 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
      />
    </div>
  );
}
