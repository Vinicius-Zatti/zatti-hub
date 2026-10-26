"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarWhatsappMembroAction,
  reativarMembroAction,
  reenviarAcessoMembroAction,
  revogarMembroAction,
} from "@/app/(app)/equipe/actions";
import type { MembroEquipe } from "@/app/(app)/equipe/dados";
import { GerarSenhaProvisoria } from "@/components/gerar-senha-provisoria";
import { EditarAcesso } from "@/components/editar-acesso";
import { PermissoesMembro, type PessoaPermissoes } from "@/components/equipe/permissoes-membro";
import { ROTULO_FUNCAO, textoEnvio } from "./textos";

const SITUACAO: Record<MembroEquipe["situacao"], { texto: string; classe: string }> = {
  ativo: { texto: "Ativo", classe: "bg-verde/10 text-verde" },
  aguardando: { texto: "Aguardando primeiro acesso", classe: "bg-ambar/15 text-ambar" },
  revogado: { texto: "Sem acesso", classe: "bg-cinza-claro text-cinza-medio" },
};

const BOTAO = "rounded-md border px-2 py-1 text-xs font-semibold disabled:opacity-40";

// Número mascarado na lista (veredito do Codex, item 7); a gestão troca
// pelo "Trocar WhatsApp" quando precisa.
function formatarWhatsapp(final: string | null): string {
  return final ? `WhatsApp final ${final}` : "sem WhatsApp";
}

