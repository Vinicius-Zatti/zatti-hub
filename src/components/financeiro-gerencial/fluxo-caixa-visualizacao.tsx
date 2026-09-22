"use client";

import { useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { anosSelecionaveis, CartaoIndicador, formatarNumero, TabelaAnualBloco } from "@/components/financeiro-gerencial/tabela-anual";
import type { VisaoCaixa } from "@/lib/financeiro-gerencial/caixa";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { LinhaDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import type { LinhaFluxoDiario } from "@/lib/financeiro-gerencial/relatorios-caixa";

export const MESES_EXTENSO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const EXPLICACAO_VISAO: Record<VisaoCaixa, string> = {
  projetado: "Projetado: toda parcela não cancelada, pelo valor cheio, na Data de Recebimento/Pagamento prevista.",
  realizado: "Realizado: só o que já foi recebido ou pago, na data efetiva da baixa (estorno desconta).",
};

/** Botões lado a lado pra alternar visão (Projetado | Realizado) - nunca os
 * dois ao mesmo tempo na tela. */
export function AlternadorVisao<T extends string>({
  opcoes,
  valor,
  onMudar,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onMudar: (v: T) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-cinza-claro">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          className={`px-3 py-1.5 text-sm font-semibold ${o.valor === valor ? "bg-azul-petroleo text-branco" : "bg-branco text-cinza hover:bg-off-white"}`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function FluxoCaixaVisualizacao({
  ano,
  visao,
  modo,
  mes,
  contaId,
  contas,
  linhasMensais,
  diario,
}: {
  ano: number;
  visao: VisaoCaixa;
  modo: "mensal" | "diario";
  mes: number;
  contaId: string | null;
  contas: { id: string; nome: string }[];
  linhasMensais: LinhaDreAnual[];
  diario: { saldoInicial: number; dias: LinhaFluxoDiario[] } | null;
}) {
  const router = useRouter();

  function navegar(mudancas: Partial<{ ano: number; visao: VisaoCaixa; modo: "mensal" | "diario"; mes: number; conta: string | null }>) {
    const atual = { ano, visao, modo, mes, conta: contaId, ...mudancas };
    const qs = new URLSearchParams({ ano: String(atual.ano), visao: atual.visao, modo: atual.modo, mes: String(atual.mes) });
    if (atual.conta) qs.set("conta", atual.conta);
    router.push(`/financeiro-gerencial/fluxo-caixa?${qs.toString()}`);
  }

  const tituloVisao = visao === "projetado" ? "Projetado" : "Realizado";
  const totalEntradas = diario ? diario.dias.reduce((s, d) => s + d.entradas, 0) : 0;
  const totalSaidas = diario ? diario.dias.reduce((s, d) => s + d.saidas, 0) : 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">
            Fluxo de Caixa {tituloVisao} - {modo === "mensal" ? ano : `${MESES_EXTENSO[mes - 1]} de ${ano}`}
          </h1>
          <p className="text-sm text-cinza-medio">{EXPLICACAO_VISAO[visao]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AlternadorVisao
            opcoes={[
              { valor: "projetado", rotulo: "Projetado" },
              { valor: "realizado", rotulo: "Realizado" },
            ]}
            valor={visao}
            onMudar={(v) => navegar({ visao: v })}
          />
          <AlternadorVisao
            opcoes={[
              { valor: "mensal", rotulo: "Mensal" },
              { valor: "diario", rotulo: "Diário" },
            ]}
            valor={modo}
            onMudar={(v) => navegar({ modo: v })}
          />
          <select value={ano} onChange={(e) => navegar({ ano: Number(e.target.value) })} className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza">
            {anosSelecionaveis().map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {modo === "diario" && (
            <select value={mes} onChange={(e) => navegar({ mes: Number(e.target.value) })} className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza">
              {MESES_EXTENSO.map((nome, i) => (
                <option key={nome} value={i + 1}>
                  {nome}
                </option>
              ))}
            </select>
          )}
          <select
            value={contaId ?? ""}
            onChange={(e) => navegar({ conta: e.target.value || null })}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
          >
            <option value="">Todas as contas</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {modo === "mensal" && (
        <TabelaAnualBloco titulo={`Fluxo mensal - ${tituloVisao}`} ariaLabel="Tabela do fluxo de caixa mensal" rotuloPrimeiraColuna="Mês" linhas={linhasMensais} />
      )}

      {modo === "diario" && diario && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <CartaoIndicador titulo="Saldo inicial" valor={formatarNumero(diario.saldoInicial)} />
            <CartaoIndicador titulo="Entradas" valor={formatarNumero(totalEntradas)} />
            <CartaoIndicador titulo="Saídas" valor={formatarNumero(totalSaidas)} />
            <CartaoIndicador titulo="Saldo final" valor={formatarNumero(diario.dias[diario.dias.length - 1]?.saldoAcumulado ?? diario.saldoInicial)} />
          </div>
          <TabelaRolavel ariaLabel="Tabela do fluxo de caixa diário">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="110px">Data</Th>
                  <Th align="right">Entradas</Th>
                  <Th align="right">Saídas</Th>
                  <Th align="right">Saldo do dia</Th>
                  <Th align="right">Saldo acumulado</Th>
                </tr>
              </thead>
              <tbody>
                {diario.dias.map((d) => {
                  const semMovimento = d.entradas === 0 && d.saidas === 0;
                  return (
                    <tr key={d.data} className={`border-t border-cinza-claro ${semMovimento ? "text-cinza-medio" : "text-cinza"}`}>
                      <td className="whitespace-nowrap px-3 py-1.5">{formatarDataBr(d.data)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{d.entradas ? formatarNumero(d.entradas) : "-"}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{d.saidas ? formatarNumero(d.saidas) : "-"}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{semMovimento ? "-" : formatarNumero(d.saldoDia)}</td>
                      <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono font-semibold ${d.saldoAcumulado < 0 ? "text-vermelho" : "text-azul-noite"}`}>
                        {formatarNumero(d.saldoAcumulado)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TabelaRolavel>
        </>
      )}
    </div>
  );
}
