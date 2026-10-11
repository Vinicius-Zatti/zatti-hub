"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const LADO_MAXIMO = 1280;
const QUALIDADE = 0.72;

/** Foto só pela câmera, dentro do app: abre a câmera com getUserMedia e
 * captura o quadro. Não existe seletor de arquivo, então não dá para mandar
 * foto da galeria pela tela. A hora que vale é a do servidor ao receber. */
export function CameraFoto({
  caminhoBase,
  aoEnviar,
  aoFechar,
}: {
  /** `<unidade>/<execucao>/<item>`; o nome do arquivo ganha um sufixo aleatório. */
  caminhoBase: string;
  aoEnviar: (caminho: string) => Promise<string | null>;
  aoFechar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const semCamera = typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia;
  const [erro, setErro] = useState<string | null>(
    semCamera ? "Este navegador não abre a câmera. Use o Chrome ou o Safari do celular." : null,
  );
  const [cameraPronta, setCameraPronta] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let cancelado = false;
    if (semCamera) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxo = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
          setCameraPronta(true);
        }
      })
      .catch(() => setErro("Não consegui abrir a câmera. Libere o acesso à câmera para o Zatti Hub no navegador."));
    return () => {
      cancelado = true;
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, [semCamera]);

  async function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setEnviando(true);
    setErro(null);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", QUALIDADE));
    if (!blob) {
      setErro("Não consegui gerar a foto. Tente de novo.");
      setEnviando(false);
      return;
    }
    const caminho = `${caminhoBase}-${crypto.randomUUID()}.jpg`;
    const supabase = createClient();
    const { error } = await supabase.storage
      .from("garante-evidencias")
      .upload(caminho, blob, { contentType: "image/jpeg", upsert: false });
    if (error) {
      setErro("A foto não subiu. Confira a internet e tente de novo.");
      setEnviando(false);
      return;
    }
    const falha = await aoEnviar(caminho);
    if (falha) {
      setErro(falha);
      setEnviando(false);
      return;
    }
    aoFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="h-full w-full flex-1 object-contain" />
      <div className="flex flex-col gap-2 bg-azul-noite p-4">
        {erro && <p className="text-sm text-branco">{erro}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={aoFechar}
            disabled={enviando}
            className="flex-1 rounded-md border border-branco/40 px-4 py-3 text-sm font-semibold text-branco"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={capturar}
            disabled={enviando || !cameraPronta}
            className="flex-[2] rounded-md bg-ambar px-4 py-3 text-sm font-bold text-azul-noite disabled:opacity-60"
          >
            {enviando ? "Enviando..." : "Tirar foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
