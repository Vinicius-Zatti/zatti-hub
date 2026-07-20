# Zatti Hub

Plataforma multi-cliente da Zatti Consultoria. Primeiro módulo: Estoque,
Contagem e Pedido de Compras — construído pro Dom Quixote como piloto.

## Arquitetura (fase atual)

Por baixo, os dados de produto/estoque/fornecedor vivem na planilha Google
Sheets "Sistema M.E.G.A. - Template Zatti" (a mesma que já usamos com a Ana).
Isso é proposital: valida o modelo de dado e as regras de negócio na prática
antes de fixar num banco de verdade. Toda leitura/escrita passa por
`src/lib/sheets/` — quando migrarmos pra Postgres/Supabase, só essa camada
muda, as telas continuam iguais.

Login e permissão por perfil (Gestão / Operacional) via Supabase Auth —
ainda não ligado.

## Rodando localmente

1. `npm install`
2. Copiar `.env.local.example` pra `.env.local` e preencher as credenciais
   (ver instruções dentro do arquivo)
3. `npm run dev` e abrir http://localhost:3000

## Pendências pra ligar de verdade

- [ ] Criar service account no Google Cloud, compartilhar a planilha com o
      e-mail dela, colar as credenciais no `.env.local`
- [ ] Criar projeto no Supabase, ligar autenticação com os dois perfis
- [ ] Repositório no GitHub + deploy no Vercel
