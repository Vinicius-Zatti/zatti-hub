"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { salvarEstoqueMensalAction } from "@/app/(app)/financeiro-gerencial/estoque/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import type { EstoqueMensal } from "@/lib/financeiro-gerencial/tipos";

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "2026-08-01" -> "Agosto/2026". Mês é a granularidade real do estoque
 * mensal (o dia guardado é sempre 1, convenção de armazenamento) - por isso
 * a exibição usa mês/ano por extenso em vez do padrão DD/MM/AAAA de data. */
function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${nomes[Number(mes) - 1]}/${ano}`;
}

function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** Controle manual mensal de estoque (Mercadorias/Embalagens) usado só pela
 * fórmula de CMV da DRE - Gestão/master cadastra e edita, Operacional só
 * consulta (`podeGerir` decide o botão, RLS `fin_estoque_mensal_*_gestao` é
 * a barreira real). Cadastro/edição sempre em `ModalFlutuante`, nunca
 * formulário aberto na página. */
export function EstoqueMensalGerenciador({ estoques, podeGerir }: { estoques: EstoqueMensal[]; podeGerir: boolean }) {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<EstoqueMensal | null>(null);
  const competenciasCadastradas = new Set(estoques.map((e) => e.competencia.slice(0, 7)));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Estoque mensal</h1>
          <p className="text-sm text-cinza-medio">
            Estoque inicial e final de Mercadorias e Embalagens, mês a mês - usado só pra calcular o CMV da DRE.
          </p>
        </div>
        {podeGerir && (
          <button
            type="button"
            onClick={() => setCriando(true)}
            className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
          >
            + Novo mês
          </button>
        )}
      </div>

      {estoques.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum estoque mensal cadastrado ainda{podeGerir ? " - a DRE fica com o CMV pendente até cadastrar o mês." : "."}
        </p>
      ) : (
        <TabelaRolavel ariaLabel="Tabela de estoque mensal">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="112px">Mês</Th>
                <Th align="right">Estoque inicial - Mercadorias</Th>
                <Th align="right">Estoque inicial - Embalagens</Th>
                <Th align="right">Estoque final - Mercadorias</Th>
                <Th align="right">Estoque final - Embalagens</Th>
                {podeGerir && (
                  <Th align="center" larguraFixa="72px">
                    Ação
                  </Th>
                )}
              </tr>
            </thead>
            <tbody>
              {estoques.map((estoque) => (
                <tr key={estoque.id} className="border-t border-cinza-claro">
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-cinza">{rotuloCompetencia(estoque.competencia)}</td>
                  <td className="px-3 py-2 text-right font-mono">{brl(estoque.estoqueInicialMercadorias)}</td>
                  <td className="px-3 py-2 text-right font-mono">{brl(estoque.estoqueInicialEmbalagens)}</td>
                  <td className="px-3 py-2 text-right font-mono">{brl(estoque.estoqueFinalMercadorias)}</td>
                  <td className="px-3 py-2 text-right font-mono">{brl(estoque.estoqueFinalEmbalagens)}</td>
                  {podeGerir && (
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setEditando(estoque)}
                        aria-label={`Editar estoque de ${rotuloCompetencia(estoque.competencia)}`}
                        className="rounded-md p-1.5 text-azul-petroleo hover:bg-azul-petroleo/10"
                      >
                        <IconeEditar />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}

      <ModalFlutuante aberto={criando} onFechar={() => setCriando(false)}>
        <FormularioEstoqueMensal
          competenciasCadastradas={competenciasCadastradas}
          onSalvo={() => setCriando(false)}
          onCancelar={() => setCriando(false)}
        />
      </ModalFlutuante>

      <ModalFlutuante aberto={editando !== null} onFechar={() => setEditando(null)}>
        {editando && (
          <FormularioEstoqueMensal estoque={editando} onSalvo={() => setEditando(null)} onCancelar={() => setEditando(null)} />
        )}
      </ModalFlutuante>
    </div>
  );
}

function IconeEditar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FormularioEstoqueMensal({
  estoque,
  competenciasCadastradas,
  onSalvo,
  onCancelar,
}: {
  estoque?: EstoqueMensal;
  competenciasCadastradas?: Set<string>;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [competencia, setCompetencia] = useState(estoque ? estoque.competencia.slice(0, 7) : competenciaAtual());
  const [estoqueInicialMercadorias, setEstoqueInicialMercadorias] = useState<number | null>(estoque?.estoqueInicialMercadorias ?? 0);
  const [estoqueInicialEmbalagens, setEstoqueInicialEmbalagens] = useState<number | null>(estoque?.estoqueInicialEmbalagens ?? 0);
  const [estoqueFinalMercadorias, setEstoqueFinalMercadorias] = useState<number | null>(estoque?.estoqueFinalMercadorias ?? 0);
  const [estoqueFinalEmbalagens, setEstoqueFinalEmbalagens] = useState<number | null>(estoque?.estoqueFinalEmbalagens ?? 0);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const jaCadastrado = !estoque && competenciasCadastradas?.has(competencia);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await salvarEstoqueMensalAction({
        competencia,
        estoqueInicialMercadorias: estoqueInicialMercadorias ?? 0,
        estoqueInicialEmbalagens: estoqueInicialEmbalagens ?? 0,
        estoqueFinalMercadorias: estoqueFinalMercadorias ?? 0,
        estoqueFinalEmbalagens: estoqueFinalEmbalagens ?? 0,
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
      <h2 className="font-display text-lg font-bold text-azul-noite">{estoque ? "Editar estoque mensal" : "Novo estoque mensal"}</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Mês
        <input
          required
          type="month"
          disabled={!!estoque}
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza disabled:bg-off-white"
        />
      </label>
      {jaCadastrado && (
        <p className="text-xs font-semibold text-ambar">
          Esse mês já tem estoque cadastrado - salvar aqui vai sobrescrever os valores existentes.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Estoque inicial - Mercadorias
          <CampoNumero value={estoqueInicialMercadorias} onChange={setEstoqueInicialMercadorias} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Estoque inicial - Embalagens
          <CampoNumero value={estoqueInicialEmbalagens} onChange={setEstoqueInicialEmbalagens} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Estoque final - Mercadorias
          <CampoNumero value={estoqueFinalMercadorias} onChange={setEstoqueFinalMercadorias} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Estoque final - Embalagens
          <CampoNumero value={estoqueFinalEmbalagens} onChange={setEstoqueFinalEmbalagens} className="w-full" />
        </label>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
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
