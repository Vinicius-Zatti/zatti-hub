"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarRoletaAction } from "@/app/(app)/avaliacoes/actions";
import { LIMITE_NOME_PREMIO, LIMITE_PREMIOS, LIMITE_REGRA_PREMIO, chances } from "@/lib/avaliacoes/roleta";

type Linha = { id: string | null; nome: string; regra: string; peso: number };

const CAMPO = "w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";

/** Roleta dos apps: ligar, validade do cupom e prêmios (nome, regra e chance). */
export function EditorRoleta({
  ativa,
  validadeDias,
  premios,
}: {
  ativa: boolean;
  validadeDias: number;
  premios: { id: string; nome: string; regra: string | null; peso: number }[];
}) {
  const router = useRouter();
  const inicial = () => ({
    ativa,
    validadeDias,
    linhas: (premios.length ? premios.map((p) => ({ id: p.id, nome: p.nome, regra: p.regra ?? "", peso: p.peso })) : [{ id: null, nome: "", regra: "", peso: 1 }]) as Linha[],
  });
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(inicial);
  const pct = chances(form.linhas.map((l) => ({ peso: l.nome.trim() ? l.peso : 0 })));

  function mudar(i: number, parcial: Partial<Linha>) {
    setForm((f) => ({ ...f, linhas: f.linhas.map((l, j) => (j === i ? { ...l, ...parcial } : l)) }));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setForm(inicial());
          setErro(null);
          setAberto(true);
        }}
        className="self-start rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
      >
        Editar a roleta e os prêmios
      </button>
      <ModalFlutuante aberto={aberto} onFechar={() => !pendente && setAberto(false)} larga>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await salvarRoletaAction({ ativa: form.ativa, validadeDias: form.validadeDias, premios: form.linhas });
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
          <h2 className="font-display text-lg font-bold text-azul-noite">Roleta de prêmios (apps de entrega)</h2>
          <p className="text-sm text-cinza">
            No fim da pesquisa dos apps, a pessoa deixa o WhatsApp, gira a roleta e ganha um cupom com código para usar no próximo pedido direto com vocês. Cada número
            ganha uma vez a cada 30 dias. O prêmio é por responder a pesquisa, nunca por avaliar no Google.
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold text-azul-noite">
            <input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} className="h-4 w-4" />
            Roleta ligada
          </label>
          <label className={ROTULO}>
            Validade do cupom (dias)
            <input
              type="number"
              min={1}
              max={180}
              className={`${CAMPO} mt-1 max-w-[120px]`}
              value={form.validadeDias}
              onChange={(e) => setForm({ ...form, validadeDias: Number(e.target.value) })}
            />
          </label>
          <div className="flex flex-col gap-2">
            <p className={ROTULO}>Prêmios (até {LIMITE_PREMIOS})</p>
            {form.linhas.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_88px_auto] items-end gap-2">
                <label className={ROTULO}>
                  Prêmio
                  <input className={`${CAMPO} mt-1`} value={l.nome} maxLength={LIMITE_NOME_PREMIO} placeholder="Batata grátis" onChange={(e) => mudar(i, { nome: e.target.value })} />
                </label>
                <label className={ROTULO}>
                  Regra (opcional)
                  <input
                    className={`${CAMPO} mt-1`}
                    value={l.regra}
                    maxLength={LIMITE_REGRA_PREMIO}
                    placeholder="Em pedidos acima de R$ 60"
                    onChange={(e) => mudar(i, { regra: e.target.value })}
                  />
                </label>
                <label className={ROTULO}>
                  Peso ({pct[i] ?? 0}%)
                  <input type="number" min={1} max={100} className={`${CAMPO} mt-1`} value={l.peso} onChange={(e) => mudar(i, { peso: Number(e.target.value) })} />
                </label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, linhas: f.linhas.filter((_, j) => j !== i) }))}
                  className="rounded-md border border-cinza-claro px-2 py-1.5 text-xs"
                  aria-label={`Tirar o prêmio ${l.nome || i + 1}`}
                >
                  Tirar
                </button>
              </div>
            ))}
            {form.linhas.length < LIMITE_PREMIOS && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, linhas: [...f.linhas, { id: null, nome: "", regra: "", peso: 1 }] }))}
                className="self-start rounded-md border border-dashed border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo"
              >
                Adicionar prêmio
              </button>
            )}
            <p className="text-xs text-cinza-medio">
              Peso é a chance de sair: com pesos iguais, todos têm a mesma chance. Dê peso maior ao prêmio mais barato para ele sair mais vezes.
            </p>
          </div>
          {erro && <p className="text-sm text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pendente} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
              {pendente ? "Salvando..." : "Salvar a roleta"}
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
