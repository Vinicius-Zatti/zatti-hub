"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { marcarTitularAction } from "@/app/(app)/acessos/actions";
import type { OrganizacaoPainel } from "@/app/(app)/acessos/dados";

const BOTAO_SECUNDARIO =
  "rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40";
const BOTAO_TIRAR =
  "rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho hover:bg-vermelho/10 disabled:opacity-40";

/** Titular da organização na tela Acessos (só master, 26/10/2026). Mesmo desenho do
 * "Quem acompanha o Garante": lista curta (gestão ativa do cliente), select nativo no modal.
 * O banco confere tudo de novo (`marcar_titular_organizacao`). */
export function TitularOrganizacao({ organizacao }: { organizacao: OrganizacaoPainel }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [janela, setJanela] = useState<"marcar" | "tirar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState("");
  const { titular, candidatosTitular: candidatos } = organizacao;
  const nomeEscolhido = candidatos.find((c) => c.vinculoId === escolhido)?.nome ?? null;

  function abrir(j: "marcar" | "tirar") {
    setErro(null);
    setEscolhido(titular?.valido ? titular.vinculoId : "");
    setJanela(j);
  }

  function rodar(vinculoId: string | null) {
    setErro(null);
    startTransition(async () => {
      const r = await marcarTitularAction(organizacao.id, vinculoId);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setJanela(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => abrir("marcar")} className={BOTAO_SECUNDARIO}>
          {titular ? "Trocar titular" : "Marcar titular"}
        </button>
        {titular && (
          <button type="button" onClick={() => abrir("tirar")} className={BOTAO_TIRAR}>
            Tirar titular
          </button>
        )}
      </div>

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela === "marcar" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (escolhido) rodar(escolhido);
            }}
            className="flex flex-col gap-3"
          >
            <h2 className="font-display text-lg font-bold text-azul-noite">Quem é o titular de {organizacao.nome}?</h2>
            <p className="text-sm text-cinza">
              O titular é quem pagou o app. Ele administra as permissões da equipe e vê Configurações. Senha,
              WhatsApp e acesso dele só a Zatti muda. Só uma pessoa por cliente, da gestão ativa.
            </p>
            {candidatos.length === 0 ? (
              <p className="text-sm text-vermelho">Ninguém da gestão ativa neste cliente. Cadastre antes.</p>
            ) : (
              <label className="text-xs font-semibold text-cinza-medio">
                Titular
                <select
                  required
                  value={escolhido}
                  onChange={(e) => setEscolhido(e.target.value)}
                  className="mt-1 w-full rounded-md border border-cinza-claro bg-branco px-2 py-1.5 text-sm"
                >
                  <option value="">Escolha...</option>
                  {candidatos.map((c) => (
                    <option key={c.vinculoId} value={c.vinculoId}>
                      {c.nome} · {c.alcance}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pendente || !escolhido}
                className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
              >
                {pendente ? "Salvando..." : nomeEscolhido ? `Marcar ${nomeEscolhido} como titular` : "Marcar como titular"}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </form>
        )}
        {janela === "tirar" && titular && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Tirar o titular de {organizacao.nome}?</h2>
            <p className="text-sm text-cinza">
              {titular.nome} deixa de ser titular. Sem titular, a gestão de todas as unidades volta a administrar as
              permissões e a ver Configurações, como antes.
            </p>
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(null)}
                className="rounded-md bg-vermelho px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
              >
                {pendente ? "Salvando..." : `Tirar ${titular.nome} de titular`}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </>
  );
}

/** Texto do titular atual, com o aviso quando ele deixou de valer. */
export function TextoTitular({ titular }: { titular: OrganizacaoPainel["titular"] }) {
  if (!titular) return <span className="text-cinza-medio">Sem titular (vale a gestão de todas as unidades)</span>;
  return (
    <span>
      {titular.nome}
      {!titular.valido && (
        <span className="ml-2 rounded-full bg-vermelho/10 px-2 py-0.5 text-xs font-semibold text-vermelho">
          não é mais gestão ativa
        </span>
      )}
    </span>
  );
}
