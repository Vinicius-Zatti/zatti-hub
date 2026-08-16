"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { criarCategoriaFichaAction } from "@/app/(app)/fichas-tecnicas/actions";
import { CAMADA_LABEL } from "@/lib/fichas-tecnicas";
import type { CamadaFicha, CategoriaFicha } from "@/lib/types";

export function CategoriasFichaGerenciador({ categorias }: { categorias: CategoriaFicha[] }) {
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
          Só agrupamento visual - não determina o SKU, que é gerado sozinho por camada.
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
                    <li key={cat.id} className="flex items-center justify-between gap-3 p-3">
                      <span className="text-sm text-cinza">{cat.nome}</span>
                      <span className="text-xs font-mono text-cinza-medio">{cat.codigo}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
