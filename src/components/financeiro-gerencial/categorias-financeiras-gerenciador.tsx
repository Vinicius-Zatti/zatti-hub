"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  arquivarCategoriaFinanceiraAction,
  criarCategoriaFinanceiraAction,
  editarCategoriaFinanceiraAction,
} from "@/app/(app)/financeiro-gerencial/categorias/actions";
import { CATEGORIAS_PAI_PERMITIDAS, caminhoCategoria, montarArvoreCategorias } from "@/lib/financeiro-gerencial/categorias";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import type { CategoriaFinanceira, NoArvoreCategoria } from "@/lib/financeiro-gerencial/tipos";

/** "Categorias" no banco, "Plano de Contas" na tela - item 2 da correção de
 * 25/08: grupo de contas (grupo_principal/subgrupo) é a estrutura, conta é a
 * folha que recebe lançamento. Criar/editar seguem o padrão de modal de
 * Produtos/Fornecedores/Fichas Técnicas (item 1), nunca formulário expandido
 * na página. */
export function CategoriasFinanceirasGerenciador({ categorias }: { categorias: CategoriaFinanceira[] }) {
  const arvore = useMemo(() => montarArvoreCategorias(categorias), [categorias]);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<CategoriaFinanceira | null>(null);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Plano de Contas</h1>
          <p className="text-sm text-cinza-medio">
            As contas padrão (marcadas &ldquo;padrão&rdquo;) seguem o Método M.E.G.A. e não podem ser
            editadas nem excluídas - você pode criar contas próprias dentro dos grupos de contas
            permitidos, e arquivá-las depois sem perder o histórico de lançamentos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCriando(true)}
          className="shrink-0 rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:brightness-95"
        >
          + Nova conta
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {arvore.map((grupoPrincipal) => (
          <NoGrupo key={grupoPrincipal.id} no={grupoPrincipal} nivelVisual={0} onEditar={setEditando} />
        ))}
      </div>

      <ModalFlutuante aberto={criando} onFechar={() => setCriando(false)}>
        <FormularioNovaConta categorias={categorias} onSalvo={() => setCriando(false)} onCancelar={() => setCriando(false)} />
      </ModalFlutuante>

      <ModalFlutuante aberto={editando !== null} onFechar={() => setEditando(null)}>
        {editando && (
          <FormularioEditarConta conta={editando} onSalvo={() => setEditando(null)} onCancelar={() => setEditando(null)} />
        )}
      </ModalFlutuante>
    </div>
  );
}

function FormularioNovaConta({
  categorias,
  onSalvo,
  onCancelar,
}: {
  categorias: CategoriaFinanceira[];
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const paisPermitidos = useMemo(
    () => categorias.filter((c) => c.codigoSistema && c.codigoSistema in CATEGORIAS_PAI_PERMITIDAS),
    [categorias],
  );
  const opcoesGrupo = useMemo(
    () => paisPermitidos.map((pai) => ({ id: pai.id, label: caminhoCategoria(pai.id, categorias) })),
    [paisPermitidos, categorias],
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
      router.refresh();
      onSalvo();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Nova conta no Plano de Contas</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Grupo de contas
        <SeletorComBusca value={parentId} opcoes={opcoesGrupo} onChange={setParentId} placeholder="Selecionar grupo..." />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Nome da conta
        <input
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending || !parentId}
          className="flex-1 rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Adicionar conta"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioEditarConta({
  conta,
  onSalvo,
  onCancelar,
}: {
  conta: CategoriaFinanceira;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(conta.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await editarCategoriaFinanceiraAction({ id: conta.id, nome });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      router.refresh();
      onSalvo();
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Editar conta</h2>
      <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
        Nome da conta
        <input
          required
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function NoGrupo({
  no,
  nivelVisual,
  onEditar,
}: {
  no: NoArvoreCategoria;
  nivelVisual: number;
  onEditar: (conta: CategoriaFinanceira) => void;
}) {
  if (no.nivel === "conta") {
    return <LinhaConta conta={no} onEditar={onEditar} />;
  }

  const titulo = nivelVisual === 0 ? "font-display text-lg font-bold text-azul-noite" : "text-sm font-bold text-cinza";
  return (
    <div className={nivelVisual === 0 ? "rounded-lg border border-cinza-claro bg-branco p-4" : "pl-4"}>
      <div className={titulo}>{no.nome}</div>
      <div className="mt-2 flex flex-col gap-1">
        {no.filhos.map((filho) => (
          <NoGrupo key={filho.id} no={filho} nivelVisual={nivelVisual + 1} onEditar={onEditar} />
        ))}
      </div>
    </div>
  );
}

function LinhaConta({ conta, onEditar }: { conta: NoArvoreCategoria; onEditar: (conta: CategoriaFinanceira) => void }) {
  const router = useRouter();
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

  return (
    <div className="flex items-center justify-between gap-3 border-b border-cinza-claro py-1.5 pl-4 text-sm last:border-b-0">
      <span className={conta.arquivado ? "text-cinza-medio line-through" : "text-cinza"}>{conta.nome}</span>
      <div className="flex shrink-0 items-center gap-2">
        {erro && <span className="text-xs text-vermelho">{erro}</span>}
        {conta.padrao ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-cinza-medio">padrão</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEditar(conta)}
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
