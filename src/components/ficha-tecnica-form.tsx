"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { useGuardaEdicao } from "@/components/guarda-edicao";
import { criarCategoriaFichaAction, salvarFichaTecnicaAction } from "@/app/(app)/fichas-tecnicas/actions";
import { CAMADA_LABEL, calcularCustoEstimado, reordenarComponentes, reordenarEtapas } from "@/lib/fichas-tecnicas";
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

export type OpcaoProduto = { sku: string; nome: string; unidadeUso: string; custoUnitario: number | null; grupo: string };
export type OpcaoFicha = {
  id: string;
  nome: string;
  sku: string;
  rendimentoUnidade: UnidadeRendimentoFicha;
  custoPorUnidade: number | null;
};

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

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
  categorias: categoriasIniciais,
  produtos,
  fichasDisponiveis,
  onSalvo,
  onCancelar,
}: {
  existente?: FichaTecnica;
  categorias: CategoriaFicha[];
  produtos: OpcaoProduto[];
  fichasDisponiveis: OpcaoFicha[];
  /** Quando informado, o form vira "in-place" (usado dentro da própria tela
   * de detalhe) - em vez de navegar pra `/fichas-tecnicas/[id]`, avisa o
   * componente pai que salvou, pra ele voltar sozinho pro modo de leitura. */
  onSalvo?: (id: string) => void;
  onCancelar?: () => void;
}) {
  const router = useRouter();
  const { ativar, desativar } = useGuardaEdicao();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [camada, setCamada] = useState<CamadaFicha>(existente?.camada ?? "PRE");
  const [categorias, setCategorias] = useState<CategoriaFicha[]>(categoriasIniciais);
  const [categoriaId, setCategoriaId] = useState(existente?.categoriaId ?? "");
  const [nome, setNome] = useState(existente?.nome ?? "");
  const [rendimentoQuantidade, setRendimentoQuantidade] = useState<number | null>(
    existente?.rendimentoQuantidade ?? null,
  );
  const [rendimentoUnidade, setRendimentoUnidade] = useState<UnidadeRendimentoFicha>(
    existente?.rendimentoUnidade ?? "KG",
  );
  const [precoVenda, setPrecoVenda] = useState<number | null>(existente?.precoVenda ?? null);
  const [embalagemFichaId, setEmbalagemFichaId] = useState<string | null>(existente?.embalagemFichaId ?? null);
  const [embalagemProdutoSku, setEmbalagemProdutoSku] = useState<string | null>(existente?.embalagemProdutoSku ?? null);
  const [modoEmbalagem, setModoEmbalagem] = useState<"nenhuma" | "ficha" | "produto">(
    existente?.embalagemProdutoSku ? "produto" : existente?.embalagemFichaId ? "ficha" : "nenhuma",
  );
  const [tempoPreparoMinutos, setTempoPreparoMinutos] = useState<number | null>(
    existente?.tempoPreparoMinutos ?? null,
  );
  const [status, setStatus] = useState<StatusFicha>(existente?.status ?? "rascunho");
  const [obsOperacionais, setObsOperacionais] = useState(existente?.observacoesOperacionais ?? "");
  const [obsGerenciais, setObsGerenciais] = useState(existente?.observacoesGerenciais ?? "");
  const [componentes, setComponentes] = useState<ComponenteFicha[]>(existente?.componentes ?? []);
  const [etapas, setEtapas] = useState<EtapaFicha[]>(existente?.etapas ?? []);

  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [codigoCategoria, setCodigoCategoria] = useState("");
  const [nomeCategoria, setNomeCategoria] = useState("");
  const [erroCategoria, setErroCategoria] = useState<string | null>(null);
  const [salvandoCategoria, startTransitionCategoria] = useTransition();

  const categoriasFiltradas = categorias.filter((c) => c.camada === camada && c.ativo);
  const fichasParaEscolher = fichasDisponiveis.filter((f) => f.id !== existente?.id);
  // SKU sempre começa com a camada (PRE/VEN) - garantido pelo check
  // constraint da tabela, mais barato que carregar a camada de cada opção.
  const fichasEmbalagem = fichasParaEscolher.filter((f) => f.sku.startsWith("PRE"));
  const produtosEmbalagem = produtos.filter((p) => p.grupo === "EMB");

  const custosPorProdutoSku = new Map(produtos.map((p) => [p.sku, p.custoUnitario]));
  const custosPorFichaId = new Map(fichasParaEscolher.map((f) => [f.id, f.custoPorUnidade]));
  const custoEstimado = calcularCustoEstimado(componentes, custosPorProdutoSku, custosPorFichaId, rendimentoQuantidade ?? 0);

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

  /** Ficha e produto são mutuamente exclusivos (check constraint no banco) -
   * trocar de modo sempre limpa o outro campo, nunca manda os dois juntos. */
  function mudarModoEmbalagem(valor: "nenhuma" | "ficha" | "produto") {
    editar(setModoEmbalagem, valor);
    if (valor !== "ficha") setEmbalagemFichaId(null);
    if (valor !== "produto") setEmbalagemProdutoSku(null);
  }

  function criarCategoriaInline(e: FormEvent) {
    e.preventDefault();
    setErroCategoria(null);
    startTransitionCategoria(async () => {
      const resultado = await criarCategoriaFichaAction({ camada, codigo: codigoCategoria, nome: nomeCategoria });
      if (!resultado.ok) {
        setErroCategoria(resultado.mensagem);
        return;
      }
      setCategorias((atual) => [...atual, resultado.categoria]);
      editar(setCategoriaId, resultado.categoria.id);
      setCodigoCategoria("");
      setNomeCategoria("");
      setCriandoCategoria(false);
    });
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
      precoVenda: camada === "VEN" ? precoVenda : null,
      embalagemFichaId: camada === "VEN" ? embalagemFichaId : null,
      embalagemProdutoSku: camada === "VEN" ? embalagemProdutoSku : null,
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
    if (!categoriaId) {
      setErro("Selecione uma categoria.");
      return;
    }
    if (componentes.some((c) => (c.tipo === "produto" ? !c.produtoSku : !c.fichaComponenteId))) {
      setErro("Selecione um produto ou ficha pra cada componente antes de salvar.");
      return;
    }
    startTransition(async () => {
      const resultado = await salvarFichaTecnicaAction(existente?.id ?? null, montarInput());
      if (resultado.ok) {
        desativar();
        if (onSalvo) {
          onSalvo(resultado.id);
        } else {
          router.push(`/fichas-tecnicas/${resultado.id}`);
          router.refresh();
        }
        return;
      }
      setErro(resultado.mensagem);
    });
  }

  function cancelar() {
    desativar();
    onCancelar?.();
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

            <div className="flex flex-col gap-1">
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
              </label>
              {!criandoCategoria ? (
                <button
                  type="button"
                  onClick={() => setCriandoCategoria(true)}
                  className="self-start text-xs font-semibold text-azul-noite underline"
                >
                  + Nova categoria
                </button>
              ) : (
                <div className="mt-1 flex flex-col gap-2 rounded-md border border-cinza-claro bg-off-white p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={codigoCategoria}
                      onChange={(e) => setCodigoCategoria(e.target.value.toUpperCase())}
                      maxLength={3}
                      placeholder="Código (3 letras)"
                      className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm uppercase text-cinza"
                    />
                    <input
                      value={nomeCategoria}
                      onChange={(e) => setNomeCategoria(e.target.value)}
                      placeholder="Nome"
                      className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
                    />
                  </div>
                  {erroCategoria && <p className="text-xs text-vermelho">{erroCategoria}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={criarCategoriaInline}
                      disabled={salvandoCategoria}
                      className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
                    >
                      {salvandoCategoria ? "Salvando..." : "Adicionar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCriandoCategoria(false);
                        setErroCategoria(null);
                      }}
                      className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {categoriasFiltradas.length === 0 && !criandoCategoria && (
                <span className="text-xs text-ambar">Nenhuma categoria cadastrada pra essa camada ainda.</span>
              )}
            </div>

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
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Rendimento</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Quantidade
              <CampoNumero value={rendimentoQuantidade} onChange={(v) => editar(setRendimentoQuantidade, v)} decimais={3} />
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
            <label className="col-span-2 flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
              Tempo de preparo (min)
              <CampoNumero
                value={tempoPreparoMinutos}
                onChange={(v) => editar(setTempoPreparoMinutos, v === null ? null : Math.round(v))}
                decimais={0}
              />
            </label>
            {camada === "VEN" && (
              <>
                <label className="col-span-2 flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
                  Preço de venda - Salão (opcional - pode preencher depois)
                  <CampoNumero value={precoVenda} onChange={(v) => editar(setPrecoVenda, v)} />
                </label>
                <div className="col-span-2 flex flex-col gap-1.5 text-sm font-semibold text-cinza-medio">
                  <span className="flex items-center justify-between">
                    Embalagem de delivery (opcional)
                    <span className="flex gap-1">
                      {(
                        [
                          { valor: "nenhuma", label: "Nenhuma" },
                          { valor: "ficha", label: "Pré-preparo" },
                          { valor: "produto", label: "Produto" },
                        ] as const
                      ).map((opcao) => (
                        <button
                          key={opcao.valor}
                          type="button"
                          onClick={() => mudarModoEmbalagem(opcao.valor)}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            modoEmbalagem === opcao.valor
                              ? "bg-azul-noite text-branco"
                              : "border border-cinza-claro text-cinza-medio"
                          }`}
                        >
                          {opcao.label}
                        </button>
                      ))}
                    </span>
                  </span>
                  {modoEmbalagem === "ficha" && (
                    <SeletorBusca
                      opcoes={fichasEmbalagem
                        .slice()
                        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                        .map((f) => ({ valor: f.id, rotulo: `${f.nome} (${f.sku})` }))}
                      valorSelecionado={embalagemFichaId ?? ""}
                      placeholder="Buscar ficha de pré-preparo..."
                      onSelecionar={(id) => editar(setEmbalagemFichaId, id)}
                    />
                  )}
                  {modoEmbalagem === "produto" && (
                    <SeletorBusca
                      opcoes={produtosEmbalagem
                        .slice()
                        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                        .map((p) => ({ valor: p.sku, rotulo: p.nome }))}
                      valorSelecionado={embalagemProdutoSku ?? ""}
                      placeholder="Buscar produto do grupo Embalagens..."
                      onSelecionar={(sku) => editar(setEmbalagemProdutoSku, sku)}
                    />
                  )}
                  {modoEmbalagem === "produto" && produtosEmbalagem.length === 0 && (
                    <span className="text-xs font-normal text-ambar">
                      Nenhum produto ativo no grupo Embalagens ainda - cadastre um em Produtos antes.
                    </span>
                  )}
                  <span className="text-xs font-normal text-cinza-medio">
                    Custo dela entra em Delivery Próprio, iFood e 99Food - nunca no Salão.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Componentes</div>
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
          <button
            type="button"
            onClick={() => editar(setComponentes, [...componentes, novoComponente(componentes.length)])}
            className="mt-3 w-full rounded-md border border-azul-noite px-2 py-2 text-xs font-semibold text-azul-noite"
          >
            + Adicionar componente
          </button>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Custo estimado</div>
          {custoEstimado.custoTotal === null ? (
            <p className="text-sm text-cinza-medio">Adicione componentes com preço cadastrado pra ver o custo.</p>
          ) : (
            <>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-cinza-medio">Total da receita</span>
                <span className="font-display text-lg font-bold text-azul-noite">{brl(custoEstimado.custoTotal)}</span>
              </div>
              {custoEstimado.custoPorUnidade !== null && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm text-cinza-medio">Custo por {rendimentoUnidade}</span>
                  <span className="font-semibold text-azul-noite">{brl(custoEstimado.custoPorUnidade)}</span>
                </div>
              )}
              {!custoEstimado.completo && (
                <p className="mt-2 text-xs text-ambar">
                  Custo parcial - algum componente ainda não tem preço cadastrado no Estoque.
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Modo de preparo</div>
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
          <button
            type="button"
            onClick={() => editar(setEtapas, [...etapas, novaEtapa(etapas.length)])}
            className="mt-3 w-full rounded-md border border-azul-noite px-2 py-2 text-xs font-semibold text-azul-noite"
          >
            + Adicionar etapa
          </button>
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
            Gerenciais (fornecedor alternativo, observação de custo etc.)
            <textarea
              value={obsGerenciais}
              onChange={(e) => editar(setObsGerenciais, e.target.value)}
              rows={3}
              className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
            />
          </label>
        </div>

        {erro && <p className="text-sm text-vermelho">{erro}</p>}

        <div className="flex gap-2">
          {onCancelar && (
            <button
              type="button"
              onClick={cancelar}
              disabled={isPending}
              className="rounded-lg border border-cinza-claro px-4 py-3.5 text-sm font-semibold text-cinza-medio disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-ambar px-4 py-3.5 text-sm font-bold text-azul-noite disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Salvar ficha técnica"}
          </button>
        </div>
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
  const produtosOrdenados = [...produtos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const fichasOrdenadas = [...fichasDisponiveis].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

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
              unidadeUso: "",
            })
          }
          className="rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-cinza"
        >
          <option value="produto">Produto do Estoque</option>
          <option value="ficha">Receita (outra ficha - pré-preparo ou venda)</option>
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
        <div className="mt-2">
          <SeletorBusca
            opcoes={produtosOrdenados.map((p) => ({ valor: p.sku, rotulo: `${p.nome} (${p.unidadeUso})` }))}
            valorSelecionado={componente.produtoSku ?? ""}
            placeholder="Buscar produto..."
            onSelecionar={(sku) => {
              const produto = produtos.find((p) => p.sku === sku);
              onChange({ ...componente, produtoSku: sku, unidadeUso: produto?.unidadeUso ?? "" });
            }}
          />
        </div>
      ) : (
        <div className="mt-2">
          <SeletorBusca
            opcoes={fichasOrdenadas.map((f) => ({ valor: f.id, rotulo: `${f.nome} (${f.sku})` }))}
            valorSelecionado={componente.fichaComponenteId ?? ""}
            placeholder="Buscar ficha..."
            onSelecionar={(id) => {
              const ficha = fichasDisponiveis.find((f) => f.id === id);
              onChange({ ...componente, fichaComponenteId: id, unidadeUso: ficha?.rendimentoUnidade ?? "" });
            }}
          />
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-cinza-medio">
          Quantidade
          <CampoNumero value={componente.quantidade} onChange={(v) => onChange({ ...componente, quantidade: v ?? 0 })} decimais={3} />
        </label>
        <div className="flex flex-col gap-1 text-xs text-cinza-medio">
          Unidade
          <div className="flex h-[34px] items-center rounded-md border border-cinza-claro bg-off-white px-3 text-sm text-cinza">
            {componente.unidadeUso || "-"}
          </div>
        </div>
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

/** Campo de busca com lista embaixo (celular não tem espaço pra rolar um
 * select nativo com centenas de produtos, e ele não tem busca por texto) -
 * digita, filtra pelo nome, toca pra selecionar. Lista já vem ordenada
 * alfabeticamente por quem chama. */
function SeletorBusca({
  opcoes,
  valorSelecionado,
  onSelecionar,
  placeholder,
}: {
  opcoes: { valor: string; rotulo: string }[];
  valorSelecionado: string;
  onSelecionar: (valor: string) => void;
  placeholder: string;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const selecionado = opcoes.find((o) => o.valor === valorSelecionado);
  const termo = busca.trim().toLowerCase();
  const filtradas = (termo ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(termo)) : opcoes).slice(0, 30);

  return (
    <div className="relative">
      <input
        type="text"
        required={!valorSelecionado}
        value={aberto ? busca : (selecionado?.rotulo ?? "")}
        onFocus={() => {
          setAberto(true);
          setBusca("");
        }}
        onChange={(e) => setBusca(e.target.value)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
      />
      {aberto && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-cinza-claro bg-branco shadow-lg">
          {filtradas.length === 0 && <div className="p-2 text-sm text-cinza-medio">Nada encontrado</div>}
          {filtradas.map((o) => (
            <button
              key={o.valor}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelecionar(o.valor);
                setAberto(false);
                setBusca("");
              }}
              className="block w-full px-3 py-2 text-left text-sm text-cinza hover:bg-off-white"
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
