"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  criarReversaoProvisaoAction,
  excluirReversaoProvisaoAction,
  salvarParametrosProvisaoAction,
} from "@/app/(app)/financeiro-gerencial/provisoes/actions";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { anosSelecionaveis, CartaoIndicador, formatarNumero, TabelaAnualBloco } from "@/components/financeiro-gerencial/tabela-anual";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { LinhaDreAnual } from "@/lib/financeiro-gerencial/dre-anual";
import { PARAMETROS_PADRAO_PLANILHA, ROTULO_TIPO_PROVISAO, TIPOS_PROVISAO } from "@/lib/financeiro-gerencial/provisoes";
import type { ParametrosProvisao, ParametrosProvisaoRegistro, ReversaoProvisao, TipoProvisao } from "@/lib/financeiro-gerencial/tipos";

const CAMPOS_PARAMETRO: { chave: keyof ParametrosProvisao; rotulo: string; ajuda: string }[] = [
  { chave: "percentualFerias", rotulo: "Férias (% da folha)", ajuda: "Planilha: folha / 12" },
  { chave: "percentualAdicionalTerco", rotulo: "Adicional de 1/3 (% das férias)", ajuda: "Planilha: férias / 3" },
  { chave: "percentualEncargosFerias", rotulo: "Encargos sobre férias (% de INSS + FGTS)", ajuda: "Planilha: (INSS + FGTS) / 12" },
  { chave: "percentualDecimoTerceiro", rotulo: "13º salário (% da folha)", ajuda: "Planilha: folha / 12" },
  { chave: "percentualEncargosDecimoTerceiro", rotulo: "Encargos sobre 13º (% de INSS + FGTS)", ajuda: "Planilha: (INSS + FGTS) / 12" },
  { chave: "percentualMultaFgts", rotulo: "Multa do FGTS (% do FGTS)", ajuda: "Planilha: FGTS / 2" },
];

function formatarPct(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}

function rotuloCompetencia(c: string): string {
  const [ano, mes] = c.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

const inputClasse = "w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza";
const rotuloClasse = "flex flex-col gap-1 text-sm font-semibold text-cinza-medio";

function BotoesFormulario({ pendente, onCancelar, rotulo }: { pendente: boolean; onCancelar: () => void; rotulo: string }) {
  return (
    <div className="mt-1 flex gap-2">
      <button type="submit" disabled={pendente} className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50">
        {pendente ? "Salvando..." : rotulo}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        disabled={pendente}
        className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
      >
        Cancelar
      </button>
    </div>
  );
}

function FormularioParametros({ atuais, competenciaAtual, onFechar }: { atuais: ParametrosProvisao; competenciaAtual: string; onFechar: () => void }) {
  const router = useRouter();
  const [vigenteDesde, setVigenteDesde] = useState(competenciaAtual);
  const [valores, setValores] = useState<Record<keyof ParametrosProvisao, number | null>>({ ...atuais });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const entrada = Object.fromEntries(CAMPOS_PARAMETRO.map((c) => [c.chave, valores[c.chave] ?? 0]));
      const resultado = await salvarParametrosProvisaoAction({ vigenteDesde, ...entrada });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Alterar parâmetros de provisão</h2>
      <p className="text-xs text-cinza-medio">Vale a partir do mês escolhido. Os meses anteriores continuam com o parâmetro que valia na época (histórico).</p>
      <label className={rotuloClasse}>
        Vigente a partir de
        <input type="month" required value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)} className={inputClasse} />
      </label>
      {CAMPOS_PARAMETRO.map((c) => (
        <label key={c.chave} className={rotuloClasse}>
          {c.rotulo}
          <CampoNumero value={valores[c.chave]} onChange={(v) => setValores((a) => ({ ...a, [c.chave]: v }))} className="w-full" />
          <span className="text-xs font-normal">{c.ajuda}</span>
        </label>
      ))}
      <button
        type="button"
        onClick={() => setValores({ ...PARAMETROS_PADRAO_PLANILHA })}
        className="self-start text-xs font-semibold text-azul-petroleo underline"
      >
        Voltar ao padrão da planilha
      </button>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <BotoesFormulario pendente={pendente} onCancelar={onFechar} rotulo="Salvar parâmetros" />
    </form>
  );
}

function FormularioReversao({ competenciaAtual, saldos, onFechar }: { competenciaAtual: string; saldos: Record<TipoProvisao, number>; onFechar: () => void }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoProvisao>("ferias");
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [valor, setValor] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarReversaoProvisaoAction({ tipo, competencia, valor: valor ?? 0, motivo });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onFechar();
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Reverter saldo de provisão</h2>
      <p className="text-xs text-cinza-medio">Use quando sobrou provisão que não vai ser paga. Reduz o saldo e entra negativo na DRE do mês escolhido.</p>
      <label className={rotuloClasse}>
        Provisão
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoProvisao)} className={inputClasse}>
          {TIPOS_PROVISAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_PROVISAO[t]} - saldo hoje R$ {formatarNumero(saldos[t])}
            </option>
          ))}
        </select>
      </label>
      <label className={rotuloClasse}>
        Mês de competência
        <input type="month" required value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={inputClasse} />
      </label>
      <label className={rotuloClasse}>
        Valor
        <CampoNumero value={valor} onChange={setValor} className="w-full" />
      </label>
      <label className={rotuloClasse}>
        Motivo
        <input required minLength={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputClasse} />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <BotoesFormulario pendente={pendente} onCancelar={onFechar} rotulo="Reverter" />
    </form>
  );
}

