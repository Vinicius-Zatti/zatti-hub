/** Cabeçalho de tabela padrão do app: fica fixo (sticky) ao rolar, pra
 * pessoa não perder de vista qual coluna é qual. Toda tabela nova do app
 * usa isso + envolve a tabela num container com `max-h-[...] overflow-auto`
 * (ver `visualizacao-contagens.tsx` ou `edicao-grid.tsx`) — regra fixada
 * depois que a falta de cabeçalho fixo atrapalhou a leitura em 21/07/2026. */
export function Th({
  children,
  align = "left",
  fixo = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Congela a coluna também na horizontal (fica visível rolando pros dois
   * lados) - usar só na coluna mais importante da tabela (ex: Nome). */
  fixo?: boolean;
}) {
  const alinhamento = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      className={`sticky top-0 ${fixo ? "left-0 z-30" : "z-20"} whitespace-nowrap bg-azul-petroleo px-3 py-2 font-semibold ${alinhamento}`}
    >
      {children}
    </th>
  );
}
