"use client";

import { useMemo, useState } from "react";
import { CampoBusca } from "@/components/campo-busca";
import { filtrarPorNomeOuSku } from "@/lib/busca-lista";
import { useRouter, usePathname } from "next/navigation";
import type { Fornecedor, Produto, SugestaoCompra } from "@/lib/types";
import { nomeGrupo } from "@/lib/grupos";
import { agruparPorFornecedor, agruparPorGrupo, ordenarFornecedores, ordenarGrupos, SEM_FORNECEDOR } from "@/lib/pedido";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaVirarCelular } from "@/components/dica-virar-celular";
import { BlocoFornecedorCotacao } from "@/components/bloco-fornecedor-cotacao";
import { DicaCalculo } from "@/components/dica-calculo";
import { AvisoVariasContagens, DICA_VARIAS_CONTAGENS, SeletorContagens } from "@/components/seletor-contagens";
import type { AndamentoSetor } from "@/lib/contagem/setor";
import { hrefCriarCotacao } from "@/lib/contagem/varias-datas";
import { formatarQuantidade, textoEdicaoQuantidade } from "@/lib/unidades";
import { confirmarItemAction } from "@/app/(app)/estoque/pedidos/cotacoes/actions";
import { useSincronizarCotacao } from "@/components/use-sincronizar-cotacao";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { NovoProdutoForm } from "@/components/novo-produto-form";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import {
  ALERTA_FORA_DA_CONTAGEM,
  avisoProdutoCotacao,
  incluirPorSku,
  mesclarItensNovos,
  produtoParaSugestaoCompra,
  type ConfigCadastroRapido,
} from "@/lib/cadastro-rapido";

function formatMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "11/10/2026 e 12/10/2026" - pra textos que falam das contagens juntas. */
function listarDatas(datas: string[]): string {
  return datas.join(" e ");
}

