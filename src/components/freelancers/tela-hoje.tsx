"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { adicionarManualAction } from "@/app/(app)/freelancers/actions";
import { formatarWhatsapp, resumoDoDia, type Checkin, type Freelancer } from "@/lib/freelancers/regras";
import { ResumoFreelancers } from "./resumo";
import { TabelaCheckins } from "./tabela-checkins";

/** Tela Hoje: números do dia, lançar diária à mão e a lista para conferir. */
export function TelaHoje({
  checkins,
  freelancers,
  diariaPadrao,
  hoje,
  podeEditar,
}: {
  checkins: Checkin[];
  freelancers: Freelancer[];
  diariaPadrao: number | null;
  hoje: string;
  podeEditar: boolean;
}) {
  const [manual, setManual] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <ResumoFreelancers resumo={resumoDoDia(checkins)} periodo="hoje" />
      {podeEditar && (
        <button
          type="button"
          onClick={() => setManual(true)}
          data-tour="freela-manual"
          className="self-start rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm font-semibold text-azul-noite"
        >
          Esqueceu do QR? Lançar a diária à mão
        </button>
      )}
      <TabelaCheckins checkins={checkins} diariaPadrao={diariaPadrao} podeEditar={podeEditar} />
      {manual && <ModalManual freelancers={freelancers} hoje={hoje} onFechar={() => setManual(false)} />}
    </div>
  );
}

function ModalManual({ freelancers, hoje, onFechar }: { freelancers: Freelancer[]; hoje: string; onFechar: () => void }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [freelancerId, setFreelancerId] = useState("");
  const [dia, setDia] = useState(hoje);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = freelancers
    .filter((f) => f.situacao !== "inativo")
    .map((f) => ({ id: f.id, label: `${f.nome}${f.funcao ? ` (${f.funcao})` : ""} - ${formatarWhatsapp(f.whatsapp)}` }));

  return (
    <ModalFlutuante aberto onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-bold text-azul-noite">Lançar diária à mão</h2>
        <p className="text-sm text-cinza">
          Para quem trabalhou e esqueceu do QR Code. A diária entra aguardando conferência, igual ao check-in. Quem não está na lista precisa ser cadastrado
          antes em Cadastro.
        </p>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          Freelancer
          <SeletorComBusca value={freelancerId} opcoes={opcoes} onChange={setFreelancerId} placeholder="Escolha quem trabalhou" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          Dia trabalhado
          <input
            type="date"
            value={dia}
            max={hoje}
            onChange={(e) => setDia(e.target.value)}
            className="max-w-[200px] rounded-md border border-cinza-claro bg-branco px-3 py-2 text-base font-normal sm:text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pendente || !freelancerId || !dia}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await adicionarManualAction(freelancerId, dia);
              if ("erro" in r) setErro(r.erro);
              else {
                onFechar();
                router.refresh();
              }
            })
          }
          className="rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco disabled:opacity-60"
        >
          {pendente ? "Lançando..." : "Lançar a diária para conferir"}
        </button>
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button type="button" onClick={onFechar} className="self-end text-sm font-semibold text-cinza underline">
          Fechar sem lançar
        </button>
      </div>
    </ModalFlutuante>
  );
}
