"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { alterarVencimentoFaturaAction, pagarFaturaAction } from "@/app/(app)/financeiro-gerencial/cartoes/actions";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import {
  EXPLICACAO_FATURA_CARTAO,
  ROTULO_SITUACAO_FATURA,
  formatarReferencia,
  referenciaFatura,
  type Fatura,
  type SituacaoFatura,
} from "@/lib/financeiro-gerencial/cartao";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { ContaFinanceira } from "@/lib/financeiro-gerencial/tipos";

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CLASSE_SITUACAO: Record<SituacaoFatura, string> = {
  aberta: "bg-azul-petroleo/10 text-azul-petroleo",
  fechada: "bg-ambar/20 text-azul-noite",
  paga: "bg-verde/15 text-verde",
  vencida: "bg-vermelho/10 text-vermelho",
};

const DICA_TOTAL = "Soma das compras e parcelas que caíram nesta fatura (parcelas canceladas não entram).";
const DICA_PAGO = "Soma do que já foi pago das compras desta fatura, descontados os estornos.";
const DICA_SALDO = "Total da fatura menos o que já foi pago.";
const DICA_SITUACAO =
  "Aberta: até o dia do fechamento, ainda recebe compras. Fechada: passou o fechamento e ainda tem saldo, antes do vencimento. " +
  "Vencida: passou o vencimento com saldo. Paga: saldo zero.";

type Props = {
  cartoes: ContaFinanceira[];
  cartaoId: string | null;
  faturas: Fatura[];
  contasPagadoras: ContaFinanceira[];
  nomesContas: Record<string, string>;
  hoje: string;
  podeGestao: boolean;
};

