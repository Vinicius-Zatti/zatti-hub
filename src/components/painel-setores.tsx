"use client";

import { useMemo, useState, useTransition } from "react";
import type { Produto, Setor } from "@/lib/types";
import { nomeGrupo } from "@/lib/grupos";
import { designarSetoresAction, salvarSetorAction } from "@/app/(app)/estoque/setores/actions";

type Designacoes = Record<string, string[]>;

export function PainelSetores({
  setores,
  produtos,
  designacoes,
}: {
  setores: Setor[];
  produtos: Produto[];
  designacoes: Designacoes;
}) {
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const [mapa, setMapa] = useState<Designacoes>(designacoes);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [filtroSetor, setFiltroSetor] = useState<string>("todos");

  const ativos = setores.filter((setor) => setor.ativo);

  const semSetor = useMemo(
    () => produtos.filter((produto) => (mapa[produto.sku] ?? []).length === 0),
    [produtos, mapa],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((produto) => {
      const atuais = mapa[produto.sku] ?? [];
      if (filtroSetor === "sem" && atuais.length > 0) return false;
      if (filtroSetor !== "sem" && filtroSetor !== "todos" && !atuais.includes(filtroSetor)) {
        return false;
      }
      if (!termo) return true;
      return (
        produto.nome.toLowerCase().includes(termo) || produto.sku.toLowerCase().includes(termo)
      );
    });
  }, [produtos, mapa, busca, filtroSetor]);

  function criarSetor() {
    const nome = novoNome.trim();
    if (!nome) return;
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarSetorAction({
        nome,
        ordem: setores.length,
        ativo: true,
      });
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      setNovoNome("");
      setAviso(`Setor "${nome}" criado.`);
    });
  }

  function alternarAtivo(setor: Setor) {
    setErro(null);
    iniciar(async () => {
      const resultado = await salvarSetorAction({
        id: setor.id,
        nome: setor.nome,
        ordem: setor.ordem,
        ativo: !setor.ativo,
      });
      if ("erro" in resultado) setErro(resultado.erro);
      else setAviso(`Setor "${setor.nome}" ${setor.ativo ? "desativado" : "reativado"}.`);
    });
  }

  function alternarSelecionado(sku: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(sku)) novo.delete(sku);
      else novo.add(sku);
      return novo;
    });
  }

  /** Aplica um setor ao lote selecionado. `modo` decide entre acrescentar o
   * setor (produto pode ficar em vários) e tirar só aquele setor. */
  function aplicarEmMassa(setorId: string, modo: "adicionar" | "remover") {
    if (selecionados.size === 0) return;
    setErro(null);

    const designacoesNovas = Array.from(selecionados).map((sku) => {
      const atuais = new Set(mapa[sku] ?? []);
      if (modo === "adicionar") atuais.add(setorId);
      else atuais.delete(setorId);
      return { sku, setorIds: Array.from(atuais) };
    });

    iniciar(async () => {
      const resultado = await designarSetoresAction(designacoesNovas);
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      setMapa((atual) => {
        const novo = { ...atual };
        for (const designacao of designacoesNovas) novo[designacao.sku] = designacao.setorIds;
        return novo;
      });
      setAviso(
        `${designacoesNovas.length} produto(s) ${modo === "adicionar" ? "designados" : "removidos"}.`,
      );
      setSelecionados(new Set());
    });
  }

  function alternarSetorDoProduto(sku: string, setorId: string) {
    const atuais = new Set(mapa[sku] ?? []);
    if (atuais.has(setorId)) atuais.delete(setorId);
    else atuais.add(setorId);
    const setorIds = Array.from(atuais);

    setErro(null);
    iniciar(async () => {
      const resultado = await designarSetoresAction([{ sku, setorIds }]);
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      setMapa((atual) => ({ ...atual, [sku]: setorIds }));
    });
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Setores</h1>
        <p className="text-sm text-cinza-medio">
          Cada setor conta a própria lista. Um produto pode estar em mais de um setor - o limão
          fica no Bar e na Cozinha, e as duas quantidades somam no total da unidade.
        </p>
      </div>

      {erro && <p className="rounded-md bg-vermelho/10 p-3 text-sm text-vermelho">{erro}</p>}
      {aviso && !erro && (
        <p className="rounded-md bg-verde/10 p-3 text-sm text-cinza">{aviso}</p>
      )}

      {semSetor.length > 0 && (
        <div className="rounded-lg border border-ambar bg-ambar/10 p-4 text-sm text-cinza">
          <strong>
            {semSetor.length} produto{semSetor.length > 1 ? "s" : ""} sem setor designado.
          </strong>{" "}
          Produto sem setor não entra em contagem nenhuma. Ele continua ativo no cadastro e segue
          aparecendo na precificação.
        </div>
      )}

      <section className="rounded-lg border border-cinza-claro bg-branco p-4">
        <h2 className="font-display text-lg font-bold text-azul-noite">Setores da unidade</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Novo setor
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex: Bar, Cozinha, Depósito"
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={criarSetor}
            disabled={pendente || !novoNome.trim()}
            className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
          >
            Criar setor
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {setores.length === 0 && (
            <li className="text-sm text-cinza-medio">
              Nenhum setor ainda. Enquanto não existir setor, a contagem continua funcionando
              como antes, por grupo de produto.
            </li>
          )}
          {setores.map((setor) => (
            <li
              key={setor.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cinza-claro px-3 py-2 text-sm"
            >
              <span className={setor.ativo ? "font-semibold text-cinza" : "text-cinza-medio"}>
                {setor.nome} {!setor.ativo && "(desativado)"}
              </span>
              <span className="text-cinza-medio">{setor.produtos} produto(s)</span>
              <button
                type="button"
                onClick={() => alternarAtivo(setor)}
                disabled={pendente}
                className="rounded-md border border-azul-noite px-3 py-1 text-xs font-semibold text-azul-noite disabled:opacity-60"
              >
                {setor.ativo ? "Desativar" : "Reativar"}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-cinza-medio">
          Setor não é excluído, só desativado. Apagar deixaria as contagens antigas apontando pra
          um setor que não existe mais.
        </p>
      </section>

      <section className="rounded-lg border border-cinza-claro bg-branco p-4">
        <h2 className="font-display text-lg font-bold text-azul-noite">Designar produtos</h2>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Buscar
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="nome ou SKU"
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-cinza-medio">
            Mostrar
            <select
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-sm"
            >
              <option value="todos">Todos os produtos</option>
              <option value="sem">Só os sem setor</option>
              {ativos.map((setor) => (
                <option key={setor.id} value={setor.id}>
                  {setor.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selecionados.size > 0 && ativos.length > 0 && (
          <div className="mt-3 rounded-md border border-azul-noite bg-azul-noite/5 p-3 text-sm">
            <p className="font-semibold text-azul-noite">
              {selecionados.size} produto(s) selecionado(s)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ativos.map((setor) => (
                <span key={setor.id} className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => aplicarEmMassa(setor.id, "adicionar")}
                    disabled={pendente}
                    className="rounded-md bg-azul-noite px-3 py-1 text-xs font-semibold text-branco disabled:opacity-60"
                  >
                    + {setor.nome}
                  </button>
                  <button
                    type="button"
                    onClick={() => aplicarEmMassa(setor.id, "remover")}
                    disabled={pendente}
                    className="rounded-md border border-cinza-claro px-2 py-1 text-xs text-cinza-medio disabled:opacity-60"
                  >
                    -
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-cinza-medio">
              <tr>
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={visiveis.length > 0 && selecionados.size === visiveis.length}
                    onChange={(e) =>
                      setSelecionados(
                        e.target.checked ? new Set(visiveis.map((p) => p.sku)) : new Set(),
                      )
                    }
                  />
                </th>
                <th className="px-2 py-2">Produto</th>
                <th className="px-2 py-2">Grupo</th>
                <th className="px-2 py-2">Setores</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((produto) => {
                const atuais = mapa[produto.sku] ?? [];
                return (
                  <tr key={produto.sku} className="border-t border-cinza-claro">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selecionados.has(produto.sku)}
                        onChange={() => alternarSelecionado(produto.sku)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-semibold text-cinza">{produto.nome}</span>
                      <span className="ml-2 text-xs text-cinza-medio">{produto.sku}</span>
                    </td>
                    <td className="px-2 py-2 text-cinza-medio">{nomeGrupo(produto.grupo)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {ativos.map((setor) => {
                          const marcado = atuais.includes(setor.id);
                          return (
                            <button
                              key={setor.id}
                              type="button"
                              onClick={() => alternarSetorDoProduto(produto.sku, setor.id)}
                              disabled={pendente}
                              className={
                                marcado
                                  ? "rounded-full bg-azul-noite px-3 py-1 text-xs font-semibold text-branco disabled:opacity-60"
                                  : "rounded-full border border-cinza-claro px-3 py-1 text-xs text-cinza-medio disabled:opacity-60"
                              }
                            >
                              {setor.nome}
                            </button>
                          );
                        })}
                        {atuais.length === 0 && (
                          <span className="text-xs text-ambar">sem setor</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visiveis.length === 0 && (
            <p className="py-4 text-sm text-cinza-medio">Nenhum produto com esse filtro.</p>
          )}
        </div>
      </section>
    </div>
  );
}
