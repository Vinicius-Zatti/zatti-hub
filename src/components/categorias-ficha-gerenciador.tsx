"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  criarCategoriaFichaAction,
  editarCategoriaFichaAction,
  excluirCategoriaFichaAction,
} from "@/app/(app)/fichas-tecnicas/actions";
import { CAMADA_LABEL } from "@/lib/fichas-tecnicas";
import type { CamadaFicha, CategoriaFicha } from "@/lib/types";

export function CategoriasFichaGerenciador({
  categorias,
  fichasPorCategoria,
}: {
  categorias: CategoriaFicha[];
  fichasPorCategoria: Record<string, number>;
}) {
  const router = useRouter();
  const [camada, setCamada] = useState<CamadaFicha>("PRE");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const resultado = await criarCategoriaFichaAction({ camada, codigo, nome });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setCodigo("");
      setNome("");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Categorias de Fichas Técnicas</h1>
        <p className="text-sm text-cinza-medio">
          Agrupamento visual, mas o código também vira parte do SKU (chars 4-6) - trocar o código de
          uma categoria atualiza o SKU de toda ficha já cadastrada nela.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Nova categoria</div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Camada
          <select
            value={camada}
            onChange={(e) => setCamada(e.target.value as CamadaFicha)}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          >
            <option value="PRE">{CAMADA_LABEL.PRE}</option>
            <option value="VEN">{CAMADA_LABEL.VEN}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Código (3 letras)
          <input
            required
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            maxLength={3}
            placeholder="BUR"
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm uppercase text-cinza"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
          Nome
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Burgers"
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza"
          />
        </label>
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="mt-1 w-full rounded-lg bg-ambar px-4 py-2.5 text-sm font-bold text-azul-noite disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Adicionar categoria"}
        </button>
      </form>

      {(["PRE", "VEN"] as CamadaFicha[]).map((c) => (
        <div key={c} className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">{CAMADA_LABEL[c]}</div>
          <div className="rounded-lg border border-cinza-claro bg-branco">
            {categorias.filter((cat) => cat.camada === c).length === 0 ? (
              <p className="p-4 text-sm text-cinza-medio">Nenhuma categoria cadastrada.</p>
            ) : (
              <ul className="divide-y divide-cinza-claro">
                {categorias
                  .filter((cat) => cat.camada === c)
                  .map((cat) => (
                    <LinhaCategoria key={cat.id} categoria={cat} quantidadeFichas={fichasPorCategoria[cat.id] ?? 0} />
                  ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

type Modo = "ver" | "editar" | "confirmar-edicao" | "confirmar-exclusao";

function LinhaCategoria({ categoria, quantidadeFichas }: { categoria: CategoriaFicha; quantidadeFichas: number }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("ver");
  const [codigo, setCodigo] = useState(categoria.codigo);
  const [nome, setNome] = useState(categoria.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancelarEdicao() {
    setCodigo(categoria.codigo);
    setNome(categoria.nome);
    setErro(null);
    setModo("ver");
  }

  function pedirSalvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const codigoNovo = codigo.trim().toUpperCase();
    if (codigoNovo !== categoria.codigo && quantidadeFichas > 0) {
      setModo("confirmar-edicao");
      return;
    }
    salvar();
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const resultado = await editarCategoriaFichaAction({ id: categoria.id, codigo, nome });
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        setModo("editar");
        return;
      }
      setModo("ver");
      router.refresh();
    });
  }

  function excluir() {
    setErro(null);
    startTransition(async () => {
      const resultado = await excluirCategoriaFichaAction(categoria.id);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        setModo("ver");
        return;
      }
      router.refresh();
    });
  }

  if (modo === "editar") {
    return (
      <li className="p-3">
        <form onSubmit={pedirSalvar} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              maxLength={3}
              className="w-16 rounded-md border border-cinza-claro px-2 py-1.5 text-sm uppercase text-cinza"
            />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="flex-1 rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
            />
          </div>
          {erro && <p className="text-xs text-vermelho">{erro}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
            >
              {isPending ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={cancelarEdicao}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );
  }

  if (modo === "confirmar-edicao") {
    return (
      <li className="p-3">
        <p className="text-sm text-cinza">
          Trocar o código de <strong>{categoria.codigo}</strong> pra <strong>{codigo.trim().toUpperCase()}</strong> vai
          atualizar o SKU de <strong>{quantidadeFichas}</strong> ficha{quantidadeFichas > 1 ? "s" : ""} técnica
          {quantidadeFichas > 1 ? "s" : ""} já cadastrada{quantidadeFichas > 1 ? "s" : ""} nesta categoria. Confirmar?
        </p>
        {erro && <p className="mt-2 text-xs text-vermelho">{erro}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={salvar}
            disabled={isPending}
            className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Confirmar e trocar código"}
          </button>
          <button
            type="button"
            onClick={() => setModo("editar")}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  if (modo === "confirmar-exclusao") {
    return (
      <li className="p-3">
        <p className="text-sm text-cinza">
          Tem certeza que deseja excluir a categoria <strong>{categoria.nome}</strong>?
        </p>
        {erro && <p className="mt-2 text-xs text-vermelho">{erro}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={excluir}
            disabled={isPending}
            className="rounded-md bg-vermelho px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-50"
          >
            {isPending ? "Excluindo..." : "Confirmar exclusão"}
          </button>
          <button
            type="button"
            onClick={() => setModo("ver")}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="min-w-0">
        <span className="text-sm text-cinza">{categoria.nome}</span>
        <span className="ml-2 text-xs font-mono text-cinza-medio">{categoria.codigo}</span>
        {quantidadeFichas > 0 && (
          <span className="ml-2 text-[10px] text-cinza-medio">
            {quantidadeFichas} ficha{quantidadeFichas > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={() => setModo("editar")} className="text-xs font-semibold text-azul-petroleo">
          Editar
        </button>
        <button type="button" onClick={() => setModo("confirmar-exclusao")} className="text-xs font-semibold text-vermelho">
          Excluir
        </button>
      </div>
    </li>
  );
}
