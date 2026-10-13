"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirRegraAction, desmarcarDiaSemOperacaoAction, marcarDiaSemOperacaoAction } from "@/app/(app)/garante/actions";
import type { RegraUnidade } from "@/app/(app)/garante/dados";
import { textoAtraso, textoMinutos } from "@/lib/garante/regras";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";
const DICA_PRAZO_PLANO =
  "Prazo do plano de ação = hora da conclusão do checklist (ou do fim da janela, quando ele não foi concluído) + estas horas. Cada plano guarda o prazo com que nasceu: mudar aqui não muda plano já aberto.";
const DICA_JANELA =
  "Começar: a partir do horário limite menos a antecedência. Responder, tirar foto e concluir: até o fim do dia do checklist (23h59) ou, se a gestão definiu uma tolerância de atraso, até o horário limite mais a tolerância, nunca depois das 23h59 (checklist que termina de madrugada é programado com o horário do dia seguinte). Concluir depois do horário limite conta como atraso na Pontualidade (P) da nota. Cada checklist guarda a janela do dia em que começou.";

type Resultado = { ok: true } | { erro: string };
type Janela = { tipo: "regra" } | { tipo: "marcar" } | { tipo: "desmarcar"; data: string; motivo: string } | null;

/** Regras da unidade (gestão, em Modelos): antecedência, até quando concluir
 * (fim do dia, o padrão, ou uma tolerância de atraso em minutos) e prazo do plano de
 * ação (valem a partir de amanhã) e dias sem operação (só datas futuras). O banco
 * confere tudo de novo (`garante_definir_regra`, `garante_marcar_dia_sem_operacao`). */
