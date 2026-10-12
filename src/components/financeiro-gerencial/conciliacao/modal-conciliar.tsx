"use client";

import { useState } from "react";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import type { ItemFila } from "@/lib/banco/conciliacao";
import { AbaContasAbertas } from "./aba-contas-abertas";
import { AbaNovaNota } from "./aba-nova-nota";
import { AbaPagamentoRegistrado } from "./aba-pagamento-registrado";
import { AbaTransferencia } from "./aba-transferencia";
import { brl, MensagemErro, useEnvioDecisao, type ContextoDecisao } from "./comum";

type Aba = "contas" | "nota" | "registrado" | "transferencia" | "ignorar";

const ABAS: [Aba, string][] = [
  ["contas", "Sugestão / Contas em aberto"],
  ["nota", "Nova nota"],
  ["registrado", "Pagamento já registrado"],
  ["transferencia", "Transferência"],
];

/** Conteúdo do ModalFlutuante "Conciliar" de um movimento da fila. */
export function ConciliarMovimento({
  movimento,
  contexto,
  aoConcluir,
  onFechar,
}: {
  movimento: ItemFila;
  contexto: ContextoDecisao;
  aoConcluir: (texto: string) => void;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<Aba>("contas");
  const saida = movimento.direcao === "saida";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-azul-noite">Conciliar</h2>
          <p className="text-sm">
            {formatarDataBr(movimento.data)} · <span className={saida ? "text-vermelho" : "text-verde"}>{saida ? "Saída" : "Entrada"} de {brl(movimento.valor)}</span>
          </p>
          <p className="truncate text-sm text-cinza-medio" title={movimento.descricaoOriginal}>{movimento.descricaoOriginal}</p>
        </div>
        <button type="button" onClick={onFechar} className="rounded-md px-2 py-1 text-sm text-cinza-medio" aria-label="Fechar">
          Fechar
        </button>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b border-cinza-claro pb-2 text-xs">
        {ABAS.map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={`rounded-full border px-2.5 py-1 ${aba === valor ? "border-azul-petroleo bg-azul-petroleo text-branco" : "border-cinza-claro text-azul-noite"}`}
          >
            {rotulo}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAba("ignorar")}
          className={`ml-auto rounded-full border px-2.5 py-1 ${aba === "ignorar" ? "border-vermelho bg-vermelho text-branco" : "border-vermelho text-vermelho"}`}
        >
          Ignorar
        </button>
      </div>

      {aba === "contas" && <AbaContasAbertas movimento={movimento} contexto={contexto} aoConcluir={aoConcluir} />}
      {aba === "nota" && <AbaNovaNota movimento={movimento} contexto={contexto} aoConcluir={aoConcluir} />}
      {aba === "registrado" && <AbaPagamentoRegistrado movimento={movimento} aoConcluir={aoConcluir} />}
      {aba === "transferencia" && <AbaTransferencia movimento={movimento} contexto={contexto} aoConcluir={aoConcluir} />}
      {aba === "ignorar" && <IgnorarMovimento movimento={movimento} aoConcluir={aoConcluir} />}
    </div>
  );
}

function IgnorarMovimento({ movimento, aoConcluir }: { movimento: ItemFila; aoConcluir: (t: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);
  const valido = motivo.trim().length >= 3;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-cinza-medio">O movimento sai da fila sem lançar nada no financeiro. Gestão/master pode desfazer em &quot;Conciliados&quot;.</p>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Motivo (obrigatório)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={3} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
      </label>
      {!valido && motivo.length > 0 && <p className="text-xs text-vermelho">Escreva pelo menos 3 caracteres.</p>}
      <MensagemErro texto={erro} />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pendente || !valido}
          onClick={() => enviar([{ movimentoId: movimento.id, acao: "ignorar", motivo: motivo.trim() }], "Movimento ignorado.")}
          className="rounded-md bg-vermelho px-3 py-1.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {pendente ? "Gravando..." : "Ignorar movimento"}
        </button>
      </div>
    </div>
  );
}
