"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { iniciarChecklistAction } from "@/app/(app)/garante/actions";
import type { LinhaAgenda } from "@/app/(app)/garante/dados";
import { DICA_GARANTE, estadoJanela, horaOperacao, percentual, situacaoNaTela, type DiaAgenda } from "@/lib/garante/regras";
import { DicaCalculo } from "@/components/dica-calculo";
import { ESTILO_SITUACAO } from "./estilos";

/** Data (AAAA-MM-DD) do prazo no fuso da operação, para só mostrar a data
 * junto da hora quando a janela passa para outro dia. */
function hojeDoPrazo(prazo: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(prazo));
}

export function CartaoAgenda({
  linha,
  gestao,
  dia = "hoje",
}: {
  linha: LinhaAgenda;
  gestao: boolean;
  /** "ontem" = fechamento que passou da meia-noite, ainda dá para concluir.
   * "amanha" = antecedência que abriu antes da meia-noite, já dá para começar. */
  dia?: DiaAgenda;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const agora = new Date();
  const situacao = situacaoNaTela(linha.situacao, linha.prazo, agora);
  // Mesma janela das RPCs: começa a partir de abreEm; mexe até fechaEm.
  const janela = estadoJanela(linha.abreEm, linha.fechaEm, agora);
  const estilo = ESTILO_SITUACAO[situacao];
  const pct = percentual(linha.respondidos, linha.totalItens);

  function abrir() {
    setErro(null);
    if (linha.execucaoId) {
      router.push(`/garante/execucao/${linha.execucaoId}`);
      return;
    }
    startTransition(async () => {
      const r = await iniciarChecklistAction(linha.publicacaoId, dia);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      router.push(`/garante/execucao/${r.execucaoId}`);
    });
  }

  // Gestão pode abrir qualquer um (o banco confere); operacional, só o dele.
  const podeAbrir = (gestao || linha.ehMinha || linha.execucaoId !== null) && (linha.execucaoId !== null || janela === "aberta");
  const rotulo = linha.situacao === "concluida" ? "Ver" : linha.execucaoId ? "Continuar" : "Começar";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-azul-noite">{linha.modeloNome}</p>
          <p className="text-xs text-cinza-medio">
            até {linha.horarioLimite}
            {linha.setorNome && ` · ${linha.setorNome}`}
            {` · ${linha.responsavelNome ?? (linha.responsavelId ? "responsável" : "qualquer pessoa da unidade")}`}
          </p>
          {linha.situacao !== "concluida" && (
            <p className="flex items-center gap-1 text-xs text-cinza-medio">
              {janela === "antes"
                ? `abre às ${horaOperacao(linha.abreEm, hojeDoPrazo(linha.prazo))}`
                : janela === "aberta"
                  ? `aceita até ${horaOperacao(linha.fechaEm, hojeDoPrazo(linha.prazo))}`
                  : "tolerância de atraso encerrada"}
              <DicaCalculo rotulo="janela do checklist" texto={DICA_GARANTE.janela} />
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${estilo.classe}`}>{estilo.texto}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-cinza-claro">
        <div className="h-full bg-azul-petroleo" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-cinza-medio">
        <span className="flex flex-wrap items-center gap-1">
          {linha.respondidos} de {linha.totalItens} itens feitos ({pct}%)
          <DicaCalculo rotulo="itens feitos" texto={DICA_GARANTE.progresso} />
          {linha.foraDaMeta > 0 && (
            <>
              <span className="font-semibold text-vermelho">· {linha.foraDaMeta} fora da meta</span>
              <DicaCalculo rotulo="fora da meta" texto={DICA_GARANTE.foraDaMeta} />
            </>
          )}
        </span>
        {podeAbrir && (
          <button
            type="button"
            onClick={abrir}
            disabled={pendente}
            className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
          >
            {pendente ? "Abrindo..." : rotulo}
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-vermelho">{erro}</p>}
    </div>
  );
}
