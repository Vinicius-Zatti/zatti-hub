"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarPerguntasAction } from "@/app/(app)/avaliacoes/actions";
import { LIMITE_TEXTO_PERGUNTA, definicao, type PerguntaConfig, type TipoPergunta } from "@/lib/avaliacoes/perguntas";

const ROTULO_TIPO: Record<TipoPergunta, string> = {
  estrelas: "Estrelas de 1 a 5",
  faixas: "Faixas de tempo",
  nps: "Nota de 0 a 10",
  escolha: "Lista de opções + Outro",
  texto: "Texto livre",
};

/** Liga, desliga e muda o texto das perguntas do modelo. Salvar cria uma versão nova; as
 * avaliações antigas ficam ligadas à versão em que foram respondidas. */
export function EditorPerguntas({ atuais, versao }: { atuais: PerguntaConfig[]; versao: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<PerguntaConfig[]>(atuais);
  const mudou = JSON.stringify(lista) !== JSON.stringify(atuais);

  function mudar(i: number, parcial: Partial<PerguntaConfig>) {
    setLista((l) => l.map((p, j) => (j === i ? { ...p, ...parcial } : p)));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLista(atuais);
          setErro(null);
          setAberto(true);
        }}
        className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
      >
        Ligar, desligar ou mudar o texto das perguntas
      </button>
      <ModalFlutuante aberto={aberto} onFechar={() => !pendente && setAberto(false)} larga>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await salvarPerguntasAction(lista);
              if ("erro" in r) {
                setErro(r.erro);
                return;
              }
              setAberto(false);
              router.refresh();
            });
          }}
          className="flex flex-col gap-3"
        >
          <h2 className="font-display text-lg font-bold text-azul-noite">Perguntas da pesquisa</h2>
          <p className="text-sm text-cinza">
            O tipo de cada pergunta e as opções são fixos, para os números do painel continuarem comparáveis. Pergunta desligada some da página; as respostas antigas
            dela continuam no painel.
          </p>
          <ul className="flex flex-col gap-3">
            {lista.map((p, i) => {
              const def = definicao(p.chave);
              return (
                <li key={p.chave} className={`rounded-lg border p-3 ${p.ativa ? "border-cinza-claro bg-branco" : "border-dashed border-cinza-claro"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-azul-noite">
                      {def.nome}
                      <span className="ml-2 text-xs font-normal text-cinza-medio">
                        {ROTULO_TIPO[def.tipo]} · {def.obrigatoria ? "obrigatória" : "opcional"}
                      </span>
                    </span>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={p.ativa} onChange={(e) => mudar(i, { ativa: e.target.checked })} className="h-4 w-4" />
                      {p.ativa ? "Ligada" : "Desligada"}
                    </label>
                  </div>
                  <input
                    className="mt-2 w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm disabled:opacity-60"
                    value={p.texto}
                    maxLength={LIMITE_TEXTO_PERGUNTA}
                    disabled={!p.ativa}
                    onChange={(e) => mudar(i, { texto: e.target.value })}
                    aria-label={`Texto da pergunta ${def.nome}`}
                  />
                  {def.opcoes && <p className="mt-1 text-xs text-cinza-medio">Opções: {def.opcoes.map((o) => o.rotulo).join(", ")}</p>}
                </li>
              );
            })}
          </ul>
          {erro && <p className="text-sm text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pendente || !mudou} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
              {pendente ? "Salvando..." : mudou ? `Salvar as perguntas (vira a versão ${versao + 1})` : "Nada mudou"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
              Cancelar
            </button>
          </div>
        </form>
      </ModalFlutuante>
    </>
  );
}
