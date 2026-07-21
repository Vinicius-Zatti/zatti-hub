/** Gera a imagem de uma tabelinha de cotação (Item | Und | Qtd) e copia pra
 * área de transferência, pra colar direto no WhatsApp do fornecedor. Desenha
 * num <canvas> em vez de tirar print do DOM (html2canvas/dom-to-image) de
 * propósito: zero dependência nova e zero risco de a lib não entender as
 * cores do Tailwind v4. */

const CORES = {
  azulNoite: "#0d1f2d",
  azulPetroleo: "#1a3a52",
  ambar: "#c9882a",
  branco: "#ffffff",
  cinza: "#2c2c2c",
  cinzaMedio: "#6b6f72",
  cinzaClaro: "#dfdad0",
  offWhite: "#f5f0e8",
};

export type LinhaCotacao = { item: string; und: string; qtd: string };

function truncar(ctx: CanvasRenderingContext2D, texto: string, maxLargura: number): string {
  if (ctx.measureText(texto).width <= maxLargura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxLargura) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export async function gerarImagemCotacao(titulo: string, linhas: LinhaCotacao[]): Promise<Blob> {
  const escala = 2;
  const largura = 480;
  const alturaTopo = 56;
  const alturaCabecalhoTabela = 32;
  const alturaLinha = 34;
  const altura = alturaTopo + alturaCabecalhoTabela + linhas.length * alturaLinha + 12;

  const canvas = document.createElement("canvas");
  canvas.width = largura * escala;
  canvas.height = altura * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Esse navegador não sabe desenhar imagem (canvas indisponível).");
  ctx.scale(escala, escala);

  ctx.fillStyle = CORES.branco;
  ctx.fillRect(0, 0, largura, altura);

  ctx.fillStyle = CORES.azulNoite;
  ctx.fillRect(0, 0, largura, alturaTopo);
  ctx.fillStyle = CORES.ambar;
  ctx.font = "bold 10px Arial, sans-serif";
  ctx.fillText("ZATTI CONSULTORIA · PEDIDO DE COTAÇÃO", 16, 20);
  ctx.fillStyle = CORES.branco;
  ctx.font = "bold 19px Arial, sans-serif";
  ctx.fillText(truncar(ctx, titulo, largura - 32), 16, 43);

  let y = alturaTopo;
  ctx.fillStyle = CORES.azulPetroleo;
  ctx.fillRect(0, y, largura, alturaCabecalhoTabela);
  ctx.fillStyle = CORES.branco;
  ctx.font = "bold 12px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Item", 16, y + 21);
  ctx.fillText("Und", largura - 148, y + 21);
  ctx.textAlign = "right";
  ctx.fillText("Qtd", largura - 16, y + 21);
  y += alturaCabecalhoTabela;

  linhas.forEach((linha, i) => {
    ctx.fillStyle = i % 2 === 1 ? CORES.offWhite : CORES.branco;
    ctx.fillRect(0, y, largura, alturaLinha);

    ctx.textAlign = "left";
    ctx.fillStyle = CORES.cinza;
    ctx.font = "13px Arial, sans-serif";
    ctx.fillText(truncar(ctx, linha.item, largura - 175), 16, y + 22);

    ctx.fillStyle = CORES.cinzaMedio;
    ctx.fillText(linha.und, largura - 148, y + 22);

    ctx.textAlign = "right";
    ctx.fillStyle = CORES.azulNoite;
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.fillText(linha.qtd, largura - 16, y + 22);

    y += alturaLinha;
  });

  ctx.strokeStyle = CORES.cinzaClaro;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, largura - 1, altura - 1);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não deu pra gerar a imagem."));
    }, "image/png");
  });
}

export async function copiarImagemParaAreaDeTransferencia(blob: Blob): Promise<void> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    throw new Error("Esse navegador não deixa copiar imagem direto - baixei o arquivo em vez disso.");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function baixarImagem(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
