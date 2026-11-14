"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarExtrasParcialAction, salvarMarcaParcialAction } from "@/app/(app)/avaliacoes/actions";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO } from "./ui";

type Campo = "nomeExibido" | "textoAgradecimento" | "linkGoogle" | "linkPedidoDireto";

function salvarCampo(campo: Campo, v: string) {
  return campo === "linkPedidoDireto" ? salvarExtrasParcialAction({ linkPedidoDireto: v }) : salvarMarcaParcialAction({ [campo]: v });
}

/** Um campo com o próprio "Salvar", que só aparece quando o valor muda (14/11/2026: cada bloco da
 * tela Configurar salva sozinho, nada de um botão para três coisas). */
export function CampoSalvavel({
  titulo,
  explicacao,
  valor,
  campo,
  multilinha = false,
  maximo,
  placeholder,
  tipo = "text",
  podeEditar,
  vazio,
}: {
  titulo: string;
  explicacao?: React.ReactNode;
  valor: string;
  campo: Campo;
  multilinha?: boolean;
  maximo?: number;
  placeholder?: string;
  tipo?: "text" | "url";
  podeEditar: boolean;
  /** Texto quando está vazio (só leitura). */
  vazio?: string;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(valor);
  const [base, setBase] = useState(valor);
  if (valor !== base) {
    setBase(valor);
    setTexto(valor);
  }
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ erro: boolean; texto: string } | null>(null);
  const mudou = texto.trim() !== valor.trim();

  function salvar() {
    setAviso(null);
    startTransition(async () => {
      const r = await salvarCampo(campo, texto.trim());
      if ("erro" in r) return setAviso({ erro: true, texto: r.erro });
      setAviso({ erro: false, texto: "Salvo." });
      router.refresh();
    });
  }

  const id = `campo-${titulo.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-azul-noite">
        {titulo}
      </label>
      {explicacao && <p className="text-xs text-cinza-medio">{explicacao}</p>}
      {podeEditar ? (
        <>
          {multilinha ? (
            <textarea id={id} className={CAMPO} rows={2} value={texto} maxLength={maximo} placeholder={placeholder} onChange={(e) => setTexto(e.target.value)} />
          ) : (
            <input id={id} className={CAMPO} type={tipo} inputMode={tipo === "url" ? "url" : undefined} value={texto} maxLength={maximo} placeholder={placeholder} onChange={(e) => setTexto(e.target.value)} />
          )}
          {mudou && (
            <div className="mt-1 flex gap-2">
              <button type="button" disabled={pendente} onClick={salvar} className={BOTAO_PRIMARIO}>
                {pendente ? "Salvando..." : "Salvar"}
              </button>
              <button type="button" disabled={pendente} onClick={() => setTexto(valor)} className={BOTAO_SECUNDARIO}>
                Desfazer
              </button>
            </div>
          )}
          {aviso && <p className={`text-xs font-semibold ${aviso.erro ? "text-vermelho" : "text-verde"}`}>{aviso.texto}</p>}
        </>
      ) : (
        <p className="text-sm text-cinza">{valor || vazio || "-"}</p>
      )}
    </div>
  );
}
