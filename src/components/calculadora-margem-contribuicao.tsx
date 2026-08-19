"use client";

import { useState, useTransition } from "react";
import { CampoNumero } from "@/components/campo-numero";
import { salvarConfiguracaoFinanceiraAction } from "@/app/(app)/fichas-tecnicas/actions";
import { calcularMargemContribuicao } from "@/lib/fichas-tecnicas";
import type { ConfiguracaoFinanceira } from "@/lib/types";

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(n: number | null): string {
  return n === null ? "-" : `${(n * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** `taxaPagamento`/`aliquotaImposto` ficam guardadas como fração (0,13) mas o
 * campo edita em percentual (13) - mais natural pro cliente digitar. */
function paraPercentual(fracao: number): number {
  return fracao * 100;
}

function paraFracao(percentual: number | null): number {
  return percentual === null ? 0 : percentual / 100;
}

/** Variante clara do "!" de `info-icon.tsx`, que é feito só pra fundo escuro
 * (branco translúcido sobre escuro) - aqui o fundo é claro. */
function InfoIconClaro({ texto }: { texto: string }) {
  return (
    <span
      title={texto}
      className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full bg-azul-noite/15 text-[9px] font-bold leading-none text-azul-noite"
    >
      !
    </span>
  );
}

type ModoLucro = "valor" | "percentual";

export function CalculadoraMargemContribuicao({ configuracaoInicial }: { configuracaoInicial: ConfiguracaoFinanceira }) {
  const [faturamento, setFaturamento] = useState<number | null>(configuracaoInicial.faturamentoMedioMensal || null);
  const [custoFixo, setCustoFixo] = useState<number | null>(configuracaoInicial.custoFixoMedioMensal || null);
  const [lucroValor, setLucroValor] = useState<number | null>(configuracaoInicial.lucroDesejadoValor || null);
  const [taxaPagamentoPct, setTaxaPagamentoPct] = useState<number | null>(
    configuracaoInicial.taxaPagamento ? paraPercentual(configuracaoInicial.taxaPagamento) : null,
  );
  const [aliquotaImpostoPct, setAliquotaImpostoPct] = useState<number | null>(
    configuracaoInicial.aliquotaImposto ? paraPercentual(configuracaoInicial.aliquotaImposto) : null,
  );
  const [modoLucro, setModoLucro] = useState<ModoLucro>("valor");
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const lucroPercentualDerivado = faturamento && faturamento > 0 && lucroValor !== null ? (lucroValor / faturamento) * 100 : null;

  function aoMudarLucroPercentual(percentual: number | null) {
    setSalvo(false);
    if (percentual === null || !faturamento) {
      setLucroValor(null);
      return;
    }
    setLucroValor(faturamento * (percentual / 100));
  }

  const resultado = calcularMargemContribuicao({
    faturamentoMedioMensal: faturamento ?? 0,
    custoFixoMedioMensal: custoFixo ?? 0,
    lucroDesejadoValor: lucroValor ?? 0,
    taxaPagamento: paraFracao(taxaPagamentoPct),
    aliquotaImposto: paraFracao(aliquotaImpostoPct),
  });

  function salvar() {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const resposta = await salvarConfiguracaoFinanceiraAction({
        faturamentoMedioMensal: faturamento ?? 0,
        custoFixoMedioMensal: custoFixo ?? 0,
        lucroDesejadoValor: lucroValor ?? 0,
        taxaPagamento: paraFracao(taxaPagamentoPct),
        aliquotaImposto: paraFracao(aliquotaImpostoPct),
      });
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      setSalvo(true);
    });
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Calculadora de Margem Ideal</h1>
        <p className="text-sm text-cinza-medio">
          Mostra qual margem de contribuição o restaurante precisa ter pra pagar os custos fixos e
          bater o lucro mensal desejado. Essa margem alimenta o &ldquo;Preço de Venda Sugerido&rdquo;
          nas fichas técnicas de venda.
        </p>
      </div>

      <div className="rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Entradas</div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Faturamento médio mensal
            <CampoNumero
              value={faturamento}
              onChange={(v) => {
                setFaturamento(v);
                setSalvo(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Custo fixo médio mensal
            <CampoNumero
              value={custoFixo}
              onChange={(v) => {
                setCustoFixo(v);
                setSalvo(false);
              }}
            />
          </label>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-cinza-medio">Lucro mensal desejado</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setModoLucro("valor")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    modoLucro === "valor" ? "bg-azul-noite text-branco" : "border border-cinza-claro text-cinza-medio"
                  }`}
                >
                  R$
                </button>
                <button
                  type="button"
                  onClick={() => setModoLucro("percentual")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    modoLucro === "percentual" ? "bg-azul-noite text-branco" : "border border-cinza-claro text-cinza-medio"
                  }`}
                >
                  %
                </button>
              </div>
            </div>
            {modoLucro === "valor" ? (
              <>
                <CampoNumero
                  key="valor"
                  value={lucroValor}
                  onChange={(v) => {
                    setLucroValor(v);
                    setSalvo(false);
                  }}
                />
                <span className="text-xs text-cinza-medio">
                  = {lucroPercentualDerivado !== null ? `${lucroPercentualDerivado.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "-"}{" "}
                  do faturamento
                </span>
              </>
            ) : (
              <>
                <CampoNumero key="percentual" value={lucroPercentualDerivado} onChange={aoMudarLucroPercentual} />
                <span className="text-xs text-cinza-medio">= {lucroValor !== null ? brl(lucroValor) : "-"}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Deduções</div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            <span className="flex items-center gap-1.5">
              Taxa de Pagamento
              <InfoIconClaro texto="Média da cobrança da maquininha de cartão, somando todos os métodos de pagamento: Crédito, Débito e Pix." />
            </span>
            <CampoNumero
              value={taxaPagamentoPct}
              onChange={(v) => {
                setTaxaPagamentoPct(v);
                setSalvo(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            <span className="flex items-center gap-1.5">
              Alíquota de Imposto
              <InfoIconClaro texto="Confira com o seu contador em qual alíquota você está." />
            </span>
            <CampoNumero
              value={aliquotaImpostoPct}
              onChange={(v) => {
                setAliquotaImpostoPct(v);
                setSalvo(false);
              }}
            />
          </label>
        </div>

        {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}

        <button
          type="button"
          onClick={salvar}
          disabled={isPending}
          className="mt-4 w-full rounded-lg bg-ambar px-4 py-3 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar"}
        </button>
      </div>

      <div className="rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Resultados</div>
        <div className="flex flex-col gap-3">
          <ResultadoLinha label="% Custo fixo sobre o faturamento" valor={pct(resultado.percentualCustoFixo)} />
          <ResultadoLinha label="% Lucro desejado sobre o faturamento" valor={pct(resultado.lucroDesejadoPercentual)} />
          <ResultadoLinha label="Margem necessária pro ponto de equilíbrio" valor={pct(resultado.margemPontoEquilibrio)} />
          <ResultadoLinha label="Deduções (Taxa de Pagamento + Imposto)" valor={pct(resultado.deducoesTotal)} />
          <div className="flex items-center justify-between rounded-lg bg-azul-noite p-4 text-branco">
            <span className="text-sm font-semibold">Margem de contribuição necessária</span>
            <span className="font-display text-xl font-bold text-ambar">{pct(resultado.margemNecessaria)}</span>
          </div>
        </div>
        {resultado.margemNecessaria === null && (
          <p className="mt-3 text-xs text-ambar">Preencha o faturamento médio mensal pra calcular.</p>
        )}
      </div>
    </div>
  );
}

function ResultadoLinha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-cinza-medio">{label}</span>
      <span className="font-semibold text-azul-noite">{valor}</span>
    </div>
  );
}
