"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { gerarSenhaProvisoriaMembroAction } from "@/app/(app)/equipe/actions";
import { gerarSenhaProvisoriaAction } from "@/app/(app)/acessos/actions";
import { textoEnvioProvisoria } from "@/components/equipe/textos";

type Mensagem = { tom: "ok" | "aviso" | "erro"; texto: string };

/** Botão "Gerar senha provisória" para conta que já existe (24/10/2026).
 * `equipe`: a gestão do cliente; a provisória vai só pelo WhatsApp da pessoa.
 * `master`: tela Acessos; a provisória aparece uma vez aqui e, se pedido,
 * vai também pelo WhatsApp do vínculo. A regra de quem pode é do banco. */
export function GerarSenhaProvisoria({
  modo,
  vinculoId,
  nomeExibido,
  whatsappFinal,
  className,
}: {
  modo: "equipe" | "master";
  vinculoId: string;
  nomeExibido: string;
  whatsappFinal: string | null;
  className: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [enviarWhatsapp, setEnviarWhatsapp] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [gerada, setGerada] = useState<{ senha: string; validaAte: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const semWhatsappNaEquipe = modo === "equipe" && !whatsappFinal;

  function fechar() {
    // A provisória só aparece uma vez: fechar apaga da tela.
    setAberto(false);
    setGerada(null);
    setMensagem(null);
    setCopiado(false);
    setEnviarWhatsapp(false);
  }

  function gerar() {
    setMensagem(null);
    startTransition(async () => {
      if (modo === "equipe") {
        const r = await gerarSenhaProvisoriaMembroAction(vinculoId);
        if ("erro" in r) {
          setMensagem({ tom: "erro", texto: r.erro });
          return;
        }
        setMensagem(textoEnvioProvisoria(r.envio, true));
      } else {
        const r = await gerarSenhaProvisoriaAction(vinculoId, enviarWhatsapp);
        if ("erro" in r) {
          setMensagem({ tom: "erro", texto: r.erro });
          return;
        }
        setGerada({ senha: r.senha, validaAte: r.validaAte });
        if (r.envio) setMensagem(textoEnvioProvisoria(r.envio, false));
      }
      router.refresh();
    });
  }

  const concluido = gerada !== null || (modo === "equipe" && mensagem !== null && mensagem.tom !== "erro");

  return (
    <>
      <button type="button" disabled={pendente} onClick={() => setAberto(true)} className={className}>
        Gerar senha provisória
      </button>

      <ModalFlutuante aberto={aberto} onFechar={fechar}>
        <h2 className="font-display text-xl font-bold text-azul-noite">Gerar senha provisória</h2>
        <p className="mt-1 truncate text-sm text-cinza-medio" title={nomeExibido}>
          {nomeExibido}
        </p>

        {!concluido && (
          <div className="mt-4 flex flex-col gap-3 text-sm text-cinza">
            <p className="rounded-md border border-ambar/40 bg-ambar/10 p-3 text-azul-noite">
              A senha atual deixa de valer na hora e a pessoa sai de todos os aparelhos. Ela entra com a senha
              provisória (válida por 7 dias) e cria uma senha nova no primeiro acesso.
            </p>
            {modo === "equipe" ? (
              semWhatsappNaEquipe ? (
                <p className="text-vermelho">Cadastre o WhatsApp dessa pessoa antes (botão &quot;Trocar WhatsApp&quot;).</p>
              ) : (
                <p>A senha provisória vai para o WhatsApp final {whatsappFinal}. Você não vê a senha.</p>
              )
            ) : (
              <>
                <p>A senha provisória aparece uma única vez nesta tela, para você repassar à pessoa.</p>
                {whatsappFinal && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enviarWhatsapp}
                      onChange={(e) => setEnviarWhatsapp(e.target.checked)}
                    />
                    Enviar também pelo WhatsApp final {whatsappFinal}
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {gerada && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-cinza-medio">Senha provisória (aparece só agora)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all rounded-md border border-cinza-claro bg-branco px-3 py-2 font-mono text-lg tracking-wider text-azul-noite">
                {gerada.senha}
              </code>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(gerada.senha).then(
                    () => setCopiado(true),
                    () => setCopiado(false),
                  )
                }
                className="rounded-md border border-azul-petroleo px-3 py-2 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
              >
                {copiado ? "Copiada" : "Copiar"}
              </button>
            </div>
            <p className="text-xs text-cinza-medio">Vale até {gerada.validaAte}. Na tela de login, a pessoa usa o e-mail e esta senha.</p>
          </div>
        )}

        {mensagem && (
          <p
            className={`mt-3 text-xs ${mensagem.tom === "erro" ? "text-vermelho" : mensagem.tom === "aviso" ? "text-ambar" : "text-verde"}`}
          >
            {mensagem.texto}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={fechar}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
          >
            {concluido ? "Fechar" : "Cancelar"}
          </button>
          {!concluido && (
            <button
              type="button"
              disabled={pendente || semWhatsappNaEquipe}
              onClick={gerar}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50"
            >
              {pendente
                ? "Gerando..."
                : modo === "equipe"
                  ? "Invalidar a senha atual e enviar"
                  : "Invalidar a senha atual e gerar"}
            </button>
          )}
        </div>
      </ModalFlutuante>
    </>
  );
}