export function RegrasUnidade({
  vigente,
  agendadas,
  diasSemOperacao,
  amanha,
}: {
  vigente: RegraUnidade;
  agendadas: RegraUnidade[];
  diasSemOperacao: { data: string; motivo: string }[];
  amanha: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [janela, setJanela] = useState<Janela>(null);
  const [erro, setErro] = useState<string | null>(null);
  const proxima = agendadas[agendadas.length - 1] ?? null;

  function abrir(j: Janela) {
    setErro(null);
    setJanela(j);
  }

  function rodar(acao: () => Promise<Resultado>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setJanela(null);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Regras da unidade</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4 text-sm">
          <p className="flex items-center gap-1 font-semibold text-azul-noite">
            Janela do checklist
            <DicaCalculo rotulo="janela do checklist" texto={DICA_JANELA} />
          </p>
          <p className="text-cinza">
            Abre {textoMinutos(vigente.antecedenciaMin)} antes do horário limite e aceita concluir {textoAtraso(vigente.atrasoMaxMin)}.
          </p>
          <p className="flex items-center gap-1 text-cinza">
            Plano de ação: prazo de {vigente.prazoPlanoHoras} h.
            <DicaCalculo rotulo="prazo do plano de ação" texto={DICA_PRAZO_PLANO} />
          </p>
          {proxima && (
            <p className="text-xs text-cinza-medio">
              A partir de {formatarDataBr(proxima.vigenteDesde as string)}: abre {textoMinutos(proxima.antecedenciaMin)} antes, aceita concluir{" "}
              {textoAtraso(proxima.atrasoMaxMin)} e o plano de ação tem {proxima.prazoPlanoHoras} h.
            </p>
          )}
          <button
            type="button"
            onClick={() => abrir({ tipo: "regra" })}
            className="self-start rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
          >
            Mudar a partir de amanhã
          </button>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4 text-sm">
          <p className="font-semibold text-azul-noite">Dias sem operação</p>
          {diasSemOperacao.length === 0 ? (
            <p className="text-xs text-cinza-medio">Nenhum dia marcado daqui para a frente.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {diasSemOperacao.map((d) => (
                <li key={d.data} className="flex items-center justify-between gap-2 border-b border-cinza-claro pb-1">
                  <span className="min-w-0 truncate" title={d.motivo}>
                    {formatarDataBr(d.data)} · {d.motivo}
                  </span>
                  {d.data >= amanha && (
                    <button type="button" onClick={() => abrir({ tipo: "desmarcar", ...d })} className="shrink-0 text-xs font-semibold text-azul-petroleo underline">
                      Voltar a operar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => abrir({ tipo: "marcar" })}
            className="self-start rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
          >
            Marcar dia sem operação
          </button>
        </div>
      </div>

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela?.tipo === "regra" && (
          <FormRegra
            inicial={proxima ?? vigente}
            amanha={amanha}
            erro={erro}
            pendente={pendente}
            aoSalvar={(dados) => rodar(() => definirRegraAction(dados))}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "marcar" && (
          <FormDia
            amanha={amanha}
            erro={erro}
            pendente={pendente}
            aoSalvar={(dados) => rodar(() => marcarDiaSemOperacaoAction(dados))}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "desmarcar" && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Voltar a operar em {formatarDataBr(janela.data)}?</h2>
            <p className="text-sm text-cinza">Os checklists programados para esse dia voltam para a lista de Hoje e passam a contar na nota.</p>
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => desmarcarDiaSemOperacaoAction(janela.data))}
                className="rounded-md bg-azul-noite px-3 py-2 text-xs font-semibold text-branco disabled:opacity-60"
              >
                {pendente ? "Salvando..." : `Voltar a operar em ${formatarDataBr(janela.data)}`}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </section>
  );
}

function FormRegra({
  inicial,
  amanha,
  erro,
  pendente,
  aoSalvar,
  aoCancelar,
}: {
  inicial: RegraUnidade;
  amanha: string;
  erro: string | null;
  pendente: boolean;
  aoSalvar: (dados: { antecedenciaMin: number | null; atrasoMaxMin: number | null; prazoPlanoHoras: number | null }) => void;
  aoCancelar: () => void;
}) {
  const [antecedencia, setAntecedencia] = useState<number | null>(inicial.antecedenciaMin);
  // Até quando concluir: o fim do dia (padrão, atraso nulo) ou uma tolerância em minutos.
  const [ateFimDoDia, setAteFimDoDia] = useState(inicial.atrasoMaxMin === null);
  const [atraso, setAtraso] = useState<number | null>(inicial.atrasoMaxMin);
  const [prazoPlano, setPrazoPlano] = useState<number | null>(inicial.prazoPlanoHoras);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErroLocal(null);
        // Modo tolerância com minutos em branco não pode virar "fim do dia" por engano (0 é válido).
        if (!ateFimDoDia && atraso === null) {
          setErroLocal("Informe os minutos de tolerância (0 a 1.440) ou escolha \"o fim do dia\".");
          return;
        }
        aoSalvar({ antecedenciaMin: antecedencia, atrasoMaxMin: ateFimDoDia ? null : atraso, prazoPlanoHoras: prazoPlano });
      }}
      className="flex flex-col gap-3"
    >
      <h2 className="font-display text-lg font-bold text-azul-noite">Janela do checklist e prazo do plano</h2>
      <label className={ROTULO}>
        Abre quantos minutos antes do horário limite (0 a 720)
        <CampoNumero value={antecedencia} onChange={setAntecedencia} decimais={0} className="mt-1 block w-full" />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className={ROTULO}>Aceita concluir até quando</legend>
        <label className="flex items-center gap-2 text-sm text-cinza">
          <input type="radio" name="ate" checked={ateFimDoDia} onChange={() => setAteFimDoDia(true)} />
          O fim do dia do checklist (23h59)
        </label>
        <label className="flex items-center gap-2 text-sm text-cinza">
          <input type="radio" name="ate" checked={!ateFimDoDia} onChange={() => setAteFimDoDia(false)} />
          Uma tolerância em minutos depois do horário limite (0 a 1.440), sem passar das 23h59
        </label>
        {!ateFimDoDia && (
          <CampoNumero value={atraso} onChange={setAtraso} decimais={0} className="mt-1 block w-full" />
        )}
      </fieldset>
      <label className={ROTULO}>
        <span className="inline-flex items-center gap-1">
          Prazo do plano de ação, em horas (1 a 168)
          <DicaCalculo rotulo="prazo do plano de ação" texto={DICA_PRAZO_PLANO} />
        </span>
        <CampoNumero value={prazoPlano} onChange={setPrazoPlano} decimais={0} className="mt-1 block w-full" />
      </label>
      <ul className="list-disc pl-5 text-xs text-cinza">
        <li>Vale para os checklists a partir de {formatarDataBr(amanha)}.</li>
        <li>Hoje e os dias que já passaram continuam com a regra que valia, e a nota deles não muda.</li>
        <li>Plano de ação já aberto mantém o prazo com que nasceu.</li>
      </ul>
      {(erro ?? erroLocal) && <p className="text-sm text-vermelho">{erro ?? erroLocal}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendente} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
          {pendente ? "Salvando..." : `Valer a partir de ${formatarDataBr(amanha)}`}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormDia({
  amanha,
  erro,
  pendente,
  aoSalvar,
  aoCancelar,
}: {
  amanha: string;
  erro: string | null;
  pendente: boolean;
  aoSalvar: (dados: { data: string; motivo: string }) => void;
  aoCancelar: () => void;
}) {
  const [data, setData] = useState(amanha);
  const [motivo, setMotivo] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoSalvar({ data, motivo });
      }}
      className="flex flex-col gap-3"
    >
      <h2 className="font-display text-lg font-bold text-azul-noite">Marcar dia sem operação</h2>
      <label className={ROTULO}>
        Data
        <input type="date" required min={amanha} value={data} onChange={(e) => setData(e.target.value)} className={CAMPO} />
      </label>
      <label className={ROTULO}>
        Motivo
        <input type="text" required minLength={3} maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: feriado, reforma" className={CAMPO} />
      </label>
      <ul className="list-disc pl-5 text-xs text-cinza">
        <li>Nesse dia nenhum checklist aparece na lista de Hoje e o dia não entra na nota.</li>
        <li>Só dá para marcar a partir de amanhã e em dia que ainda não tem checklist começado.</li>
      </ul>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendente} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
          {pendente ? "Salvando..." : data ? `Não operar em ${formatarDataBr(data)}` : "Não operar neste dia"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}
