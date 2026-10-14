"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { DicaCalculo } from "@/components/dica-calculo";
import { definirResponsavelAvisosAction } from "@/app/(app)/garante/actions";
import type { AvisosDaUnidade } from "@/app/(app)/garante/dados";
import { DICA_AVISOS, textoSituacaoAvisos, type CandidatoAvisos, type ResponsavelAvisosAtual } from "@/lib/garante/avisos";

type Resultado = { ok: true } | { erro: string };

const BOTAO_SECUNDARIO = "rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40";
const BOTAO_PARAR = "rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho hover:bg-vermelho/10 disabled:opacity-40";

/** Botões "Definir/Trocar responsável" e "Parar os avisos" com o modal de escolha. Usado pela
 * gestão (Regras da unidade) e pela Zatti (Acessos); quem chama passa a Server Action certa.
 * Lista curta (gestão da unidade), por isso o select nativo basta. O banco confere tudo de
 * novo (`garante_definir_responsavel_avisos`). */
export function ResponsavelAvisos({
  unidadeNome,
  atual,
  candidatos,
  aoDefinir,
}: {
  unidadeNome: string;
  atual: ResponsavelAvisosAtual | null;
  candidatos: CandidatoAvisos[];
  aoDefinir: (vinculoId: string | null) => Promise<Resultado>;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [janela, setJanela] = useState<"trocar" | "parar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string>("");
  const nomeEscolhido = candidatos.find((c) => c.vinculoId === escolhido)?.nome ?? null;

  function abrir(j: "trocar" | "parar") {
    setErro(null);
    setEscolhido(atual && candidatos.some((c) => c.vinculoId === atual.vinculoId && c.whatsappFinal) ? atual.vinculoId : "");
    setJanela(j);
  }

  function rodar(vinculoId: string | null) {
    setErro(null);
    startTransition(async () => {
      const r = await aoDefinir(vinculoId);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setJanela(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => abrir("trocar")} className={BOTAO_SECUNDARIO}>
          {atual ? "Trocar responsável" : "Definir responsável"}
        </button>
        {atual && (
          <button type="button" onClick={() => abrir("parar")} className={BOTAO_PARAR}>
            Parar os avisos
          </button>
        )}
      </div>

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela === "trocar" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (escolhido) rodar(escolhido);
            }}
            className="flex flex-col gap-3"
          >
            <h2 className="font-display text-lg font-bold text-azul-noite">Quem acompanha o Garante da {unidadeNome}?</h2>
            <p className="text-sm text-cinza">
              Essa pessoa recebe no WhatsApp, pelo Vini, os avisos de checklist atrasado, não concluído e item crítico fora da meta. Só gente da gestão com WhatsApp cadastrado.
            </p>
            {candidatos.length === 0 ? (
              <p className="text-sm text-vermelho">Nenhuma pessoa da gestão com acesso a esta unidade. Cadastre em Equipe antes.</p>
            ) : (
              <label className="text-xs font-semibold text-cinza-medio">
                Responsável
                <select
                  required
                  value={escolhido}
                  onChange={(e) => setEscolhido(e.target.value)}
                  className="mt-1 w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm"
                >
                  <option value="">Escolha...</option>
                  {candidatos.map((c) => (
                    <option key={c.vinculoId} value={c.vinculoId} disabled={!c.whatsappFinal}>
                      {c.nome} · {c.alcance}
                      {c.whatsappFinal ? ` · WhatsApp final ${c.whatsappFinal}` : " · sem WhatsApp cadastrado"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pendente || !escolhido} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
                {pendente ? "Salvando..." : nomeEscolhido ? `Mandar os avisos para ${nomeEscolhido}` : "Mandar os avisos para essa pessoa"}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </form>
        )}
        {janela === "parar" && atual && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Parar os avisos da {unidadeNome}?</h2>
            <p className="text-sm text-cinza">
              {atual.nome} deixa de receber. Ninguém recebe até você marcar outro responsável; o que já está esperando fica parado (aviso com mais de 7 dias expira).
            </p>
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={pendente} onClick={() => rodar(null)} className="rounded-md bg-vermelho px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
                {pendente ? "Salvando..." : `Parar os avisos da ${unidadeNome}`}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </>
  );
}

/** Texto do responsável atual, com o aviso de problema quando ele não serve mais. */
export function TextoResponsavelAvisos({ atual }: { atual: ResponsavelAvisosAtual | null }) {
  if (!atual) return <span className="text-cinza-medio">Ninguém ainda</span>;
  return (
    <span>
      {atual.nome}
      {atual.whatsappFinal ? <span className="text-cinza-medio"> · WhatsApp final {atual.whatsappFinal}</span> : null}
      {atual.motivo === "sem_acesso" && <span className="ml-2 rounded-full bg-vermelho/10 px-2 py-0.5 text-xs font-semibold text-vermelho">sem acesso</span>}
      {atual.motivo === "sem_whatsapp" && <span className="ml-2 rounded-full bg-ambar/15 px-2 py-0.5 text-xs font-semibold text-ambar">sem WhatsApp</span>}
    </span>
  );
}

/** Card "Avisos pelo WhatsApp" das Regras da unidade (gestão). */
export function CardAvisosGarante({ unidadeNome, avisos }: { unidadeNome: string; avisos: AvisosDaUnidade }) {
  const frases = textoSituacaoAvisos(avisos.situacao, avisos.atual !== null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4 text-sm">
      <p className="flex items-center gap-1 font-semibold text-azul-noite">
        Avisos pelo WhatsApp
        <DicaCalculo rotulo="avisos pelo WhatsApp" texto={DICA_AVISOS} />
      </p>
      <p className="text-cinza">
        Quem recebe: <TextoResponsavelAvisos atual={avisos.atual} />
      </p>
      <ul className="flex flex-col gap-0.5 text-xs text-cinza-medio">
        {frases.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <ResponsavelAvisos unidadeNome={unidadeNome} atual={avisos.atual} candidatos={avisos.candidatos} aoDefinir={definirResponsavelAvisosAction} />
    </div>
  );
}
