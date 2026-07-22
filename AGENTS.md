<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Convenções fixas deste projeto

- **Toda tabela precisa de cabeçalho fixo (sticky)** — a pessoa rola a tabela
  e o cabeçalho continua visível, pra saber qual coluna é qual. Padrão: use
  `<Th>` de `src/components/tabela.tsx` em cada `<th>`, dentro de um
  container com `max-h-[70vh] overflow-auto` (ou `max-h-[50vh]` pra tabelas
  menores, tipo por-fornecedor) envolvendo a `<table>`. Regra fixada em
  21/07/2026 — não pedir de novo, aplicar direto em toda tabela nova. Já
  migradas: Produtos, Edição de Dados (Produtos e Fornecedores), Fornecedores,
  Visualização de Contagens, Pedido de Compras, Cotações da Semana.
- **Números vindos da planilha** (preço, quantidade, total etc.) só devem
  ser convertidos com `toNumeroBR` de `src/lib/sheets/numero.ts`. Nunca
  reimplementar o parser em outro arquivo — a versão antiga duplicada em 3
  arquivos tinha um bug (`R$ 4.073,40` virava `null` por causa da ordem
  errada de troca de ponto/vírgula) que sumia com qualquer valor >= 1000
  silenciosamente.
- **Campo numérico editável com ponto de milhares**: use `CampoNumero` de
  `src/components/campo-numero.tsx` em vez de `<input type="number">` cru.
  Mostra formatado (`1.234,50`) fora de foco, valor cru pra digitar.
- **Estrutura de cada seção do Estoque**: aba mestre (a página raiz, ex.
  `/estoque/pedidos`) + subpáginas em pastas dentro dela, com um
  `layout.tsx` próprio montando `<SubTabs>` (`src/components/sub-tabs.tsx`).
  Todo módulo novo segue esse padrão — nunca cria aba nova direto no menu
  principal do Estoque (`src/app/(app)/estoque/layout.tsx`), que fica travado
  em Produtos | Contagem | Pedidos | Fornecedores. Se o SubTabs tiver hrefs
  em que um é prefixo do outro (ex. `/estoque/contagem` e
  `/estoque/contagem/visualizacao`), o componente já resolve isso sozinho
  (match mais específico fica ativo) — não precisa se preocupar.
- **Função pura usada tanto no servidor quanto em componente client** (ex.
  agrupar/ordenar dados já carregados) não pode morar em `src/lib/sheets/*`
  nem importar de lá — isso arrasta `googleapis` (e o Node core) pro bundle
  do navegador e quebra o build. Colocar em `src/lib/*.ts` neutro (ver
  `lib/pedido.ts`, `lib/fornecedor.ts`) e importar dos dois lados.
- **Compartilhar imagem pro fornecedor** (Cotações da Semana): usa
  `src/lib/canvas-tabela.ts`, que desenha a tabelinha num `<canvas>` (zero
  dependência nova) e tenta `compartilharOuCopiarImagem` — Web Share API
  primeiro (abre o menu nativo de compartilhar, evita pré-visualização
  estranha no celular), cai pra copiar pro clipboard, e por último baixa o
  arquivo. Reaproveitar essas funções pra qualquer nova tela que precise
  mandar imagem pro fornecedor, não recriar o desenho do zero.
- **Conversão de unidade base pra embalagem do fornecedor** ("15 latas" →
  "2 fardos"): sempre arredondar pra cima (`Math.ceil`), nunca pra baixo —
  ver `valorExibido`/`itemIncompleto` em `cotacoes-semana.tsx`. Produto sem
  `nomeCompra`/`unidadeEmbalagemFornecedor`/`qtdUnidadeBasePorEmbalagem`
  cadastrados é tratado como cadastro incompleto: bloqueia compartilhar e
  aponta pra Produtos → Edição de Dados, nunca deixa mandar pro fornecedor
  um pedido com conta errada.
- **Multiempresa de verdade (login, 22/07)**: o app deixou de ser mono-tenant.
  Toda página/Server Action que precisa saber qual planilha ler chama
  `getAcessoAtual()` de `src/lib/acesso.ts` primeiro — ela resolve
  organização/unidade/papel direto da sessão logada (Supabase) e devolve
  `spreadsheetId` já certo. Nunca aceitar um id de unidade/planilha vindo de
  formulário, `searchParams` ou qualquer input do usuário. Toda action que só
  Gestão pode chamar usa `requireGestao()` em vez de `getAcessoAtual()` — ela
  redireciona quem não é Gestão, e é a barreira que vale de verdade (o
  layout que esconde a aba do menu é só UX, não segurança). Mutações
  relevantes (criar/editar produto, fornecedor, contagem) chamam
  `registrarAuditoria()` depois de gravar. Nome de cliente pra textos
  voltados ao fornecedor vem de `acesso.organizacaoNome`, nunca mais
  hardcoded.
