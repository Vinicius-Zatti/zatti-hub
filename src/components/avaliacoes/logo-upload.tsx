"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { salvarLogoAction } from "@/app/(app)/avaliacoes/actions";
import { AVISO_LOGO_BAIXA, LIMITE_LOGO_BYTES, qualidadeLogoImpressao } from "@/lib/avaliacoes/marca";

/** Trocar ou tirar a logo da pesquisa. O servidor confere o arquivo pelo conteúdo. */
export function LogoUpload({ temLogo }: { temLogo: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState<"trocar" | "tirar" | null>(null);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [previaBaixa, setPreviaBaixa] = useState(false);

  function abrir(j: "trocar" | "tirar") {
    setErro(null);
    setArquivo(null);
    if (previa) URL.revokeObjectURL(previa);
    setPrevia(null);
    setAberto(j);
  }

  function escolher(f: File | null) {
    setErro(null);
    if (previa) URL.revokeObjectURL(previa);
    setArquivo(f);
    setPreviaBaixa(false);
    setPrevia(f ? URL.createObjectURL(f) : null);
    if (f && f.size > LIMITE_LOGO_BYTES) setErro("A logo pode ter até 300 KB. Exporte numa resolução menor (500 px de largura basta).");
  }

  function enviar(remover: boolean) {
    setErro(null);
    const fd = new FormData();
    if (remover) fd.set("remover", "sim");
    else if (arquivo) fd.set("logo", arquivo);
    startTransition(async () => {
      const r = await salvarLogoAction(fd);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setAberto(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => abrir("trocar")} className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10">
          {temLogo ? "Trocar a logo" : "Colocar a logo"}
        </button>
        {temLogo && (
          <button type="button" onClick={() => abrir("tirar")} className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho hover:bg-vermelho/10">
            Tirar a logo
          </button>
        )}
      </div>
      <ModalFlutuante aberto={aberto !== null} onFechar={() => !pendente && setAberto(null)}>
        {aberto === "trocar" && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Logo do restaurante</h2>
            <p className="text-sm text-cinza">PNG ou JPEG de até 300 KB. Fundo transparente fica melhor. Ela aparece no topo da pesquisa e na arte do QR.</p>
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => escolher(e.target.files?.[0] ?? null)} className="text-sm" />
            {previa && (
              // Prévia local do arquivo escolhido (blob:).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previa}
                alt="Prévia da logo"
                onLoad={(e) => setPreviaBaixa(qualidadeLogoImpressao(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight).baixa)}
                className="max-h-32 self-center object-contain"
              />
            )}
            {previa && previaBaixa && (
              <p className="rounded-md border border-ambar/40 bg-ambar/10 p-2 text-xs text-azul-noite">
                {AVISO_LOGO_BAIXA} Na página do celular ela fica boa; dá para usar agora e trocar depois.
              </p>
            )}
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pendente || !arquivo || arquivo.size > LIMITE_LOGO_BYTES}
                onClick={() => enviar(false)}
                className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60"
              >
                {pendente ? "Enviando..." : "Usar esta logo na pesquisa e na arte"}
              </button>
              <button type="button" onClick={() => setAberto(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {aberto === "tirar" && (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">Tirar a logo?</h2>
            <p className="text-sm text-cinza">A pesquisa e a arte do QR passam a mostrar só o nome. A arte já impressa continua valendo (o QR não muda).</p>
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={pendente} onClick={() => enviar(true)} className="rounded-md bg-vermelho px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
                {pendente ? "Tirando..." : "Tirar a logo e mostrar só o nome"}
              </button>
              <button type="button" onClick={() => setAberto(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </ModalFlutuante>
    </>
  );
}