export function CartoesFaturas({ cartoes, cartaoId, faturas, contasPagadoras, nomesContas, hoje, podeGestao }: Props) {
  const router = useRouter();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const cartao = cartoes.find((c) => c.id === cartaoId) ?? null;
  const referenciaAtual = cartao?.diaFechamento ? referenciaFatura(hoje, cartao.diaFechamento) : null;
  const aberta = faturas.find((f) => f.id === abertaId) ?? null;
  const opcoesCartao = useMemo(
    () => cartoes.map((c) => ({ id: c.id, label: c.ativo ? c.nome : `${c.nome} (inativo)` })),
    [cartoes],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Cartões</h1>
        <p className="text-sm text-cinza-medio">
          A compra no cartão entra na DRE pela data da compra. O dinheiro só sai do banco no pagamento da fatura.
        </p>
      </div>

      {cartoes.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum cartão de crédito cadastrado. Cadastre em Contas financeiras com o tipo &quot;Cartão de crédito&quot;.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio sm:w-80">
              Cartão
              <SeletorComBusca
                value={cartaoId ?? ""}
                opcoes={opcoesCartao}
                onChange={(id) => {
                  setAbertaId(null);
                  router.push(`/financeiro-gerencial/cartoes?cartao=${encodeURIComponent(id)}`);
                }}
                placeholder="Escolha o cartão"
              />
            </label>
            {cartao && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-cinza-medio">
                <span>Fecha dia {cartao.diaFechamento}</span>
                <span>Vence dia {cartao.diaVencimento}</span>
                <span>Paga por: {cartao.contaPagadoraId ? (nomesContas[cartao.contaPagadoraId] ?? "-") : "não definido"}</span>
                <DicaCalculo rotulo="Como a fatura é escolhida" texto={EXPLICACAO_FATURA_CARTAO} />
              </div>
            )}
          </div>

          {faturas.length === 0 ? (
            <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
              Nenhuma fatura ainda. Ela nasce quando uma despesa é lançada com este cartão como conta financeira.
            </p>
          ) : (
            <TabelaRolavel ariaLabel="Faturas do cartão">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-azul-petroleo text-branco">
                    <Th larguraFixa="96px">Referência</Th>
                    <Th larguraFixa="96px">Fechamento</Th>
                    <Th larguraFixa="96px">Vencimento</Th>
                    <Th align="right" larguraFixa="112px">
                      Total <DicaCalculo rotulo="Total" texto={DICA_TOTAL} />
                    </Th>
                    <Th align="right" larguraFixa="112px">
                      Pago <DicaCalculo rotulo="Pago" texto={DICA_PAGO} />
                    </Th>
                    <Th align="right" larguraFixa="112px">
                      Saldo <DicaCalculo rotulo="Saldo" texto={DICA_SALDO} />
                    </Th>
                    <Th align="center" larguraFixa="104px">
                      Situação <DicaCalculo rotulo="Situação" texto={DICA_SITUACAO} />
                    </Th>
                    <Th align="center" larguraFixa="80px" />
                  </tr>
                </thead>
                <tbody>
                  {faturas.map((f) => {
                    const atual = f.referencia === referenciaAtual;
                    return (
                      <tr key={f.id} className={`border-t border-cinza-claro ${atual ? "bg-ambar/10" : "hover:bg-off-white/60"}`}>
                        <td className="whitespace-nowrap px-3 py-2 font-semibold text-azul-noite">
                          {formatarReferencia(f.referencia)}
                          {atual && <span className="ml-2 rounded bg-ambar px-1.5 py-0.5 text-[10px] font-bold text-azul-noite">Atual</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(f.fechamento)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(f.vencimento)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(f.total)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(f.pago)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">R$ {formatarMoeda(f.saldo)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${CLASSE_SITUACAO[f.situacao]}`}>
                            {ROTULO_SITUACAO_FATURA[f.situacao]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button type="button" onClick={() => setAbertaId(f.id)} className="text-xs font-semibold text-azul-petroleo">
                            Abrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TabelaRolavel>
          )}
        </>
      )}

      <ModalFlutuante aberto={aberta !== null} onFechar={() => setAbertaId(null)} larga>
        {aberta && cartao && (
          <DetalheFatura
            key={aberta.id}
            fatura={aberta}
            cartao={cartao}
            contasPagadoras={contasPagadoras}
            nomesContas={nomesContas}
            hoje={hoje}
            podeGestao={podeGestao}
            onFechar={() => setAbertaId(null)}
          />
        )}
      </ModalFlutuante>
    </div>
  );
}

type Modo = "ver" | "pagar" | "vencimento";

function DetalheFatura({
  fatura,
  cartao,
  contasPagadoras,
  nomesContas,
  hoje,
  podeGestao,
  onFechar,
}: {
  fatura: Fatura;
  cartao: ContaFinanceira;
  contasPagadoras: ContaFinanceira[];
  nomesContas: Record<string, string>;
  hoje: string;
  podeGestao: boolean;
  onFechar: () => void;
}) {
  const [modo, setModo] = useState<Modo>("ver");
  const titulo = `Fatura ${formatarReferencia(fatura.referencia)} - ${cartao.nome}`;

  if (modo === "pagar") {
    return (
      <PagamentoFatura
        titulo={titulo}
        fatura={fatura}
        cartao={cartao}
        contasPagadoras={contasPagadoras}
        hoje={hoje}
        onVoltar={() => setModo("ver")}
      />
    );
  }
  if (modo === "vencimento") {
    return <AlterarVencimento titulo={titulo} fatura={fatura} onVoltar={() => setModo("ver")} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
          <p className="text-xs text-cinza-medio">
            Fechamento {formatarDataBr(fatura.fechamento)} - Vencimento {formatarDataBr(fatura.vencimento)} -{" "}
            {ROTULO_SITUACAO_FATURA[fatura.situacao]}
          </p>
        </div>
        <div className="flex gap-2">
          {podeGestao && (
            <button
              type="button"
              onClick={() => setModo("vencimento")}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Alterar vencimento
            </button>
          )}
          {fatura.saldo > 0 && (
            <button
              type="button"
              onClick={() => setModo("pagar")}
              className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
            >
              Pagamento de fatura
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-off-white p-3 text-sm">
        <Resumo rotulo="Total" valor={fatura.total} dica={DICA_TOTAL} />
        <Resumo rotulo="Pago" valor={fatura.pago} dica={DICA_PAGO} />
        <Resumo rotulo="Saldo" valor={fatura.saldo} dica={DICA_SALDO} destaque />
      </div>

      <p className="text-xs text-cinza-medio">
        Cada compra entra na DRE pela data da compra. O dinheiro sai do banco no dia do pagamento da fatura.
      </p>

      {fatura.itens.length === 0 ? (
        <p className="text-sm text-cinza-medio">Nenhuma compra nesta fatura.</p>
      ) : (
        <TabelaRolavel className="max-h-[50vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Compras da fatura">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="96px">Data da compra</Th>
                <Th>Descrição</Th>
                <Th>Plano de Contas</Th>
                <Th align="center" larguraFixa="72px">Parcela</Th>
                <Th align="right" larguraFixa="104px">Valor</Th>
                <Th align="right" larguraFixa="104px">
                  Pago <DicaCalculo rotulo="Pago da compra" texto="Quanto desta parcela já foi pago, descontados os estornos." />
                </Th>
              </tr>
            </thead>
            <tbody>
              {fatura.itens.map((i) => (
                <tr key={i.parcelaId} className="border-t border-cinza-claro">
                  <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(i.dataCompra)}</td>
                  <td className="max-w-[240px] truncate px-3 py-2" title={i.descricao}>
                    {i.descricao}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={i.planoDeContas}>
                    {i.planoDeContas}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-center">
                    {i.numero}/{i.totalParcelas}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(i.valor)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">R$ {formatarMoeda(i.pago)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}

      {fatura.pagamentos.length > 0 && (
        <div className="text-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">Pagamentos</div>
          <ul className="mt-1 flex flex-col gap-1 text-xs text-cinza">
            {fatura.pagamentos.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>
                  {formatarDataBr(p.data)} - {nomesContas[p.contaFinanceiraId] ?? "-"}
                </span>
                <span className="whitespace-nowrap">R$ {formatarMoeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onFechar}
        className="mt-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
      >
        Fechar
      </button>
    </div>
  );
}

function Resumo({ rotulo, valor, dica, destaque = false }: { rotulo: string; valor: number; dica: string; destaque?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">
        {rotulo} <DicaCalculo rotulo={rotulo} texto={dica} />
      </div>
      <div className={`font-mono ${destaque ? "font-semibold text-azul-noite" : "text-cinza"}`}>R$ {formatarMoeda(valor)}</div>
    </div>
  );
}

function PagamentoFatura({
  titulo,
  fatura,
  cartao,
  contasPagadoras,
  hoje,
  onVoltar,
}: {
  titulo: string;
  fatura: Fatura;
  cartao: ContaFinanceira;
  contasPagadoras: ContaFinanceira[];
  hoje: string;
  onVoltar: () => void;
}) {
  const router = useRouter();
  const opcoesConta = useMemo(() => contasPagadoras.map((c) => ({ id: c.id, label: c.nome })), [contasPagadoras]);
  const [contaFinanceiraId, setContaFinanceiraId] = useState(() =>
    cartao.contaPagadoraId && contasPagadoras.some((c) => c.id === cartao.contaPagadoraId)
      ? cartao.contaPagadoraId
      : (contasPagadoras[0]?.id ?? ""),
  );
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState<number | null>(fatura.saldo);
  // Gerada ao abrir: reenviar o mesmo formulário nunca paga duas vezes.
  const [chave] = useState(() => crypto.randomUUID().replace(/-/g, ""));
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!valor || valor <= 0) return setErro("Informe o valor pago.");
    if (Math.round(valor * 100) > Math.round(fatura.saldo * 100)) return setErro("Valor maior que o saldo em aberto da fatura.");
    startTransition(async () => {
      const r = await pagarFaturaAction({ faturaId: fatura.id, contaFinanceiraId, data, valor, chave });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
      onVoltar();
    });
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Pagamento de fatura</h2>
      <p className="text-sm text-cinza-medio">
        {titulo}. Saldo em aberto R$ {formatarMoeda(fatura.saldo)}. Pode pagar parte: o valor quita as compras da mais
        antiga para a mais nova.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Conta que pagou
        <SeletorComBusca value={contaFinanceiraId} opcoes={opcoesConta} onChange={setContaFinanceiraId} placeholder="Selecionar conta..." />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Data de Pagamento
          <input
            type="date"
            required
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Valor pago
          <CampoNumero value={valor} onChange={setValor} className="w-full" />
        </label>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !contaFinanceiraId || !data}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Registrando..." : "Confirmar pagamento"}
        </button>
        <button
          type="button"
          onClick={onVoltar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}

function AlterarVencimento({ titulo, fatura, onVoltar }: { titulo: string; fatura: Fatura; onVoltar: () => void }) {
  const router = useRouter();
  const [vencimento, setVencimento] = useState(fatura.vencimento);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await alterarVencimentoFaturaAction({ faturaId: fatura.id, vencimento });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
      onVoltar();
    });
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Alterar vencimento</h2>
      <p className="text-sm text-cinza-medio">
        {titulo}. Use quando o banco mudar a data real da fatura. Todas as compras desta fatura passam a vencer na nova data.
      </p>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Novo vencimento
        <input
          type="date"
          required
          value={vencimento}
          onChange={(e) => setVencimento(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !vencimento}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar vencimento"}
        </button>
        <button
          type="button"
          onClick={onVoltar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}
