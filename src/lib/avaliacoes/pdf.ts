// PDF de uma página com uma imagem JPEG ocupando a página inteira (arte do QR 10 x 15 cm).
// Escrito à mão (o formato é pequeno) para não trazer biblioteca de PDF para o navegador.
// Função pura: recebe os bytes do JPEG e devolve os bytes do PDF.

const PONTOS_POR_CM = 72 / 2.54;

function bytesAscii(texto: string): Uint8Array {
  const saida = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i++) saida[i] = texto.charCodeAt(i) & 0xff;
  return saida;
}

export function pdfComImagemJpeg(p: { jpeg: Uint8Array; larguraPx: number; alturaPx: number; larguraCm: number; alturaCm: number }): Uint8Array {
  const w = (p.larguraCm * PONTOS_POR_CM).toFixed(2);
  const h = (p.alturaCm * PONTOS_POR_CM).toFixed(2);
  const conteudo = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const partes: Uint8Array[] = [];
  const offsets: number[] = [];
  let tamanho = 0;
  const empurrar = (b: Uint8Array) => {
    partes.push(b);
    tamanho += b.length;
  };
  const objeto = (texto: string) => {
    offsets.push(tamanho);
    empurrar(bytesAscii(texto));
  };

  empurrar(bytesAscii("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
  objeto("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objeto("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objeto(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);
  objeto(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.larguraPx} /Height ${p.alturaPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
  );
  empurrar(p.jpeg);
  empurrar(bytesAscii("\nendstream\nendobj\n"));
  objeto(`5 0 obj\n<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream\nendobj\n`);

  const inicioXref = tamanho;
  const linhas = ["xref", "0 6", "0000000000 65535 f "];
  for (const o of offsets) linhas.push(`${String(o).padStart(10, "0")} 00000 n `);
  linhas.push("trailer", "<< /Size 6 /Root 1 0 R >>", "startxref", String(inicioXref), "%%EOF", "");
  empurrar(bytesAscii(linhas.join("\n")));

  const saida = new Uint8Array(tamanho);
  let pos = 0;
  for (const b of partes) {
    saida.set(b, pos);
    pos += b.length;
  }
  return saida;
}
