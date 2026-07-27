"use client";

import { useState } from "react";
import type { Fornecedor } from "@/lib/types";
import { criarFornecedorRapidoAction } from "@/app/(app)/estoque/fornecedores/actions";
import { GRUPO_OPCOES } from "@/lib/grupos";

/** Cadastro rápido de fornecedor, aberto de dentro de outra tela (Produtos
 * > Edição de Dados) pra não obrigar sair pra Fornecedores só pra cadastrar
 * quem ainda não existe. Só os campos obrigatórios do cadastro completo -
 * o resto (condições de pagamento, limite de crédito etc) fica pendente,
 * igual qualquer fornecedor cadastrado incompleto. */
export function NovoFornecedorModal({
  aberto,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCriado: (fornecedor: Fornecedor) => void;
}) {
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [nomeVendedor, setNomeVendedor] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [grupos, setGrupos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!aberto) return null;

  function limparEFechar() {
    setNomeFantasia("");
    setNomeVendedor("");
    setWhatsapp("");
    setGrupos([]);
    setErro(null);
    onFechar();
  }

  function alternarGrupo(codigo: string) {
    setGrupos((g) => (g.includes(codigo) ? g.filter((c) => c !== codigo) : [...g, codigo]));
  }

  async function salvar() {
    if (!nomeFantasia.trim() || !nomeVendedor.trim() || !whatsapp.trim()) {
      setErro("Preenche Nome Fantasia, Vendedor e WhatsApp.");
      return;
    }
    setErro(null);
    setPending(true);
    const r = await criarFornecedorRapidoAction({ nomeFantasia, nomeVendedor, whatsapp, grupos });
    setPending(false);
    if ("erro" in r) {
      setErro(r.erro);
      return;
    }
    onCriado(r.fornecedor);
    setNomeFantasia("");
    setNomeVendedor("");
    setWhatsapp("");
    setGrupos([]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-azul-noite/70 p-4">
      <div className="w-full max-w-sm rounded-xl bg-branco p-5 shadow-xl">
        <h2 className="font-display text-lg font-bold text-azul-noite">Novo fornecedor</h2>
        <p className="mt-1 text-xs text-cinza-medio">
          Cadastro rápido - o resto (condições de pagamento, limite de crédito etc.) você completa
          depois em Fornecedores.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-cinza-medio">Nome Fantasia *</label>
            <input
              autoFocus
              value={nomeFantasia}
              onChange={(e) => setNomeFantasia(e.target.value)}
              className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-cinza-medio">Nome do Vendedor *</label>
            <input
              value={nomeVendedor}
              onChange={(e) => setNomeVendedor(e.target.value)}
              className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-cinza-medio">WhatsApp *</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Ex: 11999999999"
              className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-cinza-medio">
              Grupos que atende (opcional)
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {GRUPO_OPCOES.map((g) => (
                <button
                  key={g.codigo}
                  type="button"
                  onClick={() => alternarGrupo(g.codigo)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    grupos.includes(g.codigo)
                      ? "border-ambar bg-ambar/10 text-ambar"
                      : "border-cinza-claro text-cinza-medio hover:border-ambar"
                  }`}
                >
                  {g.descricao}
                </button>
              ))}
            </div>
          </div>
        </div>
        {erro && <p className="mt-3 text-xs text-vermelho">{erro}</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={salvar}
            disabled={pending}
            className="flex-1 rounded-md bg-azul-noite px-3 py-2.5 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar fornecedor"}
          </button>
          <button
            type="button"
            onClick={limparEFechar}
            disabled={pending}
            className="flex-1 rounded-md border border-cinza-claro px-3 py-2.5 text-sm font-semibold text-cinza-medio hover:bg-off-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
