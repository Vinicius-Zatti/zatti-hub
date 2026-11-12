"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { definirDestinatarioAction } from "@/app/(app)/avaliacoes/actions";
import type { CandidatoAlerta, DestinatarioAtual } from "@/lib/avaliacoes/servidor";

const BOTAO_SECUNDARIO = "rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40";
const BOTAO_PARAR = "rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho hover:bg-vermelho/10 disabled:opacity-40";

/** Quem recebe o alerta de nota baixa. Mesmo desenho do responsável pelos avisos do Garante
 * (`components/garante/responsavel-avisos.tsx`): botões "Definir/Trocar" e "Parar", modal com a
 * lista curta da Equipe (select nativo basta). O banco confere tudo de novo. */
export function DestinatarioAlerta({
  unidadeNome,
  atual,
  candidatos,
  podeEditar,
}: {
  unidadeNome: string;
  atual: DestinatarioAtual | null;
  candidatos: CandidatoAlerta[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [janela, setJanela] = useState<"trocar" | "parar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState("");
  const nomeEscolhido = candidatos.find((c) => c.vinculoId === escolhido)?.nome ?? null;

  function rodar(vinculoId: string | null) {
    setErro(null);
    startTransition(async () => {
      const r = await definirDestinatarioAction(vinculoId);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setJanela(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-semibold text-azul-noite">Quem recebe: </span>
        {atual ? (
          <>
            {atual.nome}
            {atual.whatsappFinal ? <span className="text-cinza-medio"> · WhatsApp final {atual.whatsappFinal}</span> : null}
            {atual.motivo === "sem_acesso" && <span className="ml-2 rounded-full bg-vermelho/10 px-2 py-0.5 text-xs font-semibold text-vermelho">sem acesso</span>}
            {atual.motivo === "sem_whatsapp" && <span className="ml-2 rounded-full bg-ambar/15 px-2 py-0.5 text-xs font-semibold text-ambar">sem WhatsApp</span>}
          </>
        ) : (
          <span className="text-cinza-medio">Ninguém ainda (nota baixa não vira alerta)</span>
        )}
      </p>
      {podeEditar && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setErro(null);
              setEscolhido(atual && candidatos.some((c) => c.vinculoId === atual.vinculoId && c.whatsappFinal) ? atual.vinculoId : "");
              setJanela("trocar");
            }}
            className={BOTAO_SECUNDARIO}
          >
            {atual ? "Trocar quem recebe" : "Escolher quem recebe"}
          </button>
          {atual && (
            <button type="button" onClick={() => setJanela("parar")} className={BOTAO_PARAR}>
              Parar os alertas
            </button>
          )}
        </div>
      )}

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela === "trocar" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (escolhido) rodar(escolhido);
            }}
            className="flex flex-col gap-3"
          >
            <h2 className="font-display text-lg font-bold text-azul-noite">Quem recebe os alertas de nota baixa da {unidadeNome}?</h2>
            <p className="text-sm text-cinza">
              Essa pessoa recebe no WhatsApp, pelo Vini, cada avaliação com atendimento ou comida até 2, ou nota de indicação até 6. Só gente da Equipe com WhatsApp
              cadastrado.
            </p>
            {candidatos.length === 0 ? (
              <p className="text-sm text-vermelho">Ninguém da Equipe com acesso a esta unidade. Cadastre em Equipe antes.</p>
            ) : (
              <label className="text-xs font-semibold text-cinza-medio">
                Pessoa
                <select required value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className="mt-1 w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm">
                  <option value="">Escolha...</option>
                  {candidatos.map((c) => (
                    <option key={c.vinculoId} value={c.vinculoId} disabled={!c.whatsappFinal}>
                      {c.nome} · {c.papel === "gestao" ? "Gestão" : "Operação"} · {c.alcance}
                      {c.whatsappFinal ? ` · WhatsApp final ${c.whatsappFinal}` : " · sem WhatsApp cadastrado"}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={pendente || !escolhido} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
                {pendente ? "Salvando..." : nomeEscolhido ? `Mandar os alertas para ${nomeEscolhido}` : "Mandar os alertas para essa pessoa"}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </form>
        )}
        {janela === "parar" && atual && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Parar os alertas da {unidadeNome}?</h2>
            <p className="text-sm text-cinza">
              {atual.nome} deixa de receber. Avaliação com nota baixa que chegar sem ninguém marcado não vira alerta depois; ela continua no painel.
            </p>
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={pendente} onClick={() => rodar(null)} className="rounded-md bg-vermelho px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
                {pendente ? "Salvando..." : `Parar os alertas da ${unidadeNome}`}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </div>
  );
}