export function CartaoMembro({
  membro,
  unidades,
  podeTodas,
  organizacaoNome,
  podeEditar = true,
  podeMexerNaConta = true,
  equipePermissoes = null,
}: {
  membro: MembroEquipe;
  /** Unidades que quem está logado pode dar (gestor de loja: só a dele). */
  unidades: { id: string; nome: string }[];
  /** Pode dar "todas as unidades" (gestão da organização inteira ou master). */
  podeTodas: boolean;
  organizacaoNome: string;
  /** Equipe em "editar" (fase 6). Só "ver": o cartão fica sem nenhum botão. */
  podeEditar?: boolean;
  /** Conta do titular (26/10/2026): senha provisória, WhatsApp, editar e tirar acesso só a Zatti. */
  podeMexerNaConta?: boolean;
  /** Quem administra permissões (master ou o titular) recebe a equipe para o botão
   * "Permissões" e o "Copiar de...". `null` = sem o botão. */
  equipePermissoes?: PessoaPermissoes[] | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [numero, setNumero] = useState("");
  const [mensagem, setMensagem] = useState<{ tom: "ok" | "aviso" | "erro"; texto: string } | null>(null);
  const situacao = SITUACAO[membro.situacao];

  function rodar(acao: () => Promise<{ ok: true } | { erro: string } | { ok: true; envio: "aceito" | "falhou" | "incerto" }>) {
    setMensagem(null);
    startTransition(async () => {
      const r = await acao();
      if ("erro" in r) {
        setMensagem({ tom: "erro", texto: r.erro });
        return;
      }
      if ("envio" in r) setMensagem(textoEnvio(r.envio, membro.situacao === "ativo"));
      setEditando(false);
      router.refresh();
    });
  }

  function confirmarRevogar() {
    if (window.confirm(`Tirar o acesso de ${membro.nome ?? membro.email}?`)) {
      rodar(() => revogarMembroAction(membro.vinculoId));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-azul-noite">
            {membro.nome ?? membro.email}
            {membro.ehVoce && <span className="ml-1 text-xs font-normal text-cinza-medio">(você)</span>}
            {membro.ehTitular && (
              <span
                className="ml-2 rounded-full bg-ambar/15 px-2 py-0.5 text-[10px] font-semibold text-ambar"
                title="Responsável pelo cliente no Zatti Hub. Só a Zatti troca."
              >
                Titular
              </span>
            )}
          </p>
          <p className="truncate text-xs text-cinza-medio">{membro.email}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${situacao.classe}`}>{situacao.texto}</span>
      </div>
      <p className="text-xs text-cinza">
        {ROTULO_FUNCAO[membro.role]} · {membro.unidadeNome} · {formatarWhatsapp(membro.whatsappFinal)}
      </p>
      {membro.envioStatus && membro.envioStatus !== "aceito" && membro.situacao !== "revogado" && (
        <p className="text-xs text-ambar">
          {membro.envioStatus === "incerto" ? "Último envio sem confirmação." : "Último envio não saiu."}
        </p>
      )}

      {!membro.ehVoce && podeEditar && !podeMexerNaConta && (
        <p className="text-xs text-cinza-medio">Acesso do titular: só a Zatti muda senha, WhatsApp e acesso.</p>
      )}

      {!membro.ehVoce && podeEditar && (
        <div className="flex flex-wrap gap-2">
          {membro.situacao !== "revogado" && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => reenviarAcessoMembroAction(membro.vinculoId))}
              className={`${BOTAO} border-azul-petroleo text-azul-petroleo hover:bg-azul-petroleo/10`}
            >
              {membro.situacao === "aguardando" ? "Reenviar senha" : "Reenviar acesso"}
            </button>
          )}
          {membro.situacao === "ativo" && podeMexerNaConta && (
            <GerarSenhaProvisoria
              modo="equipe"
              vinculoId={membro.vinculoId}
              nomeExibido={membro.nome ?? membro.email}
              whatsappFinal={membro.whatsappFinal}
              className={`${BOTAO} border-ambar text-ambar hover:bg-ambar/10`}
            />
          )}
          {podeMexerNaConta && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => setEditando((v) => !v)}
              className={`${BOTAO} border-cinza-claro text-cinza hover:bg-off-white`}
            >
              Trocar WhatsApp
            </button>
          )}
          {membro.situacao !== "revogado" && podeMexerNaConta && (
            <EditarAcesso
              modo="equipe"
              vinculoId={membro.vinculoId}
              nomeExibido={membro.nome ?? membro.email}
              roleAtual={membro.role}
              unidadeIdAtual={membro.unidadeId}
              unidades={unidades}
              podeTodas={podeTodas}
              organizacaoNome={organizacaoNome}
              className={`${BOTAO} border-azul-noite text-azul-noite hover:bg-azul-noite/10`}
            />
          )}
          {membro.situacao !== "revogado" && equipePermissoes && (
            <PermissoesMembro
              pessoa={{
                vinculoId: membro.vinculoId,
                nome: membro.nome ?? membro.email,
                role: membro.role,
                ehDono: membro.ehDono,
                excecoes: membro.excecoes,
              }}
              outras={equipePermissoes}
              className={`${BOTAO} border-azul-petroleo text-azul-petroleo hover:bg-azul-petroleo/10`}
            />
          )}
          {membro.situacao === "revogado" ? (
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => reativarMembroAction(membro.vinculoId))}
              className={`${BOTAO} border-verde text-verde hover:bg-verde/10`}
            >
              Devolver acesso
            </button>
          ) : !podeMexerNaConta ? null : (
            <button
              type="button"
              disabled={pendente}
              onClick={confirmarRevogar}
              className={`${BOTAO} border-vermelho text-vermelho hover:bg-vermelho/10`}
            >
              Tirar acesso
            </button>
          )}
        </div>
      )}

      {editando && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => atualizarWhatsappMembroAction(membro.vinculoId, numero));
          }}
          className="flex gap-2"
        >
          <input
            type="tel"
            inputMode="tel"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="31 99999-8888"
            className="w-full rounded-md border border-cinza-claro px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={pendente}
            className="rounded-md bg-azul-noite px-3 py-1 text-xs font-semibold text-branco disabled:opacity-60"
          >
            Salvar
          </button>
        </form>
      )}

      {mensagem && (
        <p className={`text-xs ${mensagem.tom === "erro" ? "text-vermelho" : mensagem.tom === "aviso" ? "text-ambar" : "text-verde"}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