export function PedidoCompras({
  itens,
  dataUsada,
  datasUsadas,
  datasDisponiveis,
  andamentoPorData,
  gruposContadosNoDia,
  organizacaoNome,
  pedidoMinimoPorFornecedor,
  podeEditar,
  fornecedoresCadastro,
  quantidadesSalvas,
  setoresPendentes = [],
  cadastroRapidoProduto = null,
}: {
  itens: SugestaoCompra[];
  /** Contagem base: a mais recente das marcadas, onde o pedido fica gravado. */
  dataUsada: string;
  /** Todas as contagens marcadas, mais recente primeiro (uma só é o padrão). */
  datasUsadas: string[];
  datasDisponiveis: string[];
  /** Setores de cada data, pra liberar só as contagens que se completam. */
  andamentoPorData: Record<string, AndamentoSetor[]>;
  gruposContadosNoDia: string[];
  organizacaoNome: string;
  pedidoMinimoPorFornecedor: Record<string, number | null>;
  podeEditar: boolean;
  fornecedoresCadastro: Fornecedor[];
  quantidadesSalvas: Record<string, number>;
  /** Setores que ainda não fecharam a contagem dessa data. Com gente aqui, o
   * estoque atual é soma parcial e a tela exige confirmação explícita antes
   * de deixar confirmar quantidade. */
  setoresPendentes?: string[];
  /** Cadastro rápido no lugar onde se usa (Navegação V2, piloto): "+ Novo
   * produto" cadastra em modal e a linha nova já entra na conferência com o
   * campo Comprar aberto. Só Gestão/master (`criarProdutoAction` confere). */
  cadastroRapidoProduto?: ConfigCadastroRapido | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const legenda = `${organizacaoNome} · Pedido de Cotação`;
  const variasContagens = datasUsadas.length > 1;

  // `data` leva todas as contagens marcadas separadas por vírgula; o servidor
  // só aceita datas que existem na unidade e põe a mais recente como base.
  // Não há filtro por grupo (26/10/2026): vale tudo o que foi contado.
  function atualizarUrl(novasDatas: string[]) {
    router.push(hrefCriarCotacao(pathname, novasDatas));
  }

  // Correção manual da quantidade sugerida - compartilhada entre a tabela de
  // conferência por Grupo e os blocos por Fornecedor: o mesmo SKU pode
  // aparecer nas duas. Começa pré-carregada com o que já foi confirmado pra
  // essa contagem base (sem isso, toda vez que a página recarrega ela volta
  // a mostrar a sugestão crua calculada em cima do estoque).
  const [overrides, setOverrides] = useState<Record<string, number>>(() => ({ ...quantidadesSalvas }));
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<Record<string, boolean>>({});
  const [erroConfirmar, setErroConfirmar] = useState<Record<string, string>>({});
  const { agendar: agendarSincronizacao } = useSincronizarCotacao();

  // Produto cadastrado pelo atalho: entra na lista local sem recarregar, então
  // quantidade já digitada e edição aberta em outras linhas continuam onde estavam.
  const [itensNovos, setItensNovos] = useState<SugestaoCompra[]>([]);
  const [novoProdutoAberto, setNovoProdutoAberto] = useState(false);
  const [avisoNovoProduto, setAvisoNovoProduto] = useState<string | null>(null);
  // Trocar de contagem (router.push não remonta este componente) zera as
  // linhas cadastradas aqui: a partir daí vale o que o servidor devolve.
  const chaveTela = datasUsadas.join(",");
  const [chaveItensNovos, setChaveItensNovos] = useState(chaveTela);
  if (chaveItensNovos !== chaveTela) {
    setChaveItensNovos(chaveTela);
    setItensNovos([]);
    setAvisoNovoProduto(null);
  }
  const itensTela = useMemo(() => mesclarItensNovos(itens, itensNovos), [itens, itensNovos]);
  const skusNovos = useMemo(() => new Set(itensNovos.map((i) => i.sku)), [itensNovos]);
  const temForaDaContagem = itensTela.some((i) => skusNovos.has(i.sku) || i.alerta === ALERTA_FORA_DA_CONTAGEM);

  function valorAtual(item: SugestaoCompra): number {
    return overrides[item.sku] ?? item.quantidadeSugerida;
  }

  // Confirmar já grava na hora - não existe mais botão Salvar/Salvar tudo.
  // Um item pode ser vendido por mais de um fornecedor (Fornecedor 1-4 do
  // Cadastro); a quantidade confirmada vale igual pra todos eles, então
  // grava em cada um. Item sem fornecedor cadastrado nenhum entra no bloco
  // avulso "Sem fornecedor cadastrado" (mesmo comportamento de sempre).
  async function confirmarValor(item: SugestaoCompra, valorBase: number) {
    setOverrides((o) => ({ ...o, [item.sku]: valorBase }));
    if (!podeConfirmar) return;

    setConfirmando((c) => ({ ...c, [item.sku]: true }));
    setErroConfirmar((e) => ({ ...e, [item.sku]: "" }));

    const fornecedoresDoItem = item.fornecedores.length ? item.fornecedores : valorBase > 0 ? [SEM_FORNECEDOR] : [];
    const resultados = await Promise.all(
      fornecedoresDoItem.map((fornecedor) =>
        confirmarItemAction({
          fornecedor,
          dataContagemBase: dataUsada,
          item: {
            sku: item.sku,
            nome: item.nome,
            nomeCompra: item.nomeCompra,
            unidadeBase: item.unidadeBase,
            quantidadePedida: valorBase,
            precoAntigo: item.precoNaContagem,
            precoAtualizado: item.precoUnitario,
            precoConfirmado: false,
          },
          atualizarPreco: false,
        })
      )
    );
    setConfirmando((c) => ({ ...c, [item.sku]: false }));
    const comErro = resultados.find((r) => "erro" in r);
    setErroConfirmar((e) => ({ ...e, [item.sku]: comErro && "erro" in comErro ? comErro.erro : "" }));
    if (resultados.some((r) => !("erro" in r))) agendarSincronizacao();
  }

  function iniciarEdicao(item: SugestaoCompra) {
    setEditando((e) => ({ ...e, [item.sku]: textoEdicaoQuantidade(valorAtual(item), item.unidadeBase) }));
  }

  function confirmarEdicaoGrupo(item: SugestaoCompra) {
    const raw = (editando[item.sku] ?? "").trim().replace(",", ".");
    const num = Number(raw);
    if (raw !== "" && !Number.isNaN(num) && num >= 0) {
      confirmarValor(item, num);
    }
    setEditando((e) => {
      const novo = { ...e };
      delete novo[item.sku];
      return novo;
    });
  }

  // Atribuir um Fornecedor 1 pra item "Sem fornecedor cadastrado" (feito
  // dentro do próprio bloco por fornecedor) precisa recalcular os grupos na
  // hora, sem esperar reload - sobrepõe o fornecedor escolhido em cima do
  // item antes de agrupar, então ele já cai no bloco certo.
  const [fornecedorOverrides, setFornecedorOverrides] = useState<Record<string, string>>({});

  const itensEfetivos = useMemo(
    () =>
      itensTela.map((item) => {
        const fornecedorOverride = fornecedorOverrides[item.sku];
        const quantidadeOverride = overrides[item.sku];
        return {
          ...item,
          ...(fornecedorOverride ? { fornecedores: [fornecedorOverride] } : {}),
          ...(quantidadeOverride !== undefined ? { precisaComprar: quantidadeOverride > 0 } : {}),
        };
      }),
    [itensTela, fornecedorOverrides, overrides]
  );

  const porGrupo = useMemo(() => agruparPorGrupo(itensEfetivos), [itensEfetivos]);
  const grupos = ordenarGrupos(Object.keys(porGrupo));
  // Busca na Conferência por Grupo (26/10/2026): só esconde linhas. O que está
  // em edição fica em `editando`, pelo SKU; subtotais, total e os blocos por
  // fornecedor (compartilhar) continuam com tudo.
  const [busca, setBusca] = useState("");
  const buscando = busca.trim() !== "";
  const gruposVisiveis = grupos
    .map((grupo) => ({ grupo, linhas: filtrarPorNomeOuSku(porGrupo[grupo], busca) }))
    .filter((g) => !buscando || g.linhas.length > 0);

  const nomesFornecedoresCadastro = useMemo(
    () => fornecedoresCadastro.map((f) => f.nomeFantasia || f.razaoSocial).filter(Boolean),
    [fornecedoresCadastro]
  );
  const porFornecedor = useMemo(
    () => agruparPorFornecedor(itensEfetivos, nomesFornecedoresCadastro),
    [itensEfetivos, nomesFornecedoresCadastro]
  );
  const fornecedores = ordenarFornecedores(Object.keys(porFornecedor));

  const [parcialLiberada, setParcialLiberada] = useState(false);
  const contagemParcial = setoresPendentes.length > 0;
  const podeConfirmar = podeEditar && (!contagemParcial || parcialLiberada);

  function produtoCadastrado(produto: Produto) {
    setNovoProdutoAberto(false);
    const item = produtoParaSugestaoCompra(produto);
    setItensNovos((atual) => incluirPorSku(atual, item));
    if (podeConfirmar) setEditando((e) => ({ ...e, [item.sku]: "" }));
    setAvisoNovoProduto(
      avisoProdutoCotacao({
        nome: produto.nome,
        grupoNome: nomeGrupo(produto.grupo),
        podeDigitar: podeConfirmar,
        avisarSetor: cadastroRapidoProduto?.avisarSetor ?? false,
      }),
    );
  }

  const totalGeral = itensTela.reduce((soma, item) => {
    if (item.precoUnitario === null) return soma;
    return soma + valorAtual(item) * item.precoUnitario;
  }, 0);

  return (
    // `data-tabela-larga`: com o celular deitado o shell solta cabeçalho e barra inferior.
    <div className="flex flex-col gap-5 pb-10" data-tabela-larga>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-bold text-azul-noite">Criar Cotação</h1>
          <p className="text-sm text-cinza-medio">
            Tudo o que foi contado {variasContagens ? "nas contagens escolhidas" : "na contagem escolhida"}, pra
            conferir se o pedido foi montado certo - inclusive o que não precisa comprar. Confirmar já
            grava na hora. Depois, compartilha a cotação de cada fornecedor lá embaixo.
          </p>
          {/* Vídeo da cotação (26/10/2026), mesmo link discreto da Contagem. */}
          <div className="-ml-2">
            <LinkVideoAjuda id="cotacao" pergunta="Como fazer a cotação?" />
          </div>
        </div>
        {cadastroRapidoProduto && (
          <button
            type="button"
            onClick={() => setNovoProdutoAberto(true)}
            className="shrink-0 rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo"
          >
            + Novo produto
          </button>
        )}
      </div>

      {avisoNovoProduto && (
        <p role="status" className="rounded-md border border-ambar bg-ambar/10 px-3 py-2 text-sm text-cinza">
          {avisoNovoProduto}
        </p>
      )}

      {contagemParcial && (
        <div className="rounded-lg border-2 border-ambar bg-ambar/10 p-4">
          <p className="font-display text-lg font-bold text-azul-noite">
            Contagem parcial. Faltam: {setoresPendentes.join(" e ")}.
          </p>
          <p className="mt-1 text-sm text-cinza">
            O estoque atual abaixo é a soma só dos setores que já fecharam. Comprar em cima disso
            pode render pedido a mais, porque o que está no setor que faltou não aparece aqui.
          </p>
          {!parcialLiberada ? (
            <button
              type="button"
              onClick={() => setParcialLiberada(true)}
              className="mt-3 rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco"
            >
              Entendi, seguir com a contagem parcial
            </button>
          ) : (
            <p className="mt-2 text-sm font-semibold text-ambar">
              Você liberou a cotação parcial nesta tela.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-cinza-claro bg-branco p-3.5">
        <SeletorContagens
          datasDisponiveis={datasDisponiveis}
          datasUsadas={datasUsadas}
          andamentoPorData={andamentoPorData}
          onChange={atualizarUrl}
        />

        <div className="ml-auto text-sm text-cinza-medio">
          Total do pedido{" "}
          <span className="font-bold text-azul-noite">{formatMoeda(totalGeral)}</span>
        </div>
      </div>

      <AvisoVariasContagens datasUsadas={datasUsadas} />

      {gruposContadosNoDia.length > 0 && (
        <p className="rounded-md border border-cinza-claro bg-off-white px-3 py-2 text-xs text-cinza-medio">
          {variasContagens ? `Nessas contagens (${listarDatas(datasUsadas)})` : `Nessa contagem (${dataUsada})`}{" "}
          foram contados os grupos:{" "}
          <strong className="text-cinza">{gruposContadosNoDia.map(nomeGrupo).join(", ")}</strong>. O resto
          do cadastro nem entra aqui, porque não fez parte {variasContagens ? "dessas contagens" : "dessa contagem"}
          {temForaDaContagem
            ? `, exceto produto cadastrado aqui ou com compra já confirmada, que aparece com a etiqueta "${ALERTA_FORA_DA_CONTAGEM}" ou "novo".`
            : "."}
        </p>
      )}

      {itensTela.length === 0 && (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nenhum produto ativo {variasContagens ? "nessas contagens" : "nessa contagem"}.
        </div>
      )}

      {itensTela.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-xl font-bold text-azul-noite">Conferência por Grupo</h2>
          <p className="mb-3 rounded-md border border-ambar/60 bg-ambar/10 px-3 py-2 text-xs font-medium text-ambar">
            Antes de enviar as cotações para os fornecedores, lembre-se de fazer a conferência - e
            edite na coluna Comprar se for necessário.
          </p>
          <div className="mb-3 flex flex-col gap-1">
            <CampoBusca valor={busca} onChange={setBusca} rotulo="Buscar item da conferência por nome ou SKU" />
            <DicaVirarCelular />
            {buscando && (
              <p className="text-xs text-cinza-medio">
                {gruposVisiveis.length === 0
                  ? `Nenhum item com "${busca.trim()}" nesta cotação.`
                  : "Mostrando só os itens encontrados. Subtotais, total e os blocos por fornecedor continuam com todos os itens."}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {gruposVisiveis.map(({ grupo, linhas }) => (
              <TabelaItens
                key={grupo}
                titulo={nomeGrupo(grupo)}
                linhas={linhas}
                todasLinhas={porGrupo[grupo]}
                valorAtual={valorAtual}
                editando={editando}
                confirmando={confirmando}
                erroConfirmar={erroConfirmar}
                podeEditar={podeConfirmar}
                mostrarDatas={variasContagens}
                skusNovos={skusNovos}
                onIniciarEdicao={iniciarEdicao}
                onConfirmarEdicao={confirmarEdicaoGrupo}
                onChangeEditando={(sku, v) => setEditando((ed) => ({ ...ed, [sku]: v }))}
              />
            ))}
          </div>
        </div>
      )}

      {itensTela.length > 0 && (
        <div>
          <h2 className="mb-2 font-display text-xl font-bold text-azul-noite">
            Por Fornecedor - cotação e compartilhamento
          </h2>
          <div className="flex flex-col gap-4">
            {fornecedores.map((fornecedor) => (
              <BlocoFornecedorCotacao
                key={fornecedor}
                fornecedor={fornecedor}
                linhas={porFornecedor[fornecedor]}
                pedidoMinimo={pedidoMinimoPorFornecedor[fornecedor] ?? null}
                legenda={legenda}
                valorAtual={valorAtual}
                onConfirmarValor={confirmarValor}
                confirmando={confirmando}
                erroConfirmar={erroConfirmar}
                podeEditar={podeConfirmar}
                fornecedoresCadastro={fornecedoresCadastro}
                onFornecedorAtribuido={(sku, nome) =>
                  setFornecedorOverrides((f) => ({ ...f, [sku]: nome }))
                }
              />
            ))}
          </div>
        </div>
      )}

      <ModalFlutuante aberto={novoProdutoAberto} onFechar={() => setNovoProdutoAberto(false)}>
        {novoProdutoAberto && (
          <NovoProdutoForm onSalvo={produtoCadastrado} onCancelar={() => setNovoProdutoAberto(false)} />
        )}
      </ModalFlutuante>
    </div>
  );
}

function TabelaItens({
  titulo,
  linhas,
  todasLinhas = linhas,
  valorAtual,
  editando,
  confirmando,
  erroConfirmar,
  podeEditar,
  mostrarDatas,
  skusNovos,
  onIniciarEdicao,
  onConfirmarEdicao,
  onChangeEditando,
}: {
  titulo: string;
  linhas: SugestaoCompra[];
  /** Grupo inteiro, para o subtotal não mudar quando a busca esconde linhas. */
  todasLinhas?: SugestaoCompra[];
  valorAtual: (item: SugestaoCompra) => number;
  editando: Record<string, string>;
  confirmando: Record<string, boolean>;
  erroConfirmar: Record<string, string>;
  podeEditar: boolean;
  /** Com mais de uma contagem marcada: mostra de qual data veio cada estoque. */
  mostrarDatas: boolean;
  /** Linhas cadastradas agora pelo atalho - ficam marcadas pra achar fácil. */
  skusNovos: Set<string>;
  onIniciarEdicao: (item: SugestaoCompra) => void;
  onConfirmarEdicao: (item: SugestaoCompra) => void;
  onChangeEditando: (sku: string, valor: string) => void;
}) {
  const subtotal = todasLinhas.reduce((soma, item) => {
    if (item.precoUnitario === null) return soma;
    return soma + valorAtual(item) * item.precoUnitario;
  }, 0);

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco">
      <div className="flex items-center justify-between border-b border-cinza-claro bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco">
        <span>{titulo}</span>
        <span className="text-xs font-semibold text-cinza-claro">{formatMoeda(subtotal)}</span>
      </div>
      <TabelaRolavel className="max-h-[50vh]" ariaLabel={titulo}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-off-white text-cinza-medio">
              <Th>Item</Th>
              <Th align="right">
                {mostrarDatas ? (
                  <span className="inline-flex items-center gap-1">
                    Estoque atual
                    <DicaCalculo rotulo="Estoque atual com mais de uma contagem" texto={DICA_VARIAS_CONTAGENS} />
                  </span>
                ) : (
                  "Estoque atual"
                )}
              </Th>
              <Th align="right">Necessário</Th>
              <Th align="right">Comprar</Th>
              <Th align="right">Valor</Th>
              <Th>Alerta</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((item) => {
              const qtd = valorAtual(item);
              const emEdicao = editando[item.sku] !== undefined;
              const valor = item.precoUnitario !== null ? qtd * item.precoUnitario : null;
              const precisa = qtd > 0;
              const novo = skusNovos.has(item.sku);

              return (
                <tr
                  key={item.sku}
                  className={`border-t border-cinza-claro ${novo ? "bg-azul-petroleo/10" : precisa ? "bg-ambar/5" : ""}`}
                >
                  <td className={`px-3 py-2 font-medium ${precisa ? "text-cinza" : "text-cinza-medio"}`}>
                    {item.nome}
                    {novo && (
                      <span className="ml-1.5 rounded-full bg-azul-petroleo/15 px-1.5 py-0.5 text-[10px] font-semibold text-azul-petroleo">
                        novo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {item.estoqueAtual !== null
                      ? `${formatarQuantidade(item.estoqueAtual, item.unidadeBase)} ${item.unidadeBase}`
                      : "não contado"}
                    {mostrarDatas && item.datasContagem && item.datasContagem.length > 0 && (
                      <span className="block text-[10px] font-medium" title={`Contado em ${listarDatas(item.datasContagem)}`}>
                        {item.datasContagem.map((d) => d.slice(0, 5)).join(" + ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {item.estoqueNecessario !== null
                      ? `${formatarQuantidade(item.estoqueNecessario, item.unidadeBase)} ${item.unidadeBase}`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {emEdicao ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={editando[item.sku]}
                          onChange={(e) => onChangeEditando(item.sku, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onConfirmarEdicao(item);
                            }
                          }}
                          className="w-16 rounded border border-ambar px-1.5 py-1 text-right focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => onConfirmarEdicao(item)}
                          className="rounded bg-ambar px-2 py-1 text-[10px] font-bold text-azul-noite hover:bg-[#b07720]"
                        >
                          Confirmar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {confirmando[item.sku] ? (
                            <span className="text-xs text-cinza-medio">salvando...</span>
                          ) : precisa ? (
                            <span className="font-bold tabular-nums text-ambar">
                              {formatarQuantidade(qtd, item.unidadeBase)} {item.unidadeBase}
                            </span>
                          ) : (
                            <span className="text-xs text-cinza-medio">não precisa comprar</span>
                          )}
                          {podeEditar && (
                            <button
                              type="button"
                              onClick={() => onIniciarEdicao(item)}
                              className="rounded-md border border-cinza-claro px-2 py-1 text-[10px] font-semibold text-cinza-medio hover:bg-off-white"
                            >
                              {precisa ? "Editar" : "Adicionar"}
                            </button>
                          )}
                        </div>
                        {erroConfirmar[item.sku] && (
                          <span className="text-[10px] text-vermelho">{erroConfirmar[item.sku]}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-cinza-medio">
                    {valor !== null ? formatMoeda(valor) : "a calcular"}
                  </td>
                  <td className="px-3 py-2">
                    {item.alerta && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          item.alerta.startsWith("Comprar emergencial")
                            ? "bg-vermelho/10 text-vermelho"
                            : "bg-ambar/10 text-ambar"
                        }`}
                      >
                        {item.alerta}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TabelaRolavel>
    </div>
  );
}
