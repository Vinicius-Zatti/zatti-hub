"use client";

import { useRef, useState, useTransition } from "react";
import { enviarFotoFichaAction, removerFotoFichaAction } from "@/app/(app)/fichas-tecnicas/actions";
import { TAMANHO_MAXIMO_FOTO_FICHA, tentativasReducao, type TipoFotoFicha } from "@/lib/foto-ficha";

function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolver, rejeitar) => {
    const url = URL.createObjectURL(arquivo);
    const imagem = new Image();
    imagem.onload = () => {
      URL.revokeObjectURL(url);
      resolver(imagem);
    };
    imagem.onerror = () => {
      URL.revokeObjectURL(url);
      rejeitar(new Error("Não consegui abrir essa foto. Use uma foto JPG, PNG ou WebP."));
    };
    imagem.src = url;
  });
}

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: TipoFotoFicha, qualidade: number): Promise<Blob | null> {
  return new Promise((resolver) => canvas.toBlob(resolver, tipo, qualidade));
}

/** Reduz no próprio aparelho até caber em 300 KB (foto de celular sai com
 * 3 a 8 MB). WebP quando o navegador sabe gerar; senão JPEG. A orientação
 * da câmera já vem aplicada pelo `<img>` ao desenhar no canvas. */
async function reduzirFoto(arquivo: File): Promise<Blob> {
  const imagem = await carregarImagem(arquivo);
  const canvas = document.createElement("canvas");
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("Este navegador não conseguiu reduzir a foto.");

  let tipo: TipoFotoFicha = "image/webp";
  let desenhado = "";
  for (const tentativa of tentativasReducao(imagem.naturalWidth, imagem.naturalHeight)) {
    const tamanho = `${tentativa.largura}x${tentativa.altura}`;
    if (desenhado !== tamanho) {
      desenhado = tamanho;
      canvas.width = tentativa.largura;
      canvas.height = tentativa.altura;
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    }
    let blob = await canvasParaBlob(canvas, tipo, tentativa.qualidade);
    if (blob && blob.type !== tipo) {
      tipo = "image/jpeg";
      blob = await canvasParaBlob(canvas, tipo, tentativa.qualidade);
    }
    if (blob && blob.type === tipo && blob.size <= TAMANHO_MAXIMO_FOTO_FICHA) return blob;
  }
  throw new Error("Não consegui deixar essa foto com até 300 KB. Tente outra foto.");
}

/** Foto opcional da ficha. Todos os papéis veem; só Gestão/master troca ou
 * remove. Estado próprio (não depende de recarregar a ficha inteira), assim
 * funciona igual na rota `/fichas-tecnicas/[id]` e na janela da listagem. */
export function FotoFichaTecnica({
  fichaId,
  nomeFicha,
  fotoUrlInicial,
  podeGerir,
}: {
  fichaId: string;
  nomeFicha: string;
  fotoUrlInicial: string | null;
  podeGerir: boolean;
}) {
  const [fotoUrl, setFotoUrl] = useState(fotoUrlInicial);
  const [fotoQuebrada, setFotoQuebrada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<"reduzindo" | "enviando" | null>(null);
  const [isPending, startTransition] = useTransition();
  const entradaRef = useRef<HTMLInputElement>(null);
  const ocupado = etapa !== null || isPending;

  if (!fotoUrl && !podeGerir) return null;

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setEtapa("reduzindo");
    let blob: Blob;
    try {
      blob = await reduzirFoto(arquivo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui preparar a foto.");
      setEtapa(null);
      return;
    }
    setEtapa("enviando");
    try {
      const formData = new FormData();
      formData.set("id", fichaId);
      formData.set("foto", blob, blob.type === "image/webp" ? "foto.webp" : "foto.jpg");
      const resultado = await enviarFotoFichaAction(formData);
      if (!resultado.ok) {
        setErro(resultado.mensagem);
        return;
      }
      setFotoUrl(resultado.fotoUrl);
      setFotoQuebrada(false);
    } catch {
      setErro("Sem conexão para enviar a foto. Confira a internet e tente de novo.");
    } finally {
      setEtapa(null);
    }
  }

  function remover() {
    setErro(null);
    startTransition(async () => {
      try {
        const resultado = await removerFotoFichaAction(fichaId);
        if (!resultado.ok) {
          setErro(resultado.mensagem);
          return;
        }
        setFotoUrl(null);
      } catch {
        setErro("Sem conexão para remover a foto. Confira a internet e tente de novo.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-cinza-claro bg-branco p-4">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Foto</div>
      {fotoUrl && !fotoQuebrada ? (
        // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporário do bucket privado
        <img src={fotoUrl} alt={`Foto de ${nomeFicha}`} className="max-h-80 w-full rounded-md bg-cinza-claro/30 object-contain"
          onError={() => setFotoQuebrada(true)}
        />
      ) : (
        <p className="text-sm text-cinza-medio">
          {fotoUrl ? "A foto não carregou. Anexe de novo se ela tiver se perdido." : "Nenhuma foto anexada."}
        </p>
      )}

      {podeGerir && (
        <>
          <input
            ref={entradaRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              void escolher(arquivo);
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => entradaRef.current?.click()}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50"
            >
              {etapa === "reduzindo"
                ? "Reduzindo foto..."
                : etapa === "enviando"
                  ? "Enviando..."
                  : fotoUrl
                    ? "Trocar foto"
                    : "Anexar foto"}
            </button>
            {fotoUrl && (
              <button
                type="button"
                disabled={ocupado}
                onClick={remover}
                className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho disabled:opacity-50"
              >
                {isPending ? "Removendo..." : "Remover foto"}
              </button>
            )}
            <span className="text-xs text-cinza-medio">A foto é reduzida para até 300 KB antes de subir.</span>
          </div>
        </>
      )}
      {erro && <p className="mt-2 text-xs text-vermelho">{erro}</p>}
    </div>
  );
}
