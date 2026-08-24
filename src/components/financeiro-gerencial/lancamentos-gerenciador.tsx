"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarLancamentoAction, registrarBaixaAction } from "@/app/(app)/financeiro-gerencial/lancamentos/actions";
import { CampoNumero } from "@/components/campo-numero";
import { Th } from "@/components/tabela";
import { calcularSaldoAberto } from "@/lib/financeiro-gerencial/parcelas";
import type {
  CategoriaFinanceira,
  ContaFinanceira,
  Lancamento,
  Parcela,
  StatusParcela,
  TipoLancamento,
} from "@/lib/financeiro-gerencial/tipos";

const STATUS_LABEL: Record<StatusParcela, string> = {
  aberto: "Em aberto",
  parcial: "Parcial",
  quitado: "Quitado",
  cancelado: "Cancelado",
};

const STATUS_CLASSE: Record<StatusParcela, string> = {
  aberto: "bg-ambar/20 text-azul-noite",
  parcial: "bg-azul-petroleo/20 text-azul-petroleo",
  quitado: "bg-verde/20 text-verde",
  cancelado: "bg-cinza-claro text-cinza-medio",
};

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LancamentosGerenciador({
  tipo,
  lancamentos,
  categorias,
  contas,
}: {
  tipo: TipoLancamento;
  lancamentos: Lancamento[];
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
}) {
  const titulo = tipo === "receita" ? "Lançamentos de receitas" : "Lançamentos de despesas";

  return (
    <div className="flex flex-col gap-5 pb-10">
      <h1 className="font-display text-2xl font-bold text-azul-noite">{titulo}</h1>

      <NovoLancamentoForm tipo={tipo} categorias={categorias} contas={contas} />

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-cinza-claro">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Competência</Th>
              <Th>Descrição</Th>
              <Th>Categoria</Th>
              <Th align="center">Parcela</Th>
              <Th align="right">Valor</Th>
              <Th>Vencimento</Th>
              <Th align="center">Status</Th>
              <Th align="right">Saldo em aberto</Th>
              <Th align="right">Ação</Th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.flatMap((lancamento) =>
              lancamento.parcelas.map((parcela) => (
                <LinhaParcela key={parcela.id} lancamento={lancamento} parcela={parcela} contas={contas} />
              )),
            )}
            {lancamentos.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-sm text-cinza-medio">
                  Nenhum lançamento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NovoLancamentoForm({
  tipo,
  categorias,
  contas,
}: {
  tipo: TipoLancamento;
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
}) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [descricao, setDescricao] = useState("");
  const [dataCompetencia, setDataCompetencia] = useState(hoje());
  const [contaFinanceiraId, setContaFinanceiraId] = useState(contas[0]?.id ?? "");
  const [observacao, setObservacao] = useState("");
  const [valorTotal, setValorTotal] = useState<number | null>(null);
  const [quantidadeParcelas, setQuantidadeParcelas] = useState(1);
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(hoje());
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarLancamentoAction({
        tipo,
        categoriaId,
        descricao,
        dataCompetencia,
        contaFinanceiraId: contaFinanceiraId || null,
        observacao,
        valorTotal: valorTotal ?? 0,
        quantidadeParcelas,
        dataPrimeiraParcela,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setDescricao("");
      setObservacao("");
      setValorTotal(null);
      setQuantidadeParcelas(1);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
        Novo lançamento de {tipo === "receita" ? "receita" : "despesa"}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Categoria
          <select
            required
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Conta financeira
          <select
            value={contaFinanceiraId}
            onChange={(e) => setContaFinanceiraId(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          >
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Descrição
        <input
          required
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Competência
          <input
            type="date"
            required
            value={dataCompetencia}
            onChange={(e) => setDataCompetencia(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Valor total
          <CampoNumero value={valorTotal} onChange={setValorTotal} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Parcelas
          <input
            type="number"
            min={1}
            max={360}
            value={quantidadeParcelas}
            onChange={(e) => setQuantidadeParcelas(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          1º vencimento
          <input
            type="date"
            required
            value={dataPrimeiraParcela}
            onChange={(e) => setDataPrimeiraParcela(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Observação
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={isPending || !categoriaId}
        className="mt-1 w-full rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50 sm:w-auto"
      >
        {isPending ? "Salvando..." : "Adicionar lançamento"}
      </button>
    </form>
  );
}

function LinhaParcela({
  lancamento,
  parcela,
  contas,
}: {
  lancamento: Lancamento;
  parcela: Parcela;
  contas: ContaFinanceira[];
}) {
  const router = useRouter();
  const [baixando, setBaixando] = useState(false);
  const [contaFinanceiraId, setContaFinanceiraId] = useState(parcela.contaFinanceiraId ?? contas[0]?.id ?? "");
  const [valor, setValor] = useState<number | null>(calcularSaldoAberto(parcela.valor, parcela.valorBaixado));
  const [data, setData] = useState(hoje());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const saldoAberto = calcularSaldoAberto(parcela.valor, parcela.valorBaixado);
  const podeBaixar = parcela.status === "aberto" || parcela.status === "parcial";

  function confirmarBaixa(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await registrarBaixaAction({
        parcelaId: parcela.id,
        contaFinanceiraId,
        valor: valor ?? 0,
        data,
        observacao,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setBaixando(false);
      router.refresh();
    });
  }

  return (
    <>
      <tr className="border-b border-cinza-claro">
        <td className="whitespace-nowrap px-3 py-2">{lancamento.dataCompetencia}</td>
        <td className="px-3 py-2">{lancamento.descricao}</td>
        <td className="px-3 py-2">{lancamento.categoriaNome}</td>
        <td className="px-3 py-2 text-center">
          {parcela.numero}/{parcela.totalParcelas}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(parcela.valor)}</td>
        <td className="whitespace-nowrap px-3 py-2">{parcela.dataPrevista}</td>
        <td className="px-3 py-2 text-center">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSE[parcela.status]}`}>
            {STATUS_LABEL[parcela.status]}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(saldoAberto)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          {podeBaixar && (
            <button
              type="button"
              onClick={() => setBaixando((v) => !v)}
              className="text-xs font-semibold text-azul-petroleo"
            >
              {lancamento.tipo === "receita" ? "Registrar recebimento" : "Registrar pagamento"}
            </button>
          )}
        </td>
      </tr>
      {baixando && (
        <tr className="border-b border-cinza-claro bg-cinza-claro/20">
          <td colSpan={9} className="p-3">
            <form onSubmit={confirmarBaixa} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Conta financeira
                <select
                  value={contaFinanceiraId}
                  onChange={(e) => setContaFinanceiraId(e.target.value)}
                  className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
                >
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Valor
                <CampoNumero value={valor} onChange={setValor} className="w-28" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Data
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Observação
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
                />
              </label>
              {erro && <p className="w-full text-xs text-vermelho">{erro}</p>}
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
              >
                {isPending ? "Salvando..." : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setBaixando(false)}
                className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
              >
                Cancelar
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
