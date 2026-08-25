"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  criarLancamentoAction,
  criarRecorrenciaAction,
  editarLancamentoAction,
  registrarBaixaAction,
} from "@/app/(app)/financeiro-gerencial/lancamentos/actions";
import { CampoNumero } from "@/components/campo-numero";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { calcularSaldoAberto } from "@/lib/financeiro-gerencial/parcelas";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { listarContasComCaminho } from "@/lib/financeiro-gerencial/categorias";
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

/** Rótulo do vencimento da parcela muda pelo tipo - "Data de Recebimento"
 * numa receita, "Data de Pagamento" numa despesa (nunca "Vencimento" genérico
 * nem "1º vencimento" - ajuste pedido por Vinícius em 25/08 depois do teste
 * real). */
function rotuloDataParcela(tipo: TipoLancamento): string {
  return tipo === "receita" ? "Data de Recebimento" : "Data de Pagamento";
}

/** Botão de criar abre modal (item 1), Plano de Contas e Conta Financeira
 * viram seletor com busca (item 3), Conta Financeira é opcional (item 5),
 * parcelas viram linhas manuais de Vencimento/Valor com recorrência opcional
 * (item 6) - correção de 25/08 do Financeiro gerencial. Tabela segue o
 * padrão do resto do app (`Th` + cabeçalho `bg-azul-petroleo text-branco` +
 * `TabelaRolavel` pro zoom/scroll horizontal) e a ordem de colunas da
 * planilha modelo - ajustes pedidos por Vinícius depois do teste real. */
export function LancamentosGerenciador({
  tipo,
  lancamentos,
  categorias,
  contas,
  podeGerir,
}: {
  tipo: TipoLancamento;
  lancamentos: Lancamento[];
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  /** Só Gestão/master edita lançamento já salvo (RLS `fin_lancamentos_update_gestao`). */
  podeGerir: boolean;
}) {
  const titulo = tipo === "receita" ? "Receitas" : "Despesas";
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Lancamento | null>(null);
  const rotuloData = rotuloDataParcela(tipo);

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-azul-noite">{titulo}</h1>
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
        >
          + {tipo === "receita" ? "Nova receita" : "Nova despesa"}
        </button>
      </div>

      <TabelaRolavel className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel={`Tabela de ${titulo.toLowerCase()}`}>
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th>Data de Competência</Th>
              <Th>{rotuloData}</Th>
              <Th align="right">Valor</Th>
              <Th>Descrição</Th>
              <Th align="center">Parcela</Th>
              <Th>Plano de Contas</Th>
              <Th align="center">Status</Th>
              <Th align="right">Ação</Th>
            </tr>
          </thead>
          <tbody>
            {lancamentos.flatMap((lancamento) =>
              lancamento.parcelas.map((parcela) => (
                <LinhaParcela
                  key={parcela.id}
                  lancamento={lancamento}
                  parcela={parcela}
                  contas={contas}
                  podeGerir={podeGerir}
                  onEditar={() => setEditando(lancamento)}
                />
              )),
            )}
            {lancamentos.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-sm text-cinza-medio">
                  Nenhum lançamento ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TabelaRolavel>

      <ModalFlutuante aberto={criando} onFechar={() => setCriando(false)}>
        <FormularioLancamento tipo={tipo} categorias={categorias} contas={contas} onSalvo={() => setCriando(false)} onCancelar={() => setCriando(false)} />
      </ModalFlutuante>

      <ModalFlutuante aberto={editando !== null} onFechar={() => setEditando(null)}>
        {editando && (
          <FormularioEditarLancamento
            lancamento={editando}
            categorias={categorias}
            contas={contas}
            onSalvo={() => setEditando(null)}
            onCancelar={() => setEditando(null)}
          />
        )}
      </ModalFlutuante>
    </div>
  );
}

type LinhaValor = { valor: number | null; dataPrevista: string };

