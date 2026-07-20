"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fornecedor, ItemPendente, Produto } from "@/lib/types";
import { salvarProdutoAction, sugerirSkuAction } from "@/app/(app)/estoque/produtos/actions";
import { GRUPO_OPCOES } from "@/lib/grupos";
import { UNIDADES } from "@/lib/unidades";
import { CodigoSelect, type OpcaoCodigo } from "@/components/codigo-select";
import { useArrastarParaRolar } from "@/components/use-arrastar-para-rolar";

const VAZIO_CLASSE = "border-ambar bg-ambar/10";
const NORMAL_CLASSE = "border-cinza-claro bg-branco";

type CampoOrdenacao = "posicao" | "nome" | "grupo";
type Ordenacao = { campo: CampoOrdenacao | null; direcao: "asc" | "desc" };
type StatusLinha = { tipo: "salvando" | "ok" | "erro"; msg?: string } | undefined;

export function EdicaoGrid({
  produtos,
  pendentes,
  fornecedores,
}: {
  produtos: Produto[];
  pendentes: ItemPendente[];
  fornecedores: Fornecedor[];
}) {
  return (
    <div className="flex flex-col gap-8 pb-10">
      {pendentes.length > 0 && (
        <div>
          <h2 className="mb-1 font-display text-xl font-bold text-azul-noite">
            Pendências da Contagem ({pendentes.length})
          </h2>
          <p className="mb-3 text-xs text-cinza-medio">
            Itens adicionados na Contagem sem cadastro. Completa os dados e salva pra virarem
            produto de verdade.
          </p>
          <div className="flex flex-col gap-3">
            {pendentes.map((p) => (
              <LinhaPendencia key={p.nome} pendente={p} />
            ))}
          </div>
        </div>
      )}

      <CadastroSection produtos={produtos} fornecedores={fornecedores} />
    </div>
  );
}

