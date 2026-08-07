"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { AvisoDivergenciaModal } from "@/components/aviso-divergencia-modal";
import {
  criarConsolidadoAction,
  editarConsolidadoAction,
  type EntradaForm,
} from "@/app/(app)/financeiro/consolidado/actions";
import type { ConsolidadoVenda } from "@/lib/types";
import { useGuardaEdicao } from "@/components/guarda-edicao";

function hojeISO(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Campos = {
  credito: number | null;
  debito: number | null;
  pix: number | null;
  dinheiro: number | null;
  valeAlimentacao: number | null;
  salao: number | null;
  deliveryProprio: number | null;
  ifood: number | null;
  food99: number | null;
};

const ZERADOS: Campos = {
  credito: 0,
  debito: 0,
  pix: 0,
  dinheiro: 0,
  valeAlimentacao: 0,
  salao: 0,
  deliveryProprio: 0,
  ifood: 0,
  food99: 0,
};

function num(v: number | null): number {
  return v ?? 0;
}

/** Formulário de fechamento diário - usado tanto em "Novo Lançamento" quanto
 * em "Editar" (passando `existente`). Data não é editável depois de salvo,
 * é a chave natural do registro (unique unidade+data). */
export function NovoLancamentoForm({ existente }: { existente?: ConsolidadoVenda }) {
  const router = useRouter();
  const [dataISO] = useState(existente?.data ?? hojeISO());
  const [campos, setCampos] = useState<Campos>(
    existente
      ? {
          credito: existente.credito,
          debito: existente.debito,
          pix: existente.pix,
          dinheiro: existente.dinheiro,
          valeAlimentacao: existente.valeAlimentacao,
          salao: existente.salao,
          deliveryProprio: existente.deliveryProprio,
          ifood: existente.ifood,
          food99: existente.food99,
        }
      : ZERADOS
  );
  const [divergencia, setDivergencia] = useState<{
    totalFormasPagamento: number;
    totalCanais: number;
    diferenca: number;
  } | null>(null);
  const [jaExiste, setJaExiste] = useState<{ idExistente: string; podeEditar: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { ativar, desativar } = useGuardaEdicao();

  const totalFormasPagamento =
    num(campos.credito) + num(campos.debito) + num(campos.pix) + num(campos.dinheiro) + num(campos.valeAlimentacao);
  const totalCanais = num(campos.salao) + num(campos.deliveryProprio);
  const totalMarketplaces = num(campos.ifood) + num(campos.food99);
  const faturamentoTotal = totalFormasPagamento + totalMarketplaces;

  function atualizarCampo(chave: keyof Campos, valor: number | null) {
    setCampos((c) => ({ ...c, [chave]: valor }));
    ativar("Você tem um lançamento não salvo. Se sair agora, ele se perde.");
  }

  function montarInput(confirmarDivergencia: boolean): EntradaForm {
    return {
      data: dataISO,
      credito: num(campos.credito),
      debito: num(campos.debito),
      pix: num(campos.pix),
      dinheiro: num(campos.dinheiro),
      valeAlimentacao: num(campos.valeAlimentacao),
      salao: num(campos.salao),
      deliveryProprio: num(campos.deliveryProprio),
      ifood: num(campos.ifood),
      food99: num(campos.food99),
      confirmarDivergencia,
    };
  }

  function salvar(confirmarDivergencia: boolean) {
    setErro(null);
    setJaExiste(null);
    startTransition(async () => {
      const resultado = existente
        ? await editarConsolidadoAction(existente.id, montarInput(confirmarDivergencia))
        : await criarConsolidadoAction(montarInput(confirmarDivergencia));

      if (resultado.ok) {
        desativar();
        setDivergencia(null);
        router.push("/financeiro/consolidado");
        router.refresh();
        return;
      }

      if (resultado.tipo === "divergencia") {
        setDivergencia(resultado.totais);
        return;
      }
      if (resultado.tipo === "ja_existe") {
        setJaExiste(resultado);
        return;
      }
      setErro(resultado.mensagem);
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    salvar(false);
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">
          {existente ? "Editar Lançamento" : "Novo Lançamento"}
        </h1>
        <p className="text-sm text-cinza-medio">
          Fechamento diário: formas de pagamento contra canais próprios, com marketplaces separados.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Data da venda
          <input
            type="date"
            value={dataISO}
            disabled
            className="w-full rounded-md border border-cinza-claro bg-off-white px-3 py-2 text-base font-bold text-cinza opacity-80"
          />
        </label>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
            Formas de pagamento
          </div>
          <div className="flex flex-col gap-3">
            <CampoLinha label="Crédito" value={campos.credito} onChange={(v) => atualizarCampo("credito", v)} />
            <CampoLinha label="Débito" value={campos.debito} onChange={(v) => atualizarCampo("debito", v)} />
            <CampoLinha label="Pix" value={campos.pix} onChange={(v) => atualizarCampo("pix", v)} />
            <CampoLinha label="Dinheiro" value={campos.dinheiro} onChange={(v) => atualizarCampo("dinheiro", v)} />
            <CampoLinha
              label="Vale-alimentação"
              value={campos.valeAlimentacao}
              onChange={(v) => atualizarCampo("valeAlimentacao", v)}
            />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-cinza-claro pt-3">
            <span className="text-sm font-semibold text-cinza-medio">Total das formas de pagamento</span>
            <span className="font-display text-lg font-bold text-azul-noite">{brl(totalFormasPagamento)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">
            Canais próprios conciliados
          </div>
          <p className="mb-3 text-xs text-cinza-medio">
            Salão e Delivery próprio devem bater com o total das formas de pagamento.
          </p>
          <div className="flex flex-col gap-3">
            <CampoLinha label="Salão" value={campos.salao} onChange={(v) => atualizarCampo("salao", v)} />
            <CampoLinha
              label="Delivery próprio"
              value={campos.deliveryProprio}
              onChange={(v) => atualizarCampo("deliveryProprio", v)}
            />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-cinza-claro pt-3">
            <span className="text-sm font-semibold text-cinza-medio">Total dos canais próprios</span>
            <span className="font-display text-lg font-bold text-azul-noite">{brl(totalCanais)}</span>
          </div>
        </div>

        <div className="rounded-lg border border-cinza-claro bg-branco p-4">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Marketplaces</div>
          <p className="mb-3 text-xs text-cinza-medio">
            Entram no faturamento do dia, mas ficam fora da conciliação.
          </p>
          <div className="flex flex-col gap-3">
            <CampoLinha
              label="iFood"
              value={campos.ifood}
              onChange={(v) => atualizarCampo("ifood", v)}
              cor="#EA1D2C"
            />
            <CampoLinha
              label="99Food"
              value={campos.food99}
              onChange={(v) => atualizarCampo("food99", v)}
              cor="#FFDD00"
            />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-cinza-claro pt-3">
            <span className="text-sm font-semibold text-cinza-medio">Total dos marketplaces</span>
            <span className="font-display text-lg font-bold text-azul-noite">{brl(totalMarketplaces)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-azul-noite p-4 text-branco">
          <span className="text-sm font-semibold">Faturamento total do dia</span>
          <span className="font-display text-xl font-bold text-ambar">{brl(faturamentoTotal)}</span>
        </div>

        {jaExiste && (
          <div className="rounded-lg border border-ambar/60 bg-ambar/10 p-4 text-sm text-cinza">
            Já existe um lançamento pra essa data.{" "}
            {jaExiste.podeEditar ? (
              <a
                href={`/financeiro/consolidado/${jaExiste.idExistente}/editar`}
                className="font-semibold text-azul-noite underline"
              >
                Abrir esse lançamento pra editar
              </a>
            ) : (
              "Peça pro gestor editar esse lançamento."
            )}
          </div>
        )}

        {erro && <p className="text-sm text-vermelho">{erro}</p>}

        <button
          type="submit"
          disabled={isPending || !!jaExiste}
          className="w-full rounded-lg bg-ambar px-4 py-3.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </form>

      {divergencia && (
        <AvisoDivergenciaModal
          totais={divergencia}
          pending={isPending}
          onVoltar={() => setDivergencia(null)}
          onSalvarMesmoAssim={() => salvar(true)}
        />
      )}
    </div>
  );
}

function CampoLinha({
  label,
  value,
  onChange,
  cor,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  cor?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm text-cinza">
      <span className="flex items-center gap-2">
        {cor && <span className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ backgroundColor: cor }} />}
        {label}
      </span>
      <CampoNumero value={value} onChange={onChange} className="w-32" />
    </label>
  );
}
