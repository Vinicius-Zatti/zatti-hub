"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { incluirFichaNaContagemAction } from "@/app/(app)/fichas-tecnicas/actions";
import { paresDaFichaAction, unirPrePreparoFichaExistenteAction } from "@/app/(app)/estoque/produtos/pre-preparo-actions";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { OpcaoUniaoPrePreparo } from "@/components/escolha-ficha-existente";
import type { ParPrePreparo } from "@/lib/banco/pre-preparo-uniao";
import { nomeContagemSugerido } from "@/lib/pre-preparo";
import type { VinculoContagemFicha } from "@/lib/banco/pre-preparo-leitura";

/** Pré-preparo na contagem (piloto): mostra qual produto da lista de
 * contagem é esta ficha ou, se ainda não entrou, o botão para incluir. O
 * SKU, o grupo (PRE) e a unidade (a do rendimento) vêm da ficha; só o nome
 * da contagem é escolhido aqui. */
export function FichaNaContagem({
  ficha,
  vinculo,
  podeGerir,
}: {
  ficha: { id: string; sku: string; nome: string; rendimentoUnidade: string };
  vinculo: VinculoContagemFicha;
  podeGerir: boolean;
}) {
  const [produto, setProduto] = useState(vinculo.produto);
  const [prePreparo, setPrePreparo] = useState(vinculo.prePreparo);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(() => nomeContagemSugerido(ficha.nome));
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // "Usar o produto existente" (26/10/2026): produtos PRE de nome parecido,
  // sem ficha, procurados ao abrir a janela. `null` = ainda procurando.
  const [pares, setPares] = useState<ParPrePreparo[] | null>(null);
  const [unindo, setUnindo] = useState<string | null>(null);
  const router = useRouter();

  function abrir() {
    setAberto(true);
    setErro(null);
    setPares(null);
    paresDaFichaAction(ficha.id)
      .then(setPares)
      .catch(() => setPares([]));
  }

  function unir(par: ParPrePreparo) {
    setErro(null);
    setUnindo(par.produto.sku);
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof unirPrePreparoFichaExistenteAction>>;
      try {
        r = await unirPrePreparoFichaExistenteAction(par.produto.sku, ficha.id);
      } catch {
        r = { ok: false, mensagem: "Não foi possível falar com o servidor. Confira a conexão e tente de novo." };
      }
      setUnindo(null);
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      setProduto({ sku: r.sku, nome: par.produto.nome, unidadeBase: par.produto.unidadeBase });
      setPrePreparo(true);
      setAberto(false);
      // A ficha pode ter passado a usar o SKU do produto.
      router.refresh();
    });
  }

  function incluir(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await incluirFichaNaContagemAction(ficha.id, nome);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setProduto({ sku: ficha.sku, nome: nome.trim(), unidadeBase: ficha.rendimentoUnidade });
      setPrePreparo(true);
      setAberto(false);
    });
  }

  if (produto) {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Lista de contagem</div>
        <div className="mt-1 text-sm font-semibold text-azul-noite">
          {produto.nome} · {produto.sku} · contado em {produto.unidadeBase}
        </div>
        {prePreparo ? (
          <p className="mt-1 text-xs text-cinza-medio">
            O preço desse produto na contagem é o custo por {produto.unidadeBase} desta ficha, atualizado quando a
            ficha ou o preço de um ingrediente muda. Enquanto faltar preço de algum ingrediente, vale o preço digitado
            em Produtos.
          </p>
        ) : (
          <p className="mt-1 text-xs text-cinza-medio">
            A chave &quot;Pré-preparo&quot; está desligada nesse produto (Produtos, Edição de Dados): o preço na
            contagem é o digitado lá, não o desta ficha.
          </p>
        )}
      </div>
    );
  }

  if (!podeGerir) return null;

  return (
    <div className="rounded-lg border border-dashed border-cinza-claro bg-branco p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Lista de contagem</div>
      <p className="mt-1 text-xs text-cinza-medio">Este pré-preparo ainda não é contado no estoque.</p>
      <button
        type="button"
        onClick={abrir}
        className="mt-2 rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo"
      >
        Incluir na lista de contagem
      </button>

      <ModalFlutuante aberto={aberto} onFechar={() => setAberto(false)}>
        <h2 className="font-display text-xl font-bold text-azul-noite">Incluir na lista de contagem</h2>
        {pares === null && <p className="mt-2 text-xs text-cinza-medio">Procurando produto parecido na lista...</p>}
        {pares !== null && pares.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-cinza-medio">
              {pares.length === 1 ? "Este produto" : "Estes produtos"} de pré-preparo já {pares.length === 1 ? "está" : "estão"} na
              lista de contagem, com nome parecido e sem ficha. Usar um deles junta produto e ficha num item só, sem
              criar outro produto.
            </p>
            {pares.map((par) => (
              <OpcaoUniaoPrePreparo
                key={par.produto.sku}
                par={par}
                lado="ficha"
                desabilitada={isPending}
                pendente={unindo === par.produto.sku}
                onEscolher={() => unir(par)}
              />
            ))}
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-cinza-medio">Ou criar produto novo</p>
          </div>
        )}
        <form onSubmit={incluir} className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="nome-contagem" className="text-xs font-semibold text-cinza-medio">
              Nome na contagem
            </label>
            <input
              id="nome-contagem"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-cinza-medio">
              Termine com &quot;da casa&quot; para não confundir com um produto comprado de nome parecido.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs font-semibold text-cinza-medio">SKU</div>
              <div className="mt-1 font-semibold text-azul-noite">{ficha.sku}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-cinza-medio">Grupo</div>
              <div className="mt-1 font-semibold text-azul-noite">PRE</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-cinza-medio">Unidade contada</div>
              <div className="mt-1 font-semibold text-azul-noite">{ficha.rendimentoUnidade}</div>
            </div>
          </div>
          <p className="text-[11px] text-cinza-medio">
            A unidade contada é a mesma do rendimento desta ficha. Para contar em outra, mude o rendimento antes.
          </p>
          {erro && <p className="text-xs text-vermelho">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !nome.trim()}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50"
            >
              {isPending && unindo === null
                ? "Incluindo..."
                : pares && pares.length > 0
                  ? `Criar produto novo (${ficha.sku}) na contagem`
                  : "Incluir na contagem"}
            </button>
          </div>
        </form>
      </ModalFlutuante>
    </div>
  );
}