function CadastroSection({
  produtos,
  fornecedores,
}: {
  produtos: Produto[];
  fornecedores: Fornecedor[];
}) {
  const [busca, setBusca] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState<"todos" | "ativo" | "inativo">("todos");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ campo: null, direcao: "asc" });

  const [baseline, setBaseline] = useState<Record<string, Produto>>(() =>
    Object.fromEntries(produtos.map((p) => [p.sku, p]))
  );
  const [estado, setEstado] = useState<Record<string, Produto>>(() =>
    Object.fromEntries(produtos.map((p) => [p.sku, p]))
  );
  const [statusPorSku, setStatusPorSku] = useState<Record<string, StatusLinha>>({});
  const [salvandoTodos, setSalvandoTodos] = useState(false);

  const fornecedorOpcoes: OpcaoCodigo[] = useMemo(
    () => [
      { codigo: "", descricao: "(nenhum)" },
      ...fornecedores.map((f) => ({
        codigo: f.nomeFantasia || f.razaoSocial,
        descricao: f.razaoSocial && f.razaoSocial !== f.nomeFantasia ? f.razaoSocial : "",
      })),
    ],
    [fornecedores]
  );

  const alterados = useMemo(
    () => Object.keys(estado).filter((sku) => JSON.stringify(estado[sku]) !== JSON.stringify(baseline[sku])),
    [estado, baseline]
  );

  const campo = useCallback(<K extends keyof Produto>(sku: string, key: K, value: Produto[K]) => {
    setEstado((e) => ({ ...e, [sku]: { ...e[sku], [key]: value } }));
    setStatusPorSku((s) => ({ ...s, [sku]: undefined }));
  }, []);

  const salvarUm = useCallback(
    async (sku: string) => {
      setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "salvando" } }));
      const r = await salvarProdutoAction(estado[sku]);
      if ("erro" in r) {
        setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "erro", msg: r.erro } }));
        return false;
      }
      setBaseline((b) => ({ ...b, [sku]: estado[sku] }));
      setStatusPorSku((s) => ({ ...s, [sku]: { tipo: "ok" } }));
      return true;
    },
    [estado]
  );

  async function salvarTodos() {
    setSalvandoTodos(true);
    await Promise.all(alterados.map((sku) => salvarUm(sku)));
    setSalvandoTodos(false);
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const atual = estado[p.sku] ?? p;
      if (termo && !atual.nome.toLowerCase().includes(termo) && !atual.sku.toLowerCase().includes(termo)) {
        return false;
      }
      if (filtroGrupo && atual.grupo !== filtroGrupo) return false;
      if (filtroAtivo === "ativo" && !atual.ativo) return false;
      if (filtroAtivo === "inativo" && atual.ativo) return false;
      return true;
    });
  }, [produtos, estado, busca, filtroGrupo, filtroAtivo]);

  const ordenados = useMemo(() => {
    if (!ordenacao.campo) return filtrados;
    const mult = ordenacao.direcao === "asc" ? 1 : -1;
    const copia = [...filtrados];
    copia.sort((a, b) => {
      const ea = estado[a.sku] ?? a;
      const eb = estado[b.sku] ?? b;
      if (ordenacao.campo === "posicao") {
        return ((ea.posicao ?? Infinity) - (eb.posicao ?? Infinity)) * mult;
      }
      if (ordenacao.campo === "nome") {
        return ea.nome.localeCompare(eb.nome, "pt-BR") * mult;
      }
      const g = ea.grupo.localeCompare(eb.grupo, "pt-BR") * mult;
      if (g !== 0) return g;
      return ea.nome.localeCompare(eb.nome, "pt-BR");
    });
    return copia;
  }, [filtrados, estado, ordenacao]);

  function alternarOrdenacao(campoOrd: CampoOrdenacao) {
    setOrdenacao((o) => (o.campo !== campoOrd ? { campo: campoOrd, direcao: "asc" } : { campo: campoOrd, direcao: o.direcao === "asc" ? "desc" : "asc" }));
  }

  const { scrollRef, handlers, arrastando, espacoPressionado } = useArrastarParaRolar<HTMLDivElement>();

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-azul-noite">
          Cadastro completo ({filtrados.length}
          {filtrados.length !== produtos.length ? ` de ${produtos.length}` : ""})
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full max-w-xs rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm focus:border-ambar focus:outline-none"
          />
          <button
            type="button"
            onClick={salvarTodos}
            disabled={alterados.length === 0 || salvandoTodos}
            className="shrink-0 rounded-md bg-azul-noite px-4 py-1.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-40"
          >
            {salvandoTodos ? "Salvando..." : `Salvar todos (${alterados.length})`}
          </button>
        </div>
      </div>
      <p className="mb-3 text-xs text-cinza-medio">
        Células em destaque estão vazias. Segura o fundo da tabela (ou a barra de espaço, fora de
        um campo) pra arrastar e rolar.
      </p>
      <div
        ref={scrollRef}
        {...handlers}
        className={`max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro bg-branco select-none ${
          arrastando ? "cursor-grabbing" : espacoPressionado ? "cursor-grab" : ""
        }`}
      >
        <table className="w-full min-w-[1750px] text-xs">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>SKU</Th>
              <ThOrdenavel campo="posicao" ordenacao={ordenacao} onClick={() => alternarOrdenacao("posicao")}>
                Posição
              </ThOrdenavel>
              <Th>
                <div className="flex flex-col gap-1">
                  <ThOrdenavelInline campo="grupo" ordenacao={ordenacao} onClick={() => alternarOrdenacao("grupo")}>
                    Grupo
                  </ThOrdenavelInline>
                  <select
                    value={filtroGrupo}
                    onChange={(e) => setFiltroGrupo(e.target.value)}
                    className="rounded border border-azul-noite bg-azul-noite px-1 py-0.5 text-[10px] font-normal text-off-white"
                  >
                    <option value="">Todos</option>
                    {GRUPO_OPCOES.map((o) => (
                      <option key={o.codigo} value={o.codigo}>
                        {o.codigo}
                      </option>
                    ))}
                  </select>
                </div>
              </Th>
              <ThOrdenavel campo="nome" ordenacao={ordenacao} onClick={() => alternarOrdenacao("nome")}>
                Nome
              </ThOrdenavel>
              <Th>Unidade Base</Th>
              <Th align="right">Preço</Th>
              <Th align="right">Estoque p/ semana</Th>
              <Th align="right">Estoque mínimo</Th>
              <Th>Nome de Compra</Th>
              <Th>Und. Embalagem</Th>
              <Th align="right">Qtd. Base/Embalagem</Th>
              <Th align="right">Preço Fornecedor</Th>
              <Th>Fornecedor 1</Th>
              <Th>Fornecedor 2</Th>
              <Th>Fornecedor 3</Th>
              <Th>Fornecedor 4</Th>
              <Th>Observações</Th>
              <Th align="center">
                <div className="flex flex-col items-center gap-1">
                  <span>Ativo</span>
                  <select
                    value={filtroAtivo}
                    onChange={(e) => setFiltroAtivo(e.target.value as typeof filtroAtivo)}
                    className="rounded border border-azul-noite bg-azul-noite px-1 py-0.5 text-[10px] font-normal text-off-white"
                  >
                    <option value="todos">Todos</option>
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                  </select>
                </div>
              </Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((p) => (
              <LinhaProduto
                key={p.sku}
                sku={p.sku}
                editado={estado[p.sku]}
                mudou={JSON.stringify(estado[p.sku]) !== JSON.stringify(baseline[p.sku])}
                status={statusPorSku[p.sku]}
                fornecedorOpcoes={fornecedorOpcoes}
                onChange={campo}
                onSalvar={salvarUm}
              />
            ))}
            {ordenados.length === 0 && (
              <tr>
                <td colSpan={19} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum produto encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const alinhamento = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`sticky top-0 z-20 whitespace-nowrap bg-azul-petroleo px-2 py-2 font-semibold ${alinhamento}`}>
      {children}
    </th>
  );
}

