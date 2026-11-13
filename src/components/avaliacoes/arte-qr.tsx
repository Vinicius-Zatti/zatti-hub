"use client";

import { useEffect, useRef, useState } from "react";
import { baixarArquivo } from "@/lib/baixar-arquivo";
import { ARTE, CHAMADA_ARTE, matrizQr, nomeArquivoArte, rotuloArte, subtituloArte } from "@/lib/avaliacoes/qr";
import { pdfComImagemJpeg } from "@/lib/avaliacoes/pdf";
import type { Origem } from "@/lib/avaliacoes/perguntas";
import { AVISO_LOGO_BAIXA, corTextoSobre, ESPACO_LOGO_ARTE, qualidadeLogoImpressao } from "@/lib/avaliacoes/marca";

type Props = {
  origem: Origem;
  url: string;
  slug: string;
  nome: string;
  corPrincipal: string;
  corFundo: string;
  /** Logo como data URL (vem do servidor), para o canvas não ficar bloqueado por outra origem. */
  logoDataUrl: string | null;
  /** Roleta ligada: a arte dos apps chama para o prêmio. */
  roleta?: boolean;
};

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const palavras = texto.split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width > largura && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function caixaArredondada(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Desenha a arte 10 x 15 cm (300 dpi) no canvas: logo (ou nome), chamada, QR em cartão branco
 * (sempre escuro no claro, para qualquer celular ler), instrução e o endereço por extenso. */
async function desenharArte(canvas: HTMLCanvasElement, p: Props): Promise<void> {
  const { larguraPx: W, alturaPx: H } = ARTE;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const fonte = getComputedStyle(document.body).fontFamily || "sans-serif";
  const texto = corTextoSobre(p.corFundo);
  const margem = 90;

  ctx.fillStyle = p.corFundo;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = p.corPrincipal;
  ctx.fillRect(0, 0, W, 28);
  ctx.fillRect(0, H - 28, W, 28);

  // Topo: logo ou nome.
  let y = 110;
  let logoDesenhada = false;
  if (p.logoDataUrl) {
    try {
      const img = new Image();
      img.src = p.logoDataUrl;
      await img.decode();
      const maxW = ESPACO_LOGO_ARTE.largura;
      const maxH = ESPACO_LOGO_ARTE.altura;
      const escala = Math.min(maxW / (img.naturalWidth || maxW), maxH / (img.naturalHeight || maxH));
      const w = (img.naturalWidth || maxW) * escala;
      const h = (img.naturalHeight || maxH) * escala;
      ctx.drawImage(img, (W - w) / 2, y + (maxH - h) / 2, w, h);
      logoDesenhada = true;
    } catch {
      logoDesenhada = false;
    }
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (!logoDesenhada) {
    ctx.fillStyle = texto;
    ctx.font = `700 96px ${fonte}`;
    const linhasNome = quebrarLinhas(ctx, p.nome, W - margem * 2).slice(0, 2);
    linhasNome.forEach((l, i) => ctx.fillText(l, W / 2, y + 110 + i * 110));
  }
  y += 260 + 90;

  // Chamada.
  ctx.fillStyle = texto;
  ctx.font = `700 92px ${fonte}`;
  const linhasChamada = quebrarLinhas(ctx, CHAMADA_ARTE, W - margem * 2);
  linhasChamada.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 104));
  y += linhasChamada.length * 104 + 10;

  // QR em cartão branco.
  const matriz = matrizQr(p.url);
  const n = matriz.length + 8;
  const ladoCartao = 760;
  const modulo = Math.floor(ladoCartao / n);
  const ladoQr = modulo * n;
  const xCartao = (W - ladoQr) / 2;
  ctx.fillStyle = "#FFFFFF";
  caixaArredondada(ctx, xCartao - 20, y - 20, ladoQr + 40, ladoQr + 40, 36);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = p.corPrincipal;
  ctx.stroke();
  ctx.fillStyle = "#111111";
  for (let l = 0; l < matriz.length; l++) {
    for (let c = 0; c < matriz.length; c++) {
      if (matriz[l][c]) ctx.fillRect(xCartao + (c + 4) * modulo, y + (l + 4) * modulo, modulo, modulo);
    }
  }
  y += ladoQr + 20 + 90;

  // Instrução e endereço.
  ctx.fillStyle = texto;
  ctx.font = `500 46px ${fonte}`;
  const linhasSub = quebrarLinhas(ctx, subtituloArte(p.origem, p.roleta === true), W - margem * 2);
  linhasSub.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 58));
  y += linhasSub.length * 58 + 30;
  ctx.font = `400 30px ${fonte}`;
  ctx.globalAlpha = 0.75;
  ctx.fillText(p.url.replace(/^https:\/\//, ""), W / 2, Math.min(y, H - 70));
  ctx.globalAlpha = 1;
}

function blobDoCanvas(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))), tipo, qualidade));
}