function FormularioLancamento({
  tipo,
  categorias,
  contas,
  onSalvo,
  onCancelar,
}: {
  tipo: TipoLancamento;
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const opcoesCategoria = useMemo(() => listarContasComCaminho(categorias), [categorias]);
  const opcoesConta = useMemo(() => contas.map((c) => ({ id: c.id, label: c.nome })), [contas]);
  const rotuloData = rotuloDataParcela(tipo);

  const [categoriaId, setCategoriaId] = useState(opcoesCategoria[0]?.id ?? "");
  const [descricao, setDescricao] = useState("");
  const [dataCompetencia, setDataCompetencia] = useState(hoje());
  const [contaFinanceiraId, setContaFinanceiraId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modo comum: linhas manuais de Vencimento/Valor - 1 linha = à vista, 2+ = parcelado.
  const [linhas, setLinhas] = useState<LinhaValor[]>([{ valor: null, dataPrevista: hoje() }]);

  // Modo recorrente
  const [valorRecorrencia, setValorRecorrencia] = useState<number | null>(null);
  const [diaVencimento, setDiaVencimento] = useState(hoje().slice(8, 10));
  const [dataInicio, setDataInicio] = useState(hoje());
  const [modoFim, setModoFim] = useState<"data" | "quantidade">("quantidade");
  const [dataFim, setDataFim] = useState("");
  const [quantidadeOcorrencias, setQuantidadeOcorrencias] = useState(12);

  function adicionarLinha() {
    setLinhas((atual) => [...atual, { valor: null, dataPrevista: hoje() }]);
  }
  function removerLinha(indice: number) {
    setLinhas((atual) => atual.filter((_, i) => i !== indice));
  }
  function atualizarLinha(indice: number, patch: Partial<LinhaValor>) {
    setLinhas((atual) => atual.map((linha, i) => (i === indice ? { ...linha, ...patch } : linha)));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      if (recorrente) {
        const fim =
          modoFim === "data"
            ? { modo: "data" as const, dataFim }
            : { modo: "quantidade" as const, quantidadeOcorrencias };
        const resultado = await criarRecorrenciaAction({
          tipo,
          categoriaId,
          descricao,
          valor: valorRecorrencia ?? 0,
          diaVencimento: Number(diaVencimento),
          dataInicio,
          fim,
        });
        if (!resultado.ok) {
          setErro(resultado.mensagem);
          return;
        }
        router.refresh();
        onSalvo();
        return;
      }

      const resultado = await criarLancamentoAction({
        tipo,
        categoriaId,
        descricao,
        dataCompetencia,
        contaFinanceiraId: contaFinanceiraId || null,
        observacao,
        parcelas: linhas.map((l) => ({ valor: l.valor ?? 0, dataPrevista: l.dataPrevista })),
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onSalvo();
    });
  }

  const rotuloAdicionar = tipo === "receita" ? "+ Adicionar recebimento" : "+ Adicionar pagamento";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">
        {tipo === "receita" ? "Nova receita" : "Nova despesa"}
      </h2>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Plano de Contas
        <SeletorComBusca
          value={categoriaId}
          opcoes={opcoesCategoria.map((c) => ({ id: c.id, label: c.caminho }))}
          onChange={setCategoriaId}
          placeholder="Selecionar conta..."
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Descrição
        <input
          required
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>

      {!recorrente && (
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Data de Competência
          <input
            type="date"
            required
            value={dataCompetencia}
            onChange={(e) => setDataCompetencia(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta financeira
        <SeletorComBusca
          value={contaFinanceiraId}
          opcoes={opcoesConta}
          onChange={setContaFinanceiraId}
          placeholder="Nenhuma (decidir na baixa)"
          vazioLabel="Nenhuma (decidir na baixa)"
        />
      </label>

      {!recorrente && (
        <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
            {linhas.length > 1 ? "Parcelas" : rotuloData}
          </div>
          {linhas.map((linha, indice) => (
            <div key={indice} className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                {linhas.length > 1 ? `${rotuloData} ${indice + 1}/${linhas.length}` : rotuloData}
                <input
                  type="date"
                  required
                  value={linha.dataPrevista}
                  onChange={(e) => atualizarLinha(indice, { dataPrevista: e.target.value })}
                  className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Valor
                <CampoNumero value={linha.valor} onChange={(v) => atualizarLinha(indice, { valor: v })} className="w-full" />
              </label>
              {linhas.length > 1 && (
                <button
                  type="button"
                  onClick={() => removerLinha(indice)}
                  className="mb-1.5 shrink-0 text-xs font-semibold text-vermelho"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={adicionarLinha} className="self-start text-xs font-semibold text-azul-petroleo">
            {rotuloAdicionar}
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm font-semibold text-cinza-medio">
        <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
        Esta conta é recorrente?
      </label>

      {recorrente && (
        <div className="flex flex-col gap-3 rounded-lg border border-cinza-claro p-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Valor de cada ocorrência
            <CampoNumero value={valorRecorrencia} onChange={setValorRecorrencia} className="w-full" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Dia de vencimento
              <input
                type="number"
                min={1}
                max={31}
                required
                value={diaVencimento}
                onChange={(e) => setDiaVencimento(e.target.value)}
                className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Data inicial
              <input
                type="date"
                required
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-xs font-semibold text-cinza-medio">Até quando</div>
            <div className="flex gap-3 text-xs text-cinza-medio">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoFim === "quantidade"} onChange={() => setModoFim("quantidade")} />
                Número de ocorrências
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={modoFim === "data"} onChange={() => setModoFim("data")} />
                Data final
              </label>
            </div>
            {modoFim === "quantidade" ? (
              <input
                type="number"
                min={1}
                max={360}
                required
                value={quantidadeOcorrencias}
                onChange={(e) => setQuantidadeOcorrencias(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
              />
            ) : (
              <input
                type="date"
                required
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
              />
            )}
          </div>
        </div>
      )}

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
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !categoriaId}
          className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Só os campos do lançamento (Plano de Contas, descrição, competência,
 * conta financeira, observação) - parcela é imutável, corrige por estorno. */
function FormularioEditarLancamento({
  lancamento,
  categorias,
  contas,
  onSalvo,
  onCancelar,
}: {
  lancamento: Lancamento;
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const opcoesCategoria = useMemo(() => listarContasComCaminho(categorias), [categorias]);
  const opcoesConta = useMemo(() => contas.map((c) => ({ id: c.id, label: c.nome })), [contas]);

  const [categoriaId, setCategoriaId] = useState(lancamento.categoriaId);
  const [descricao, setDescricao] = useState(lancamento.descricao);
  const [dataCompetencia, setDataCompetencia] = useState(lancamento.dataCompetencia);
  const [contaFinanceiraId, setContaFinanceiraId] = useState(lancamento.contaFinanceiraId ?? "");
  const [observacao, setObservacao] = useState(lancamento.observacao);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await editarLancamentoAction({
        id: lancamento.id,
        categoriaId,
        descricao,
        dataCompetencia,
        contaFinanceiraId: contaFinanceiraId || null,
        observacao,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onSalvo();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Editar lançamento</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Plano de Contas
        <SeletorComBusca
          value={categoriaId}
          opcoes={opcoesCategoria.map((c) => ({ id: c.id, label: c.caminho }))}
          onChange={setCategoriaId}
          placeholder="Selecionar conta..."
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Descrição
        <input
          required
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Data de Competência
        <input
          type="date"
          required
          value={dataCompetencia}
          onChange={(e) => setDataCompetencia(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta financeira
        <SeletorComBusca
          value={contaFinanceiraId}
          opcoes={opcoesConta}
          onChange={setContaFinanceiraId}
          placeholder="Nenhuma (decidir na baixa)"
          vazioLabel="Nenhuma (decidir na baixa)"
        />
      </label>
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
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function LinhaParcela({
  lancamento,
  parcela,
  contas,
  podeGerir,
  onEditar,
}: {
  lancamento: Lancamento;
  parcela: Parcela;
  contas: ContaFinanceira[];
  podeGerir: boolean;
  onEditar: () => void;
}) {
  const [baixando, setBaixando] = useState(false);
  const saldoAberto = calcularSaldoAberto(parcela.valor, parcela.valorBaixado);
  const podeBaixar = parcela.status === "aberto" || parcela.status === "parcial";

  return (
    <>
      <tr className="border-b border-cinza-claro">
        <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(lancamento.dataCompetencia)}</td>
        <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(parcela.dataPrevista)}</td>
        <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(parcela.valor)}</td>
        <td className="px-3 py-2">
          {lancamento.descricao}
          {lancamento.origem === "recorrencia" && (
            <span className="ml-1.5 rounded-full bg-azul-petroleo/10 px-1.5 py-0.5 text-[10px] font-semibold text-azul-petroleo">
              Recorrente
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-center">
          {parcela.numero}/{parcela.totalParcelas}
        </td>
        <td className="px-3 py-2">{lancamento.categoriaNome}</td>
        <td className="px-3 py-2 text-center">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSE[parcela.status]}`}>
            {STATUS_LABEL[parcela.status]}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <div className="flex justify-end gap-2">
            {podeGerir && (
              <button type="button" onClick={onEditar} className="text-xs font-semibold text-azul-petroleo">
                Editar
              </button>
            )}
            {podeBaixar && (
              <button type="button" onClick={() => setBaixando(true)} className="text-xs font-semibold text-azul-petroleo">
                {lancamento.tipo === "receita" ? "Registrar recebimento" : "Registrar pagamento"}
              </button>
            )}
          </div>
        </td>
      </tr>

      <ModalFlutuante aberto={baixando} onFechar={() => setBaixando(false)}>
        <FormularioBaixa
          lancamento={lancamento}
          parcela={parcela}
          contas={contas}
          saldoAberto={saldoAberto}
          onSalvo={() => setBaixando(false)}
          onCancelar={() => setBaixando(false)}
        />
      </ModalFlutuante>
    </>
  );
}

function FormularioBaixa({
  lancamento,
  parcela,
  contas,
  saldoAberto,
  onSalvo,
  onCancelar,
}: {
  lancamento: Lancamento;
  parcela: Parcela;
  contas: ContaFinanceira[];
  saldoAberto: number;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const opcoesConta = useMemo(() => contas.map((c) => ({ id: c.id, label: c.nome })), [contas]);
  const [contaFinanceiraId, setContaFinanceiraId] = useState(parcela.contaFinanceiraId ?? contas[0]?.id ?? "");
  const [valor, setValor] = useState<number | null>(saldoAberto);
  const [data, setData] = useState(hoje());
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      router.refresh();
      onSalvo();
    });
  }

  return (
    <form onSubmit={confirmarBaixa} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">
        {lancamento.tipo === "receita" ? "Registrar recebimento" : "Registrar pagamento"}
      </h2>
      <p className="text-xs text-cinza-medio">
        {lancamento.descricao} - saldo em aberto R$ {formatarMoeda(saldoAberto)}
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta financeira
        <SeletorComBusca value={contaFinanceiraId} opcoes={opcoesConta} onChange={setContaFinanceiraId} placeholder="Selecionar conta..." />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Valor
        <CampoNumero value={valor} onChange={setValor} className="w-full" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Data
        <input
          type="date"
          required
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Observação
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !contaFinanceiraId}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