function ThOrdenavelInline({
  campo,
  ordenacao,
  onClick,
  children,
}: {
  campo: CampoOrdenacao;
  ordenacao: Ordenacao;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ativo = ordenacao.campo === campo;
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 hover:text-ambar">
      <span>{children}</span>
      <span className="text-[9px]">{ativo ? (ordenacao.direcao === "asc" ? "▲" : "▼") : "⇅"}</span>
    </button>
  );
}

function ThOrdenavel({
  campo,
  ordenacao,
  onClick,
  children,
}: {
  campo: CampoOrdenacao;
  ordenacao: Ordenacao;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <th className="sticky top-0 z-20 whitespace-nowrap bg-azul-petroleo px-2 py-2 text-left font-semibold">
      <ThOrdenavelInline campo={campo} ordenacao={ordenacao} onClick={onClick}>
        {children}
      </ThOrdenavelInline>
    </th>
  );
}

function LinhaPendencia({ pendente }: { pendente: ItemPendente }) {
  const [grupo, setGrupo] = useState("");
  const [sku, setSku] = useState("");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [preco, setPreco] = useState("");
  const [estNecessario, setEstNecessario] = useState("");
  const [estMinimo, setEstMinimo] = useState("");
  const [posicao, setPosicao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pending, setPending] = useState(false);

  function sugerir() {
    setErro(null);
    setPending(true);
    sugerirSkuAction(pendente.nome).then((r) => {
      setPending(false);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSku(r.sku);
      setGrupo(r.grupo);
      setMotivo(r.motivo);
    });
  }

  function salvar() {
    if (!grupo || !sku.trim()) {
      setErro("Escolhe o grupo e o SKU antes de salvar.");
      return;
    }
    setErro(null);
    setPending(true);
    salvarProdutoAction({
      sku: sku.toUpperCase().trim(),
      posicao: posicao ? Number(posicao) : null,
      grupo,
      nome: pendente.nome,
      unidadeBase: pendente.unidadeBase,
      precoUnitario: preco ? Number(preco.replace(",", ".")) : null,
      estoqueNecessarioSemana: estNecessario ? Number(estNecessario.replace(",", ".")) : null,
      estoqueMinimo: estMinimo ? Number(estMinimo.replace(",", ".")) : null,
      nomeCompra: pendente.nome,
      unidadeEmbalagemFornecedor: "",
      qtdUnidadeBasePorEmbalagem: null,
      precoFornecedor: null,
      fornecedor1: "",
      fornecedor2: "",
      fornecedor3: "",
      fornecedor4: "",
      observacoes: "",
      ativo: true,
    }).then((r) => {
      setPending(false);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSalvo(true);
    });
  }

  if (salvo) {
    return (
      <div className="rounded-lg border border-verde/40 bg-verde/5 px-4 py-3 text-sm text-verde">
        {pendente.nome} cadastrado como {sku}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ambar/60 bg-ambar/5 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-cinza">{pendente.nome}</div>
          <div className="text-xs text-cinza-medio">
            {pendente.unidadeBase} · última contagem {pendente.ultimaContagem}
          </div>
        </div>
        <button
          type="button"
          onClick={sugerir}
          disabled={pending}
          className="rounded-md border border-ambar px-3 py-1.5 text-xs font-semibold text-ambar hover:bg-ambar/10 disabled:opacity-40"
        >
          {pending ? "Pensando..." : "Sugerir grupo + SKU"}
        </button>
      </div>
      {motivo && <p className="mt-2 text-xs text-cinza-medio">{motivo}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Grupo</label>
          <CodigoSelect value={grupo} opcoes={GRUPO_OPCOES} onChange={setGrupo} className="mt-0.5" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">SKU</label>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 font-mono text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Preço</label>
          <input
            type="text"
            inputMode="decimal"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Estoque p/ semana</label>
          <input
            type="text"
            inputMode="decimal"
            value={estNecessario}
            onChange={(e) => setEstNecessario(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Estoque mínimo</label>
          <input
            type="text"
            inputMode="decimal"
            value={estMinimo}
            onChange={(e) => setEstMinimo(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-cinza-medio">Posição</label>
          <input
            type="text"
            inputMode="numeric"
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            className="mt-0.5 w-full rounded border border-cinza-claro px-1.5 py-1.5 text-sm"
          />
        </div>
      </div>
      {erro && <p className="mt-2 text-xs text-vermelho">{erro}</p>}
      <button
        type="button"
        onClick={salvar}
        disabled={pending}
        className="mt-3 rounded-md bg-azul-noite px-4 py-2 text-xs font-bold text-branco hover:bg-azul-petroleo disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar como produto"}
      </button>
    </div>
  );
}

const LinhaProduto = memo(function LinhaProduto({
  sku,
  editado,
  mudou,
  status,
  fornecedorOpcoes,
  onChange,
  onSalvar,
}: {
  sku: string;
  editado: Produto;
  mudou: boolean;
  status: StatusLinha;
  fornecedorOpcoes: OpcaoCodigo[];
  onChange: <K extends keyof Produto>(sku: string, key: K, value: Produto[K]) => void;
  onSalvar: (sku: string) => void;
}) {
  const pending = status?.tipo === "salvando";

  function campo<K extends keyof Produto>(key: K, value: Produto[K]) {
    onChange(sku, key, value);
  }

  return (
    <tr className="border-t border-cinza-claro">
      <td className="px-2 py-1.5 font-mono text-cinza-medio">{sku}</td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="1"
          value={editado.posicao ?? ""}
          onChange={(e) => campo("posicao", e.target.value === "" ? null : Number(e.target.value))}
          className={`w-16 rounded border px-1.5 py-1 text-right ${editado.posicao === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect value={editado.grupo} opcoes={GRUPO_OPCOES} onChange={(v) => campo("grupo", v)} className="w-20" />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.nome}
          onChange={(e) => campo("nome", e.target.value)}
          className="w-40 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect value={editado.unidadeBase} opcoes={UNIDADES} onChange={(v) => campo("unidadeBase", v)} className="w-16" />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.precoUnitario ?? ""}
          onChange={(e) =>
            campo("precoUnitario", e.target.value === "" ? null : Number(e.target.value))
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.precoUnitario === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.estoqueNecessarioSemana ?? ""}
          onChange={(e) =>
            campo(
              "estoqueNecessarioSemana",
              e.target.value === "" ? null : Number(e.target.value)
            )
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.estoqueNecessarioSemana === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.estoqueMinimo ?? ""}
          onChange={(e) =>
            campo("estoqueMinimo", e.target.value === "" ? null : Number(e.target.value))
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.estoqueMinimo === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.nomeCompra}
          onChange={(e) => campo("nomeCompra", e.target.value)}
          className="w-40 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect
          value={editado.unidadeEmbalagemFornecedor}
          opcoes={UNIDADES}
          onChange={(v) => campo("unidadeEmbalagemFornecedor", v)}
          className="w-16"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.qtdUnidadeBasePorEmbalagem ?? ""}
          onChange={(e) =>
            campo(
              "qtdUnidadeBasePorEmbalagem",
              e.target.value === "" ? null : Number(e.target.value)
            )
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.qtdUnidadeBasePorEmbalagem === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          step="0.01"
          value={editado.precoFornecedor ?? ""}
          onChange={(e) =>
            campo("precoFornecedor", e.target.value === "" ? null : Number(e.target.value))
          }
          className={`w-20 rounded border px-1.5 py-1 text-right ${editado.precoFornecedor === null ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect value={editado.fornecedor1} opcoes={fornecedorOpcoes} onChange={(v) => campo("fornecedor1", v)} className="w-28" />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect value={editado.fornecedor2} opcoes={fornecedorOpcoes} onChange={(v) => campo("fornecedor2", v)} className="w-28" />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect value={editado.fornecedor3} opcoes={fornecedorOpcoes} onChange={(v) => campo("fornecedor3", v)} className="w-28" />
      </td>
      <td className="px-2 py-1.5">
        <CodigoSelect value={editado.fornecedor4} opcoes={fornecedorOpcoes} onChange={(v) => campo("fornecedor4", v)} className="w-28" />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.observacoes}
          onChange={(e) => campo("observacoes", e.target.value)}
          className="w-48 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={editado.ativo}
          onChange={(e) => campo("ativo", e.target.checked)}
        />
      </td>
      <td className="min-w-[80px] px-2 py-1.5 text-center">
        {mudou && !pending && (
          <button
            type="button"
            onClick={() => onSalvar(sku)}
            className="rounded bg-azul-noite px-2 py-1 text-[10px] font-bold text-branco hover:bg-azul-petroleo"
          >
            Salvar
          </button>
        )}
        {pending && <span className="text-[10px] text-cinza-medio">Salvando...</span>}
        {status?.tipo === "ok" && !mudou && <span className="text-[10px] font-semibold text-verde">Salvo ✓</span>}
        {status?.tipo === "erro" && <span className="block text-[10px] text-vermelho">{status.msg}</span>}
      </td>
    </tr>
  );
});
