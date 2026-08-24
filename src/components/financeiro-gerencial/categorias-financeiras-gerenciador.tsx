"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  arquivarCategoriaFinanceiraAction,
  criarCategoriaFinanceiraAction,
  editarCategoriaFinanceiraAction,
} from "@/app/(app)/financeiro-gerencial/categorias/actions";
import { CATEGORIAS_PAI_PERMITIDAS, montarArvoreCategorias } from "@/lib/financeiro-gerencial/categorias";
import type { CategoriaFinanceira, NoArvoreCategoria } from "@/lib/financeiro-gerencial/tipos";

export function CategoriasFinanceirasGerenciador({ categorias }: { categorias: CategoriaFinanceira[] }) {
  const router = useRouter();
  const arvore = useMemo(() => montarArvoreCategorias(categorias), [categorias]);
  const paisPermitidos = useMemo(
    () => categorias.filter((c) => c.codigoSistema && c.codigoSistema in CATEGORIAS_PAI_PERMITIDAS),
    [categorias],
  );

  const [parentId, setParentId] = useState(paisPermitidos[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarCategoriaFinanceiraAction({ parentId, nome });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setNome("");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Categorias financeiras</h1>
        <p className="text-sm text-cinza-medio">
          Plano de contas do Financeiro gerencial. As contas padrão (marcadas &ldquo;padrão&rdquo;) seguem o
          Método M.E.G.A. e não podem ser editadas nem excluídas - você pode criar contas próprias
          dentro dos grupos permitidos, e arquivá-las depois sem perder o histórico de lançamentos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Nova categoria própria</div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Grupo
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          >
            {paisPermitidos.map((pai) => (
              <option key={pai.id} value={pai.id}>
                {pai.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Nome da conta
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button
          type="submit"
          disabled={isPending || !parentId}
          className="mt-1 w-full rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Adicionar categoria"}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        {arvore.map((grupoPrincipal) => (
          <NoGrupo key={grupoPrincipal.id} no={grupoPrincipal} nivelVisual={0} />
        ))}
      </div>
    </div>
  );
}

function NoGrupo({ no, nivelVisual }: { no: NoArvoreCategoria; nivelVisual: number }) {
  if (no.nivel === "conta") {
    return <LinhaConta conta={no} />;
  }

  const titulo = nivelVisual === 0 ? "font-display text-lg font-bold text-azul-noite" : "text-sm font-bold text-cinza";
  return (
    <div className={nivelVisual === 0 ? "rounded-lg border border-cinza-claro bg-branco p-4" : "pl-4"}>
      <div className={titulo}>{no.nome}</div>
      <div className="mt-2 flex flex-col gap-1">
        {no.filhos.map((filho) => (
          <NoGrupo key={filho.id} no={filho} nivelVisual={nivelVisual + 1} />
        ))}
      </div>
    </div>
  );
}

function LinhaConta({ conta }: { conta: NoArvoreCategoria }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternarArquivamento() {
    setErro(null);
    startTransition(async () => {
      const resultado = await arquivarCategoriaFinanceiraAction({ id: conta.id, arquivado: !conta.arquivado });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
    });
  }

  function salvarNome(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await editarCategoriaFinanceiraAction({ id: conta.id, nome });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (editando) {
    return (
      <form
        onSubmit={salvarNome}
        className="flex items-center gap-2 border-b border-cinza-claro py-1.5 pl-4 text-sm last:border-b-0"
      >
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-cinza-claro px-2 py-1 text-sm text-cinza"
        />
        {erro && <span className="text-xs text-vermelho">{erro}</span>}
        <button
          type="submit"
          disabled={isPending}
          className="shrink-0 text-xs font-semibold text-azul-petroleo disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNome(conta.nome);
            setEditando(false);
          }}
          className="shrink-0 text-xs font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-cinza-claro py-1.5 pl-4 text-sm last:border-b-0">
      <span className={conta.arquivado ? "text-cinza-medio line-through" : "text-cinza"}>{conta.nome}</span>
      <div className="flex shrink-0 items-center gap-2">
        {conta.padrao ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">padrão</span>
        ) : (
          <>
            {erro && <span className="text-xs text-vermelho">{erro}</span>}
            <button
              type="button"
              onClick={() => setEditando(true)}
              disabled={conta.arquivado}
              className="text-xs font-semibold text-azul-petroleo disabled:opacity-50"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={alternarArquivamento}
              disabled={isPending}
              className="text-xs font-semibold text-azul-petroleo disabled:opacity-50"
            >
              {conta.arquivado ? "Desarquivar" : "Arquivar"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