/** Uma arte (mesa ou delivery): prévia e botões de baixar em PNG e PDF. */
export function ArteQr(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  // A arte está pronta quando o último desenho terminado é o do conteúdo atual.
  const chave = [p.url, p.nome, p.corPrincipal, p.corFundo, p.logoDataUrl ?? "", p.origem, p.roleta ? "roleta" : ""].join("|");
  const [desenhada, setDesenhada] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Resultado guardado com a logo medida: trocar a logo não mostra o aviso da anterior.
  const [medida, setMedida] = useState<{ logo: string; baixa: boolean } | null>(null);
  const pronta = desenhada === chave;
  const { url, nome, corPrincipal, corFundo, logoDataUrl, origem, slug, roleta } = p;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let vivo = true;
    desenharArte(canvas, { url, nome, corPrincipal, corFundo, logoDataUrl, origem, slug, roleta })
      .then(() => {
        if (vivo) setDesenhada(chave);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível montar a arte. Recarregue a página.");
      });
    return () => {
      vivo = false;
    };
  }, [chave, url, nome, corPrincipal, corFundo, logoDataUrl, origem, slug, roleta]);

  // Logo pequena demais para 300 dpi: avisa antes de imprimir (13/11/2026).
  useEffect(() => {
    if (!logoDataUrl) return;
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (vivo) setMedida({ logo: logoDataUrl, baixa: qualidadeLogoImpressao(img.naturalWidth, img.naturalHeight).baixa });
    };
    img.src = logoDataUrl;
    return () => {
      vivo = false;
    };
  }, [logoDataUrl]);

  async function baixarPng() {
    if (!ref.current) return;
    setErro(null);
    try {
      baixarArquivo(await blobDoCanvas(ref.current, "image/png"), nomeArquivoArte(p.slug, p.origem, "png"));
    } catch {
      setErro("Não foi possível gerar o PNG.");
    }
  }

  async function baixarPdf() {
    if (!ref.current) return;
    setErro(null);
    try {
      const jpeg = new Uint8Array(await (await blobDoCanvas(ref.current, "image/jpeg", 0.95)).arrayBuffer());
      const pdf = pdfComImagemJpeg({ jpeg, larguraPx: ARTE.larguraPx, alturaPx: ARTE.alturaPx, larguraCm: ARTE.larguraCm, alturaCm: ARTE.alturaCm });
      baixarArquivo(new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" }), nomeArquivoArte(p.slug, p.origem, "pdf"));
    } catch {
      setErro("Não foi possível gerar o PDF.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
      <h2 className="font-display text-lg font-bold text-azul-noite">{rotuloArte(p.origem)}</h2>
      <canvas ref={ref} className="w-full max-w-[280px] self-center rounded border border-cinza-claro shadow-sm" aria-label={`Arte do QR para ${rotuloArte(p.origem).toLowerCase()}`} />
      <p className="break-all text-xs text-cinza-medio">O QR abre {p.url}</p>
      {logoDataUrl && medida?.logo === logoDataUrl && medida.baixa && <p className="rounded-md border border-ambar/40 bg-ambar/10 p-2 text-xs text-azul-noite">{AVISO_LOGO_BAIXA}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!pronta} onClick={baixarPdf} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
          Baixar PDF para imprimir (10 x 15 cm)
        </button>
        <button
          type="button"
          disabled={!pronta}
          onClick={baixarPng}
          className="rounded-md border border-azul-petroleo px-3 py-2 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10 disabled:opacity-40"
        >
          Baixar PNG em alta (300 dpi)
        </button>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
    </div>
  );
}
