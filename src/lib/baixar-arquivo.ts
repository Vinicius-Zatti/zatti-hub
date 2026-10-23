/** Baixa um arquivo gerado no navegador (CSV, imagem).
 *
 * O link vai para o body antes do clique e o endereço temporário só é
 * liberado depois de um minuto: o Safari começa o download de forma
 * assíncrona e, se o endereço some na hora, baixa um arquivo vazio ou não
 * baixa nada. */
export function baixarArquivo(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
