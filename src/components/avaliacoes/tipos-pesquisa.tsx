"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirOrigensAction } from "@/app/(app)/avaliacoes/actions";
import { DESCRICAO_ORIGEM, ORIGENS, ROTULO_ORIGEM, type Origem } from "@/lib/avaliacoes/perguntas";

/** Liga e desliga os três tipos de pesquisa (13/11/2026): salão, delivery próprio e apps de
 * entrega. Pelo menos um fica ligado; o banco confere de novo. */
export function TiposPesquisa({ ligadas, podeEditar }: { ligadas: Origem[]; podeEditar: boolean }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [marcadas, setMarcadas] = useState<Origem[]>(ligadas);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);
  const mudou = ORIGENS.some((o) => marcadas.includes(o) !== ligadas.includes(o));

  function alternar(o: Origem) {
    setMensagem(null);
    setMarcadas((atual) => (atual.includes(o) ? atual.filter((x) => x !== o) : ORIGENS.filter((x) => x === o || atual.includes(x))));
  }

  function salvar() {
    setMensagem(null);
    startTransition(async () => {
      const r = await definirOrigensAction(marcadas);
      if ("erro" in r) {
        setMensagem({ erro: true, texto: r.erro });
        return;
      }
      setMensagem({ erro: false, texto: "Tipos de pesquisa salvos." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {ORIGENS.map((o) => (
          <li key={o}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={marcadas.includes(o)} disabled={!podeEditar || pendente} onChange={() => alternar(o)} />
              <span>
                <span className="font-semibold text-azul-noite">{ROTULO_ORIGEM[o]}</span>
                <span className="block text-xs text-cinza-medio">{DESCRICAO_ORIGEM[o]}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {marcadas.length === 0 && <p className="text-xs text-vermelho">Deixe pelo menos um tipo ligado.</p>}
      {podeEditar && (
        <button
          type="button"
          disabled={pendente || !mudou || marcadas.length === 0}
          onClick={salvar}
          className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
        >
          {pendente ? "Salvando..." : "Salvar os tipos de pesquisa ligados"}
        </button>
      )}
      {mensagem && <p className={`text-xs ${mensagem.erro ? "text-vermelho" : "text-verde"}`}>{mensagem.texto}</p>}
    </div>
  );
}
