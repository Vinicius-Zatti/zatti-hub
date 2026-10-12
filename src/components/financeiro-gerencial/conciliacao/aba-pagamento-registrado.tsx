"use client";

import { useEffect, useState } from "react";
import { listarBaixasCandidatasAction } from "@/app/(app)/financeiro-gerencial/conciliacao/decisoes-actions";
import { DicaCalculo } from "@/components/dica-calculo";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { paraCentavos } from "@/lib/conciliacao/decisao-tela";
import type { BaixaCandidata } from "@/lib/banco/conciliacao-decisoes";
import type { ItemFila } from "@/lib/banco/conciliacao";
import { brl, brlCentavos, MensagemErro, useEnvioDecisao } from "./comum";

const EXPLICACAO = "Diferença = valor do extrato - soma das baixas marcadas. Só liga quando a diferença é zero.";

/** Aba "Pagamento já registrado": liga o extrato a baixas lançadas à mão antes da importação. */
export function AbaPagamentoRegistrado({ movimento, aoConcluir }: { movimento: ItemFila; aoConcluir: (t: string) => void }) {
  const [baixas, setBaixas] = useState<BaixaCandidata[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);

  useEffect(() => {
    let ativo = true;
    listarBaixasCandidatasAction(movimento.id)
      .then((r) => {
        if (!ativo) return;
        if (r.ok) setBaixas(r.itens);
        else setFalha(r.mensagem);
      })
      .catch(() => ativo && setFalha("Não foi possível buscar pagamentos já registrados."));
    return () => {
      ativo = false;
    };
  }, [movimento.id]);

  const extrato = paraCentavos(movimento.valor);
  const soma = (baixas ?? []).filter((b) => marcadas.has(b.baixaId)).reduce((a, b) => a + paraCentavos(b.valor), 0);
  const diferenca = extrato - soma;

  function alternar(id: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-cinza-medio">
        Use quando o {movimento.direcao === "saida" ? "pagamento" : "recebimento"} já foi registrado à mão no financeiro, nesta conta, até 5 dias antes ou depois.
        Nada novo é lançado: o extrato só fica ligado à baixa existente.
      </p>
      {baixas === null && !falha && <p className="text-cinza-medio">Buscando...</p>}
      {falha && <p className="text-vermelho">{falha}</p>}
      {baixas?.length === 0 && <p className="text-cinza-medio">Nenhum pagamento registrado correspondente.</p>}
      {baixas && baixas.length > 0 && (
        <ul className="flex max-h-[40vh] flex-col gap-2 overflow-auto">
          {baixas.map((b) => (
            <li key={b.baixaId} className={`rounded-md border p-2 ${marcadas.has(b.baixaId) ? "border-azul-petroleo bg-azul-petroleo/5" : "border-cinza-claro"}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={marcadas.has(b.baixaId)} disabled={pendente} onChange={() => alternar(b.baixaId)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" title={b.descricao}>{b.descricao}</span>
                  <span className="block text-xs text-cinza-medio">Baixa em {formatarDataBr(b.data)} · {brl(b.valor)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-cinza-claro/40 p-2">
        <span>Extrato <strong>{brlCentavos(extrato)}</strong></span>
        <span>|</span>
        <span>Selecionado <strong>{brlCentavos(soma)}</strong></span>
        <span>|</span>
        <span className={diferenca === 0 ? "text-verde" : "text-vermelho"}>Diferença <strong>{brlCentavos(diferenca)}</strong></span>
        <DicaCalculo texto={EXPLICACAO} rotulo="Diferença" />
      </div>
      <MensagemErro texto={erro} />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pendente || marcadas.size === 0 || diferenca !== 0}
          onClick={() => enviar([{ movimentoId: movimento.id, acao: "vincular_baixas", baixaIds: Array.from(marcadas) }], "Extrato ligado ao pagamento já registrado.")}
          className="rounded-md bg-ambar px-3 py-1.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {pendente ? "Gravando..." : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
