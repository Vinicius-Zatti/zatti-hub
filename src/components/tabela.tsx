/** Cabeçalho de tabela padrão do app: fica fixo (sticky) ao rolar, pra
 * pessoa não perder de vista qual coluna é qual. Toda tabela nova do app
 * usa isso + envolve a tabela num container com `max-h-[...] overflow-auto`
 * (ver `visualizacao-contagens.tsx` ou `edicao-grid.tsx`) — regra fixada
 * depois que a falta de cabeçalho fixo atrapalhou a leitura em 21/07/2026. */
export function Th({
  children,
  align = "left",
  fixo = false,
  estreito = false,
  larguraFixa,
  esquerda,
  soTelaLarga = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  /** Congela a coluna também na horizontal (fica visível rolando pros dois
   * lados) - usar só na coluna mais importante da tabela (ex: Nome). */
  fixo?: boolean;
  /** Cabeçalho curto que quebra linha (cada palavra numa linha, em vez de
   * forçar a coluna larga com tudo num renglão só) - usar em grupos de
   * coluna repetidos, ex: preço por canal em `tabela-precificacao.tsx`. */
  estreito?: boolean;
  /** Largura da coluna pensada pelo conteúdo (ex: uma data), não pelo texto
   * do cabeçalho - o rótulo quebra linha por palavra inteira pra caber
   * (nunca no meio da palavra, por isso sem `break-words`: uma palavra que
   * ainda não coubesse simplesmente estoura a largura em vez de partir).
   * Ex: `larguraFixa="96px"` numa coluna "Data de Competência" cujo
   * conteúdo é sempre "DD/MM/AAAA". */
  larguraFixa?: string;
  /** Com `fixo`, distância da borda esquerda: congela uma segunda coluna
   * logo depois da primeira (ex: Data 96px + Descrição em `esquerda="96px"`).
   * A célula do corpo precisa do mesmo `sticky` e `left`. */
  esquerda?: string;
  /** Com `fixo`, congela na horizontal só a partir de telas médias (no
   * celular duas colunas congeladas cobririam a área visível). */
  soTelaLarga?: boolean;
}) {
  const alinhamento = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const largura = larguraFixa ? "whitespace-normal" : estreito ? "max-w-[72px] whitespace-normal break-words" : "whitespace-nowrap";
  return (
    <th
      style={{
        ...(larguraFixa ? { width: larguraFixa, minWidth: larguraFixa } : {}),
        ...(fixo && esquerda && !soTelaLarga ? { left: esquerda } : {}),
        ...(fixo && soTelaLarga ? ({ "--th-esquerda": esquerda ?? "0px" } as React.CSSProperties) : {}),
      }}
      className={`sticky top-0 ${fixo ? (soTelaLarga ? "z-30 md:left-[var(--th-esquerda)]" : "left-0 z-30") : "z-20"} ${largura} bg-azul-petroleo px-3 py-2 font-semibold ${alinhamento}`}
    >
      {children}
    </th>
  );
}
