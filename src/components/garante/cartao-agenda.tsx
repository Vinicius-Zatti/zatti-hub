"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { iniciarChecklistAction } from "@/app/(app)/garante/actions";
import type { LinhaAgenda } from "@/app/(app)/garante/dados";
import { percentual, situacaoNaTela } from "@/lib/garante/regras";
import { ESTILO_SITUACAO } from "./estilos";


export function CartaoAgenda({ linha, gestao }: { linha: LinhaAgenda; gestao: boolean }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const situacao = situacaoNaTela(linha.situacao, linha.prazo, new Date());
  const estilo = ESTILO_SITUACAO[situacao];
  const pct = percentual(linha.respondidos, linha.totalItens);

  function abrir() {
    setErro(null);
    if (linha.execucaoId) {
      router.push(`/garante/execucao/${linha.execucaoId}`);
      return;
    }
    startTransition(async () => {
      const r = await iniciarChecklistAction(linha.publicacaoId);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      router.push(`/garante/execucao/${r.execucaoId}`);
    });
  }

  // Gestão pode abrir qualquer um (o banco confere); operacional, só o dele.
  const podeAbrir = gestao || linha.ehMinha || linha.execucaoId !== null;
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
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${estilo.classe}`}>{estilo.texto}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-cinza-claro">
        <div className="h-full bg-azul-petroleo" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-cinza-medio">
        <span>
          {linha.respondidos} de {linha.totalItens} itens
          {linha.foraDaMeta > 0 && <span className="ml-1 font-semibold text-vermelho">· {linha.foraDaMeta} fora da meta</span>}
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
