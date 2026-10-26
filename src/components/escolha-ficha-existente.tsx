"use client";

import { useState, useTransition } from "react";
import { unirPrePreparoFichaExistenteAction } from "@/app/(app)/estoque/produtos/pre-preparo-actions";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import type { ParPrePreparo } from "@/lib/banco/pre-preparo-uniao";

/** "Usar a ficha existente" (26/10/2026): o que muda ao unir, dito no
 * próprio botão. Usado pela chave Pré-preparo da Edição de Dados (lado do
 * produto) e pelo "Incluir na lista de contagem" da ficha (lado da ficha). */

function efeitoDaUniao(par: ParPrePreparo): string {
  if (par.muda === "ficha") {
    return par.ficha.sku === par.skuFinal
      ? `Vira um item só, com o SKU ${par.skuFinal}.`
      : `A ficha passa de ${par.ficha.sku} para ${par.skuFinal}, o SKU do produto, que é mais antigo.`;
  }
  return `O produto passa de ${par.produto.sku} para ${par.skuFinal}, o SKU da ficha, que é mais antiga.`;
}

function formatarPreco(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Uma opção de união: botão com o efeito no rótulo e, abaixo, o preço que a
 * contagem passa a usar (com o "i" da conta). Bloqueada, mostra o motivo. */
export function OpcaoUniaoPrePreparo({
  par,
  lado,
  desabilitada,
  pendente,
  onEscolher,
}: {
  par: ParPrePreparo;
  /** De que lado a pessoa está: na ficha oferece o produto, no produto oferece a ficha. */
  lado: "produto" | "ficha";
  desabilitada: boolean;
  pendente: boolean;
  onEscolher: () => void;
}) {
  const rotulo =
    lado === "produto"
      ? `Usar a ficha existente: ${par.ficha.nome} (${par.ficha.sku})`
      : `Usar o produto existente: ${par.produto.nome} (${par.produto.sku})`;
  const unidade = par.ficha.rendimentoUnidade;

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-3">
      <button
        type="button"
        onClick={onEscolher}
        disabled={desabilitada || pendente || par.bloqueio !== null}
        className="w-full rounded-md bg-azul-noite px-3 py-2 text-left text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50"
      >
        <span className="block">{pendente ? "Unindo..." : rotulo}</span>
        <span className="mt-0.5 block text-[11px] font-normal text-off-white">{efeitoDaUniao(par)}</span>
      </button>
      {par.bloqueio ? (
        <p className="mt-2 text-[11px] text-vermelho">{par.bloqueio}</p>
      ) : (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-cinza-medio">
          <span>
            Preço na contagem depois de unir:{" "}
            {par.precoDaFicha !== null ? (
              <strong className="text-azul-noite">
                {formatarPreco(par.precoDaFicha)}/{unidade}
              </strong>
            ) : (
              "o digitado em Produtos, até todo ingrediente da ficha ter preço"
            )}
          </span>
          <DicaCalculo
            rotulo="Como o preço do pré-preparo é calculado"
            texto={`Custo da ficha por ${unidade} = soma do custo de cada ingrediente ÷ rendimento da ficha (em ${unidade}). Atualiza quando a ficha ou o preço de um ingrediente muda. Enquanto faltar preço de algum ingrediente, vale o preço digitado em Produtos.`}
          />
        </div>
      )}
    </div>
  );
}

/** Janela da chave Pré-preparo, quando há ficha PRE de nome parecido sem
 * produto na contagem. "Criar ficha nova" segue o caminho de sempre (o
 * rascunho nasce ao salvar a linha); unir acontece na hora. */
export function EscolhaFichaExistente({
  produto,
  pares,
  outrasMudancas,
  onCriarNova,
  onFechar,
  onUnido,
}: {
  produto: { sku: string; nome: string };
  pares: ParPrePreparo[];
  /** A linha tem outras edições não salvas: unir agora as deixaria para trás. */
  outrasMudancas: boolean;
  onCriarNova: () => void;
  onFechar: () => void;
  onUnido: (skuFinal: string) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function unir(par: ParPrePreparo) {
    setErro(null);
    setEscolhida(par.ficha.id);
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof unirPrePreparoFichaExistenteAction>>;
      try {
        r = await unirPrePreparoFichaExistenteAction(produto.sku, par.ficha.id);
      } catch {
        r = { ok: false, mensagem: "Não foi possível falar com o servidor. Confira a conexão e tente de novo." };
      }
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      onUnido(r.sku);
    });
  }

  return (
    <ModalFlutuante aberto onFechar={isPending ? () => {} : onFechar}>
      <h2 className="font-display text-xl font-bold text-azul-noite">Já existe ficha para este pré-preparo?</h2>
      <p className="mt-2 text-xs text-cinza-medio">
        {produto.nome} ({produto.sku}) ainda não tem ficha técnica. {pares.length === 1 ? "Esta ficha" : "Estas fichas"} de
        pré-preparo {pares.length === 1 ? "tem" : "têm"} nome parecido e ainda não {pares.length === 1 ? "está" : "estão"} na
        lista de contagem. Usar uma delas junta produto e ficha num item só, sem criar outra ficha.
      </p>
      {outrasMudancas && (
        <p className="mt-2 rounded-md bg-ambar/10 px-3 py-2 text-[11px] text-azul-noite">
          Salve ou desfaça as outras mudanças deste produto antes de usar uma ficha existente.
        </p>
      )}
      <div className="mt-3 flex flex-col gap-2">
        {pares.map((par) => (
          <OpcaoUniaoPrePreparo
            key={par.ficha.id}
            par={par}
            lado="produto"
            desabilitada={outrasMudancas || isPending}
            pendente={isPending && escolhida === par.ficha.id}
            onEscolher={() => unir(par)}
          />
        ))}
      </div>
      {erro && <p className="mt-2 text-xs text-vermelho">{erro}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onFechar}
          disabled={isPending}
          className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio disabled:opacity-50"
        >
          Cancelar (a chave fica desligada)
        </button>
        <button
          type="button"
          onClick={onCriarNova}
          disabled={isPending}
          className="rounded-md border border-azul-noite px-3 py-1.5 text-xs font-semibold text-azul-noite hover:bg-azul-noite/5 disabled:opacity-50"
        >
          Criar ficha nova em rascunho ({produto.sku}) ao salvar
        </button>
      </div>
    </ModalFlutuante>
  );
}
