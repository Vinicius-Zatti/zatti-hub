"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { salvarConfiguracaoAction } from "@/app/(app)/freelancers/actions";
import type { ConfiguracaoFreela } from "@/lib/freelancers/servidor";

export function ConfigurarFreelancers({ configuracao, contas }: { configuracao: ConfiguracaoFreela; contas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [diaria, setDiaria] = useState<number | null>(configuracao.diariaPadrao);
  const [conta, setConta] = useState(configuracao.contaCaixaId ?? "");
  const [ativa, setAtiva] = useState(configuracao.ativa);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  return (
    <form
      className="flex max-w-xl flex-col gap-5 rounded-lg border border-cinza-claro bg-branco p-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setMensagem(null);
          const r = await salvarConfiguracaoAction({ diariaPadrao: diaria, contaCaixaId: conta || null, ativa });
          setMensagem("erro" in r ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: "Salvo. Vale a partir da próxima conferência." });
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
        Diária padrão (R$)
        <CampoNumero value={diaria} onChange={setDiaria} className="max-w-[200px]" />
        <span className="text-xs font-normal text-cinza-medio">
          Valor sugerido na conferência para quem não tem diária combinada no cadastro. O gerente pode mudar na hora de conferir.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
        Conta do caixa que paga a diária
        <select
          value={conta}
          onChange={(e) => setConta(e.target.value)}
          className="max-w-sm rounded-md border border-cinza-claro bg-branco px-3 py-2 text-base font-normal sm:text-sm"
        >
          <option value="">{contas.length === 1 ? `A única conta de caixa (${contas[0].nome})` : "Nenhuma escolhida"}</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-cinza-medio">
          {contas.length === 0
            ? "Esta unidade não tem conta de caixa no Financeiro. Sem ela, a diária paga pelo caixa fica conferida e o título espera a conta ser criada."
            : "Quando o gerente marca que o caixa pagou, o título nasce quitado saindo desta conta."}
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm text-azul-noite">
        <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} className="mt-1 h-4 w-4" />
        <span className="font-semibold">
          Check-in pelo QR aberto
          <span className="block text-xs font-normal text-cinza-medio">Desmarcado, quem ler o QR vê um aviso e o check-in não grava. A conferência continua.</span>
        </span>
      </label>

      <button type="submit" disabled={pendente} className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
        {pendente ? "Salvando..." : "Salvar a configuração"}
      </button>
      {mensagem && <p className={`text-sm ${mensagem.tipo === "ok" ? "text-verde" : "text-vermelho"}`}>{mensagem.texto}</p>}
    </form>
  );
}