export function ProvisoesVisualizacao({
  ano,
  linhas,
  parametrosAtuais,
  historicoParametros,
  reversoes,
  saldosAtuais,
  competenciaAtual,
}: {
  ano: number;
  linhas: LinhaDreAnual[];
  parametrosAtuais: ParametrosProvisao;
  historicoParametros: ParametrosProvisaoRegistro[];
  reversoes: ReversaoProvisao[];
  saldosAtuais: Record<TipoProvisao, number>;
  competenciaAtual: string;
}) {
  const router = useRouter();
  const [editandoParametros, setEditandoParametros] = useState(false);
  const [revertendo, setRevertendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function excluirReversao(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirReversaoProvisaoAction({ id });
      if (!resultado.ok) setErro(resultado.mensagem);
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Provisões trabalhistas - {ano}</h1>
          <p className="text-sm text-cinza-medio">
            Calculadas todo mês sobre Folha salarial contábil, FGTS e INSS folha lançados. Entram na DRE (CMO) por competência e não mexem no caixa.
          </p>
        </div>
        <select
          value={ano}
          onChange={(e) => router.push(`/financeiro-gerencial/provisoes?ano=${e.target.value}`)}
          className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm text-cinza"
        >
          {anosSelecionaveis().map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TIPOS_PROVISAO.map((t) => (
          <CartaoIndicador key={t} titulo={`Saldo hoje - ${ROTULO_TIPO_PROVISAO[t]}`} valor={formatarNumero(saldosAtuais[t])} />
        ))}
      </div>

      <div className="rounded-lg border border-cinza-claro bg-off-white p-3 text-sm text-cinza">
        Pagou a guia de férias, 13º ou multa do FGTS? Lance em{" "}
        <Link href="/financeiro-gerencial/lancamentos/despesas" className="font-semibold text-azul-petroleo underline">
          Despesas
        </Link>{" "}
        escolhendo a conta com &quot;(liquidação de provisão)&quot;. Ela entra no caixa e baixa o saldo daqui, sem duplicar a DRE. Se a guia passar do saldo, só a diferença vai pra DRE.
      </div>

      <TabelaAnualBloco titulo="Movimento das provisões" ariaLabel="Tabela das provisões trabalhistas" rotuloPrimeiraColuna="Mês de Competência" linhas={linhas} />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-azul-noite">Parâmetros</h2>
          <button type="button" onClick={() => setEditandoParametros(true)} className="rounded-lg bg-azul-noite px-4 py-2 text-sm font-bold text-branco">
            Alterar parâmetros
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {CAMPOS_PARAMETRO.map((c) => (
            <div key={c.chave} className="rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm">
              <div className="text-xs text-cinza-medio">{c.rotulo}</div>
              <div className="font-mono font-semibold text-azul-noite">{formatarPct(parametrosAtuais[c.chave])}</div>
            </div>
          ))}
        </div>
        {historicoParametros.length === 0 ? (
          <p className="text-xs text-cinza-medio">Nenhuma alteração ainda - valendo o padrão da planilha Financeiro Zatti.</p>
        ) : (
          <TabelaRolavel ariaLabel="Histórico de parâmetros">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="90px">Vigente desde</Th>
                  {CAMPOS_PARAMETRO.map((c) => (
                    <Th key={c.chave} align="right">
                      {c.rotulo}
                    </Th>
                  ))}
                  <Th>Alterado por</Th>
                </tr>
              </thead>
              <tbody>
                {historicoParametros.map((h) => (
                  <tr key={h.id} className="border-t border-cinza-claro">
                    <td className="whitespace-nowrap px-3 py-1.5">{rotuloCompetencia(h.vigenteDesde)}</td>
                    {CAMPOS_PARAMETRO.map((c) => (
                      <td key={c.chave} className="whitespace-nowrap px-3 py-1.5 text-right font-mono">
                        {formatarPct(h[c.chave])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {h.criadoPorNome} em {formatarDataBr(h.criadoEm.slice(0, 10))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-azul-noite">Reversões</h2>
          <button type="button" onClick={() => setRevertendo(true)} className="rounded-lg border border-azul-petroleo px-4 py-2 text-sm font-bold text-azul-petroleo">
            Reverter saldo
          </button>
        </div>
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        {reversoes.length === 0 ? (
          <p className="text-xs text-cinza-medio">Nenhuma reversão registrada.</p>
        ) : (
          <TabelaRolavel ariaLabel="Reversões de provisão">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="90px">Competência</Th>
                  <Th>Provisão</Th>
                  <Th align="right">Valor</Th>
                  <Th>Motivo</Th>
                  <Th>Registrado por</Th>
                  <Th larguraFixa="60px">Ação</Th>
                </tr>
              </thead>
              <tbody>
                {reversoes.map((r) => (
                  <tr key={r.id} className="border-t border-cinza-claro">
                    <td className="whitespace-nowrap px-3 py-1.5">{rotuloCompetencia(r.competencia)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{ROTULO_TIPO_PROVISAO[r.tipo]}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono">{formatarNumero(r.valor)}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5" title={r.motivo}>
                      {r.motivo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">{r.criadoPorNome}</td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => excluirReversao(r.id)}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-vermelho hover:bg-vermelho/10 disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        )}
      </div>

      <ModalFlutuante aberto={editandoParametros} onFechar={() => setEditandoParametros(false)}>
        {editandoParametros && <FormularioParametros atuais={parametrosAtuais} competenciaAtual={competenciaAtual} onFechar={() => setEditandoParametros(false)} />}
      </ModalFlutuante>
      <ModalFlutuante aberto={revertendo} onFechar={() => setRevertendo(false)}>
        {revertendo && <FormularioReversao competenciaAtual={competenciaAtual} saldos={saldosAtuais} onFechar={() => setRevertendo(false)} />}
      </ModalFlutuante>
    </div>
  );
}
