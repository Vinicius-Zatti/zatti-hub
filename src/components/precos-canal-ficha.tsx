"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CampoNumero } from "@/components/campo-numero";
import { salvarPrecosCanaisFichaAction } from "@/app/(app)/fichas-tecnicas/actions";
import { CLASSIFICACAO_TAG, montarPrecosPorCanal } from "@/lib/fichas-tecnicas";

function brl(n: number | null): string {
  return n === null ? "-" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Seção "Preços por Canal" da ficha de Venda - Salão só exibe (edita pelo
 * "Editar" da própria ficha, igual já era); Delivery Próprio, iFood e
 * 99Food editam aqui, salvando os 3 de uma vez. Preço sugerido e a
 * classificação de margem são recalculados a cada tecla, sem ida ao
 * servidor - só o preço praticado precisa ser salvo. */
export function PrecosCanalFicha({
  fichaId,
  custoBase,
  custoComEmbalagem,
  temEmbalagem,
  precoVendaSalao,
  precoVendaDeliveryProprioInicial,
  precoVendaIfoodInicial,
  precoVenda99FoodInicial,
  margemNecessaria,
  margemPontoEquilibrio,
  deducoesSalao,
  deducoesIfood,
  deducoes99Food,
}: {
  fichaId: string;
  custoBase: number | null;
  custoComEmbalagem: number | null;
  temEmbalagem: boolean;
  precoVendaSalao: number | null;
  precoVendaDeliveryProprioInicial: number | null;
  precoVendaIfoodInicial: number | null;
  precoVenda99FoodInicial: number | null;
  margemNecessaria: number | null;
  margemPontoEquilibrio: number | null;
  deducoesSalao: number;
  deducoesIfood: number;
  deducoes99Food: number;
}) {
  const router = useRouter();
  const [precoDeliveryProprio, setPrecoDeliveryProprio] = useState<number | null>(precoVendaDeliveryProprioInicial);
  const [precoIfood, setPrecoIfood] = useState<number | null>(precoVendaIfoodInicial);
  const [preco99Food, setPreco99Food] = useState<number | null>(precoVenda99FoodInicial);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const mudou =
    precoDeliveryProprio !== precoVendaDeliveryProprioInicial ||
    precoIfood !== precoVendaIfoodInicial ||
    preco99Food !== precoVenda99FoodInicial;

  const canais = montarPrecosPorCanal({
    custoBase,
    custoComEmbalagem,
    precoVendaSalao,
    precoVendaDeliveryProprio: precoDeliveryProprio,
    precoVendaIfood: precoIfood,
    precoVenda99Food: preco99Food,
    margemNecessaria,
    margemPontoEquilibrio,
    deducoesSalao,
    deducoesIfood,
    deducoes99Food,
  });

  function salvar() {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const resultado = await salvarPrecosCanaisFichaAction({
        id: fichaId,
        precoVendaDeliveryProprio: precoDeliveryProprio,
        precoVendaIfood: precoIfood,
        precoVenda99Food: preco99Food,
      });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setSalvo(true);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Preços por Canal</div>
      {!temEmbalagem && (
        <p className="mb-3 text-xs text-cinza-medio">
          Sem embalagem vinculada - o custo de Delivery Próprio, iFood e 99Food ainda é o mesmo do Salão.
        </p>
      )}
      <div className="flex flex-col divide-y divide-cinza-claro">
        {canais.map((canal) => {
          const editavel = canal.canal !== "salao";
          const valor =
            canal.canal === "delivery_proprio" ? precoDeliveryProprio : canal.canal === "ifood" ? precoIfood : canal.canal === "99food" ? preco99Food : null;
          const onChange =
            canal.canal === "delivery_proprio"
              ? setPrecoDeliveryProprio
              : canal.canal === "ifood"
                ? setPrecoIfood
                : setPreco99Food;
          const tag = canal.classificacao ? CLASSIFICACAO_TAG[canal.classificacao] : null;
          return (
            <div key={canal.canal} className="grid grid-cols-2 gap-2 py-2.5 sm:grid-cols-4 sm:items-center">
              <span className="text-sm font-semibold text-cinza">{canal.label}</span>
              <div className="text-xs text-cinza-medio">
                Sugerido <span className="font-semibold text-azul-noite">{brl(canal.precoSugerido)}</span>
              </div>
              {editavel ? (
                <CampoNumero
                  value={valor}
                  onChange={(v) => {
                    onChange(v);
                    setSalvo(false);
                  }}
                  className="w-full"
                />
              ) : (
                <div className="text-sm font-semibold text-azul-noite">{brl(canal.precoPraticado)}</div>
              )}
              <div className="flex justify-start sm:justify-end">
                {tag && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tag.classe}`}>{tag.label}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {erro && <p className="mt-3 text-sm text-vermelho">{erro}</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={!mudou || isPending}
        className="mt-4 w-full rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
      >
        {isPending ? "Salvando..." : salvo ? "Salvo ✓" : "Salvar preços de delivery"}
      </button>
    </div>
  );
}
