"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarRoletaAction } from "@/app/(app)/avaliacoes/actions";
import {
  LIMITE_NOME_PREMIO,
  LIMITE_PREMIOS,
  LIMITE_REGRA_PREMIO,
  chances,
} from "@/lib/avaliacoes/roleta";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Interruptor, ROTULO } from "./ui";
import { TesteRoleta } from "./teste-roleta";

type Linha = { id: string | null; nome: string; regra: string; peso: number };
type Premio = { id: string; nome: string; regra: string | null; peso: number };

const CAMPO =
  "w-full rounded-md border border-cinza-claro bg-branco px-2 py-2 text-sm";

function estadoInicial(
  ativa: boolean,
  validadeDias: number,
  premios: Premio[],
) {
  return {
    ativa,
    validadeDias,
    linhas: (premios.length
      ? premios.map((p) => ({
          id: p.id,
          nome: p.nome,
          regra: p.regra ?? "",
          peso: p.peso,
        }))
      : [{ id: null, nome: "", regra: "", peso: 1 }]) as Linha[],
  };
}

/** Roleta dos apps na própria tela (14/11/2026): liga e desliga, validade do cupom e os prêmios
 * em linhas editáveis; "Salvar" aparece quando algo muda. */
export function EditorRoleta({
  ativa,
  validadeDias,
  premios,
  podeEditar,
  marca,
}: {
  ativa: boolean;
  validadeDias: number;
  premios: Premio[];
  podeEditar: boolean;
  /** Para o teste da roleta com as cores da página. */
  marca: {
    nome: string;
    corPrincipal: string;
    corFundo: string;
    linkPedidoDireto: string | null;
  };
}) {
  const router = useRouter();
  const inicial = estadoInicial(ativa, validadeDias, premios);
  const [form, setForm] = useState(inicial);
  const [base, setBase] = useState({ ativa, validadeDias, premios });
  if (
    base.ativa !== ativa ||
    base.validadeDias !== validadeDias ||
    base.premios !== premios
  ) {
    setBase({ ativa, validadeDias, premios });
    setForm(estadoInicial(ativa, validadeDias, premios));
  }
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(
    null,
  );
  const pct = chances(
    form.linhas.map((l) => ({ peso: l.nome.trim() ? l.peso : 0 })),
  );
  const mudou = JSON.stringify(form) !== JSON.stringify(inicial);

  function mudar(i: number, parcial: Partial<Linha>) {
    setForm((f) => ({
      ...f,
      linhas: f.linhas.map((l, j) => (j === i ? { ...l, ...parcial } : l)),
    }));
  }

  function salvar() {
    setAviso(null);
    startTransition(async () => {
      const r = await salvarRoletaAction({
        ativa: form.ativa,
        validadeDias: form.validadeDias,
        premios: form.linhas.filter((l) => l.nome.trim()),
      });
      if ("erro" in r) return setAviso({ erro: true, texto: r.erro });
      setAviso({ erro: false, texto: "Roleta salva." });
      router.refresh();
    });
  }

  const teste = (
    <div className="flex flex-col gap-2 border-t border-cinza-claro pt-4">
      <p className="text-sm font-semibold text-azul-noite">Testar a roleta</p>
      <TesteRoleta
        premios={form.linhas}
        validadeDias={form.validadeDias}
        {...marca}
      />
    </div>
  );

  if (!podeEditar) {
    return (
      <div className="flex flex-col gap-4">
        <ul className="text-sm">
          {premios.map((p, i) => (
            <li key={p.id}>
              <span className="font-semibold text-azul-noite">{p.nome}</span>
              {p.regra ? ` (${p.regra})` : ""}{" "}
              <span className="text-cinza-medio">
                · chance {chances(premios)[i]}%
              </span>
            </li>
          ))}
        </ul>
        {teste}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cinza-claro p-3">
        <div>
          <p className="text-sm font-semibold text-azul-noite">
            Roleta no fim da pesquisa dos apps
          </p>
          <p className="text-xs text-cinza-medio">
            Cada WhatsApp gira uma vez a cada 30 dias. O prêmio é por responder
            a pesquisa, nunca por avaliar no Google.
          </p>
        </div>
        <Interruptor
          ligado={form.ativa}
          aoMudar={(v) => setForm({ ...form, ativa: v })}
          rotulo="Roleta ligada"
        />
      </div>

      <label className={ROTULO}>
        <span className="text-sm text-azul-noite">Validade do cupom</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={180}
            className="w-20 rounded-md border border-cinza-claro bg-branco px-2 py-2 text-sm"
            value={form.validadeDias}
            onChange={(e) =>
              setForm({ ...form, validadeDias: Number(e.target.value) })
            }
          />
          <span className="text-sm font-normal text-cinza">dias</span>
        </span>
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-azul-noite">
          Prêmios (até {LIMITE_PREMIOS})
        </p>
        {form.linhas.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 rounded-lg border border-cinza-claro p-3 sm:grid-cols-[1fr_1fr_110px_auto] sm:items-end sm:border-0 sm:p-0"
          >
            <label className={ROTULO}>
              Prêmio
              <input
                className={`${CAMPO} mt-1`}
                value={l.nome}
                maxLength={LIMITE_NOME_PREMIO}
                placeholder="Batata grátis"
                onChange={(e) => mudar(i, { nome: e.target.value })}
              />
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
              Chance: {pct[i] ?? 0}%
              <input
                type="number"
                min={1}
                max={100}
                className={`${CAMPO} mt-1`}
                value={l.peso}
                onChange={(e) => mudar(i, { peso: Number(e.target.value) })}
                aria-label={`Peso de ${l.nome || `prêmio ${i + 1}`}`}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  linhas: f.linhas.filter((_, j) => j !== i),
                }))
              }
              className="rounded-md border border-cinza-claro px-3 py-2 text-xs text-cinza hover:text-vermelho"
              aria-label={`Tirar o prêmio ${l.nome || i + 1}`}
            >
              Tirar
            </button>
          </div>
        ))}
        {form.linhas.length < LIMITE_PREMIOS && (
          <button
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                linhas: [
                  ...f.linhas,
                  { id: null, nome: "", regra: "", peso: 1 },
                ],
              }))
            }
            className="self-start text-sm font-semibold text-azul-petroleo"
          >
            + Adicionar prêmio
          </button>
        )}
        <p className="text-xs text-cinza-medio">
          O número de cada prêmio é o peso: com números iguais, todos têm a
          mesma chance. Dê número maior ao prêmio mais barato para ele sair mais
          vezes.
        </p>
      </div>

      {mudou && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={salvar}
            className={BOTAO_PRIMARIO}
          >
            {pendente ? "Salvando..." : "Salvar a roleta"}
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => setForm(inicial)}
            className={BOTAO_SECUNDARIO}
          >
            Desfazer
          </button>
        </div>
      )}
      {aviso && (
        <p
          className={`text-sm font-semibold ${aviso.erro ? "text-vermelho" : "text-verde"}`}
        >
          {aviso.texto}
        </p>
      )}
      {teste}
    </div>
  );
}
