"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { editarAcessoMembroAction } from "@/app/(app)/equipe/actions";
import { editarVinculoAction } from "@/app/(app)/acessos/actions";
import { textoSalvarEdicaoAcesso } from "@/components/equipe/textos";

type Papel = "gestao" | "operacional";

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro bg-branco px-3 py-2 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";

/** Botão "Editar acesso" (24/10/2026): troca papel e unidade de um vínculo sem
 * revogar. `equipe`: a gestão do cliente na tela Equipe. `master`: tela
 * Acessos. `podeTodas` = quem edita pode dar "todas as unidades" (gestor
 * preso a uma unidade não pode). A regra de quem pode é do banco. */
export function EditarAcesso({
  modo,
  vinculoId,
  nomeExibido,
  roleAtual,
  unidadeIdAtual,
  unidades,
  podeTodas,
  organizacaoNome,
  className,
}: {
  modo: "equipe" | "master";
  vinculoId: string;
  nomeExibido: string;
  roleAtual: Papel;
  unidadeIdAtual: string | null;
  unidades: { id: string; nome: string }[];
  podeTodas: boolean;
  organizacaoNome: string;
  className: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [role, setRole] = useState<Papel>(roleAtual);
  const [unidade, setUnidade] = useState(unidadeIdAtual ?? "");
  const [erro, setErro] = useState<string | null>(null);

  // Organização inteira só para gestão e só para quem pode dar.
  const todasPermitida = role === "gestao" && podeTodas;
  const unidadeId = unidade || null;
  const faltaUnidade = !unidadeId && !todasPermitida;
  const semMudanca = role === roleAtual && unidadeId === unidadeIdAtual;
  const unidadeNome = unidadeId ? unidades.find((u) => u.id === unidadeId)?.nome ?? unidadeId : null;

  function abrir() {
    setRole(roleAtual);
    setUnidade(unidadeIdAtual ?? "");
    setErro(null);
    setAberto(true);
  }

  function trocarPapel(novo: Papel) {
    setRole(novo);
    // Operacional (ou quem não pode dar todas) não fica em "todas as unidades".
    if (!unidade && !(novo === "gestao" && podeTodas)) setUnidade(unidades.length === 1 ? unidades[0].id : "");
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r =
        modo === "equipe"
          ? await editarAcessoMembroAction(vinculoId, role, unidadeId)
          : await editarVinculoAction(vinculoId, role, unidadeId);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" disabled={pendente} onClick={abrir} className={className}>
        Editar acesso
      </button>

      <ModalFlutuante aberto={aberto} onFechar={() => setAberto(false)}>
        <h2 className="font-display text-xl font-bold text-azul-noite">Editar acesso</h2>
        <p className="mt-1 truncate text-sm text-cinza-medio" title={nomeExibido}>
          {nomeExibido}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className={ROTULO}>
            {modo === "equipe" ? "Função" : "Papel"}
            <select value={role} onChange={(e) => trocarPapel(e.target.value as Papel)} className={CAMPO}>
              <option value="operacional">Operacional (contagem e rotinas)</option>
              <option value="gestao">Gestão (vê tudo e cadastra a equipe)</option>
            </select>
          </label>
          <label className={ROTULO}>
            Unidade
            <select value={unidade} onChange={(e) => setUnidade(e.target.value)} className={CAMPO}>
              {todasPermitida ? (
                <option value="">Todas as unidades de {organizacaoNome}</option>
              ) : (
                <option value="" disabled>
                  Escolha a unidade
                </option>
              )}
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          <p className="rounded-md border border-cinza-claro bg-branco p-3 text-xs text-cinza">
            O acesso não é tirado: a pessoa continua com a mesma conta e a mesma senha, e o que ela pode ver muda na
            próxima tela que abrir.
          </p>
        </div>

        {erro && <p className="mt-3 text-xs text-vermelho">{erro}</p>}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pendente || faltaUnidade || semMudanca}
            onClick={salvar}
            className="rounded-md bg-azul-noite px-3 py-1.5 text-left text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50 sm:text-center"
          >
            {pendente
              ? "Salvando..."
              : semMudanca
                ? "Nada mudou"
                : faltaUnidade
                  ? "Escolha a unidade"
                  : textoSalvarEdicaoAcesso({ nome: nomeExibido, role, unidadeNome })}
          </button>
        </div>
      </ModalFlutuante>
    </>
  );
}
