"use client";

import { useCallback, useMemo, useState } from "react";
import type { Fornecedor } from "@/lib/types";
import { fornecedorIncompleto } from "@/lib/fornecedor";
import { salvarFornecedorAction } from "@/app/(app)/estoque/fornecedores/actions";
import { StatCard } from "@/components/stat-card";
import { CampoNumero } from "@/components/campo-numero";
import { Th } from "@/components/tabela";
import { GRUPO_OPCOES } from "@/lib/grupos";

const VAZIO_CLASSE = "border-ambar bg-ambar/10";
const NORMAL_CLASSE = "border-cinza-claro bg-branco";

type StatusLinha = { tipo: "salvando" | "ok" | "erro"; msg?: string } | undefined;

export function EdicaoFornecedoresGrid({ fornecedores }: { fornecedores: Fornecedor[] }) {
  const [busca, setBusca] = useState("");
  const [somenteIncompletos, setSomenteIncompletos] = useState(false);
  const [filtroGrupos, setFiltroGrupos] = useState<string[]>([]);

  function alternarFiltroGrupo(codigo: string) {
    setFiltroGrupos((g) => (g.includes(codigo) ? g.filter((c) => c !== codigo) : [...g, codigo]));
  }

  const [baseline, setBaseline] = useState<Record<string, Fornecedor>>(() =>
    Object.fromEntries(fornecedores.map((f) => [f.codigo, f]))
  );
  const [estado, setEstado] = useState<Record<string, Fornecedor>>(() =>
    Object.fromEntries(fornecedores.map((f) => [f.codigo, f]))
  );
  const [statusPorCodigo, setStatusPorCodigo] = useState<Record<string, StatusLinha>>({});
  const [salvandoTodos, setSalvandoTodos] = useState(false);

  const alterados = useMemo(
    () => Object.keys(estado).filter((cod) => JSON.stringify(estado[cod]) !== JSON.stringify(baseline[cod])),
    [estado, baseline]
  );

  const incompletos = useMemo(
    () => fornecedores.filter((f) => fornecedorIncompleto(estado[f.codigo] ?? f)),
    [fornecedores, estado]
  );

  const campo = useCallback(<K extends keyof Fornecedor>(codigo: string, key: K, value: Fornecedor[K]) => {
    setEstado((e) => ({ ...e, [codigo]: { ...e[codigo], [key]: value } }));
    setStatusPorCodigo((s) => ({ ...s, [codigo]: undefined }));
  }, []);

  const salvarUm = useCallback(
    async (codigo: string) => {
      setStatusPorCodigo((s) => ({ ...s, [codigo]: { tipo: "salvando" } }));
      const r = await salvarFornecedorAction(estado[codigo]);
      if ("erro" in r) {
        setStatusPorCodigo((s) => ({ ...s, [codigo]: { tipo: "erro", msg: r.erro } }));
        return false;
      }
      setBaseline((b) => ({ ...b, [codigo]: estado[codigo] }));
      setStatusPorCodigo((s) => ({ ...s, [codigo]: { tipo: "ok" } }));
      return true;
    },
    [estado]
  );

  async function salvarTodos() {
    setSalvandoTodos(true);
    await Promise.all(alterados.map((codigo) => salvarUm(codigo)));
    setSalvandoTodos(false);
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return fornecedores.filter((f) => {
      const atual = estado[f.codigo] ?? f;
      if (
        termo &&
        !atual.nomeFantasia.toLowerCase().includes(termo) &&
        !atual.nomeVendedor.toLowerCase().includes(termo)
      ) {
        return false;
      }
      if (somenteIncompletos && !fornecedorIncompleto(atual)) return false;
      if (filtroGrupos.length > 0 && !filtroGrupos.some((g) => atual.grupos.includes(g))) return false;
      return true;
    });
  }, [fornecedores, estado, busca, somenteIncompletos, filtroGrupos]);

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Fornecedores cadastrados" value={String(fornecedores.length)} />
        <button
          type="button"
          onClick={() => setSomenteIncompletos((v) => !v)}
          className={`text-left ${somenteIncompletos ? "rounded-lg ring-2 ring-ambar" : ""}`}
        >
          <StatCard
            label={
              somenteIncompletos
                ? "Cadastro incompleto (filtrando - clique p/ ver todos)"
                : "Cadastro incompleto (clique p/ filtrar)"
            }
            value={String(incompletos.length)}
            tone={incompletos.length > 0 ? "alerta" : "neutral"}
          />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold text-azul-noite">
          Cadastro completo ({filtrados.length}
          {filtrados.length !== fornecedores.length ? ` de ${fornecedores.length}` : ""})
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nome fantasia ou vendedor..."
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
      <p className="mb-2 text-xs text-cinza-medio">
        Células em destaque estão vazias e são obrigatórias (Nome Fantasia, Vendedor, WhatsApp).
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFiltroGrupos([])}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            filtroGrupos.length === 0
              ? "border-azul-noite bg-azul-noite text-branco"
              : "border-cinza-claro text-cinza-medio hover:border-azul-noite"
          }`}
        >
          Todos
        </button>
        {GRUPO_OPCOES.map((g) => (
          <button
            key={g.codigo}
            type="button"
            onClick={() => alternarFiltroGrupo(g.codigo)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              filtroGrupos.includes(g.codigo)
                ? "border-ambar bg-ambar/10 text-ambar"
                : "border-cinza-claro text-cinza-medio hover:border-ambar"
            }`}
          >
            {g.descricao}
          </button>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro bg-branco">
        <table className="w-full min-w-[1600px] text-xs">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Código</Th>
              <Th>Razão Social</Th>
              <Th>Nome Fantasia</Th>
              <Th>Grupos</Th>
              <Th>Vendedor</Th>
              <Th>WhatsApp</Th>
              <Th>Condições Pagamento</Th>
              <Th>Prazo Boleto</Th>
              <Th align="right">Limite Crédito</Th>
              <Th align="right">Pedido Mínimo</Th>
              <Th>Dias de Entrega</Th>
              <Th>Observações</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((f) => (
              <LinhaFornecedor
                key={f.codigo}
                codigo={f.codigo}
                editado={estado[f.codigo]}
                mudou={JSON.stringify(estado[f.codigo]) !== JSON.stringify(baseline[f.codigo])}
                status={statusPorCodigo[f.codigo]}
                onChange={campo}
                onSalvar={salvarUm}
              />
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-cinza-medio">
                  Nenhum fornecedor encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LinhaFornecedor = ({
  codigo,
  editado,
  mudou,
  status,
  onChange,
  onSalvar,
}: {
  codigo: string;
  editado: Fornecedor;
  mudou: boolean;
  status: StatusLinha;
  onChange: <K extends keyof Fornecedor>(codigo: string, key: K, value: Fornecedor[K]) => void;
  onSalvar: (codigo: string) => void;
}) => {
  const pending = status?.tipo === "salvando";

  function campo<K extends keyof Fornecedor>(key: K, value: Fornecedor[K]) {
    onChange(codigo, key, value);
  }

  return (
    <tr className="border-t border-cinza-claro">
      <td className="px-2 py-1.5 font-mono text-cinza-medio">{codigo}</td>
      <td className="px-2 py-1.5">
        <input
          value={editado.razaoSocial}
          onChange={(e) => campo("razaoSocial", e.target.value)}
          className="w-36 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.nomeFantasia}
          onChange={(e) => campo("nomeFantasia", e.target.value)}
          className={`w-36 rounded border px-1.5 py-1 ${!editado.nomeFantasia.trim() ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <div className="flex w-40 flex-wrap gap-1">
          {GRUPO_OPCOES.map((g) => {
            const ativo = editado.grupos.includes(g.codigo);
            return (
              <button
                key={g.codigo}
                type="button"
                title={g.descricao}
                onClick={() =>
                  campo(
                    "grupos",
                    ativo ? editado.grupos.filter((c) => c !== g.codigo) : [...editado.grupos, g.codigo]
                  )
                }
                className={`rounded px-1 py-0.5 font-mono text-[9px] font-bold ${
                  ativo ? "bg-ambar text-branco" : "bg-off-white text-cinza-medio hover:bg-cinza-claro"
                }`}
              >
                {g.codigo}
              </button>
            );
          })}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.nomeVendedor}
          onChange={(e) => campo("nomeVendedor", e.target.value)}
          className={`w-32 rounded border px-1.5 py-1 ${!editado.nomeVendedor.trim() ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.whatsapp}
          onChange={(e) => campo("whatsapp", e.target.value)}
          className={`w-32 rounded border px-1.5 py-1 ${!editado.whatsapp.trim() ? VAZIO_CLASSE : NORMAL_CLASSE}`}
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.condicoesPagamento}
          onChange={(e) => campo("condicoesPagamento", e.target.value)}
          className="w-36 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.prazoBoleto}
          onChange={(e) => campo("prazoBoleto", e.target.value)}
          className="w-20 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <CampoNumero value={editado.limiteCredito} onChange={(v) => campo("limiteCredito", v)} className="w-20" />
      </td>
      <td className="px-2 py-1.5">
        <CampoNumero value={editado.pedidoMinimo} onChange={(v) => campo("pedidoMinimo", v)} className="w-20" />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.diasEntrega}
          onChange={(e) => campo("diasEntrega", e.target.value)}
          className="w-28 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="px-2 py-1.5">
        <input
          value={editado.observacoes}
          onChange={(e) => campo("observacoes", e.target.value)}
          className="w-48 rounded border border-cinza-claro px-1.5 py-1"
        />
      </td>
      <td className="min-w-[80px] px-2 py-1.5 text-center">
        {mudou && !pending && (
          <button
            type="button"
            onClick={() => onSalvar(codigo)}
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
};
