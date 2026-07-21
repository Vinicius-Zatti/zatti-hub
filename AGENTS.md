<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Convenções fixas deste projeto

- **Toda tabela precisa de cabeçalho fixo (sticky)** — a pessoa rola a tabela
  e o cabeçalho continua visível, pra saber qual coluna é qual. Padrão: use
  `<Th>` de `src/components/tabela.tsx` em cada `<th>`, dentro de um
  container com `max-h-[70vh] overflow-auto` envolvendo a `<table>` (ver
  `visualizacao-contagens.tsx`). Regra fixada em 21/07/2026 — não pedir de
  novo, aplicar direto em toda tabela nova. `Produtos` e `Fornecedores` ainda
  não foram migrados pra esse padrão (tabelas de antes da regra).
- **Números vindos da planilha** (preço, quantidade, total etc.) só devem
  ser convertidos com `toNumeroBR` de `src/lib/sheets/numero.ts`. Nunca
  reimplementar o parser em outro arquivo — a versão antiga duplicada em 3
  arquivos tinha um bug (`R$ 4.073,40` virava `null` por causa da ordem
  errada de troca de ponto/vírgula) que sumia com qualquer valor >= 1000
  silenciosamente.
