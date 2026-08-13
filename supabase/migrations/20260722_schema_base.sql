-- Zatti Hub - schema de autenticação e multiempresa.
--
-- Formalizado como migration (13/08, trabalho do Painel de Acessos):
-- `supabase/schema.sql` nunca tinha sido convertido pra migration nesta
-- branch - o cabeçalho original dizia "rodar no SQL Editor, uma vez", e
-- funciona pra atualizar produção (já criada manualmente), mas quebra
-- `supabase start`/`supabase db reset` num banco vazio: a primeira
-- migration real (`20260807_estoque_no_banco.sql`) referencia
-- `unidades(id)` e falha com "relation unidades does not exist", porque
-- `schema.sql` nunca roda nesse fluxo. Sem isso, não dava pra montar um
-- banco local do zero pra testar o Painel de Acessos. Conteúdo idêntico ao
-- `supabase/schema.sql` que já existe neste repositório - só reposicionado
-- pra rodar automaticamente na ordem certa. `supabase/schema.sql` continua
-- no repositório como registro histórico, não foi apagado.

create extension if not exists pgcrypto;

create table if not exists organizacoes (
  id text primary key,
  nome text not null,
  tipo_cliente text not null check (tipo_cliente in ('consultoria', 'saas', 'hybrid')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists unidades (
  id text primary key,
  organizacao_id text not null references organizacoes(id),
  nome text not null,
  -- Nulo = login já pode ser criado e convidado, mas a planilha desse
  -- cliente ainda não existe/foi conectada. `getAcessoAtual()` manda pra
  -- /planilha-pendente nesse caso, em vez de tentar ler uma planilha que
  -- não existe.
  spreadsheet_id text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  created_at timestamptz not null default now()
);

create table if not exists vinculos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organizacao_id text not null references organizacoes(id),
  -- nulo = acesso a todas as unidades ativas dessa organização (dono de
  -- rede, ex. cliente com mais de uma loja).
  unidade_id text references unidades(id),
  -- master = enxerga toda organização ativa da plataforma automaticamente
  -- (equipe Zatti), sem precisar de um vínculo por cliente. organizacao_id
  -- nesse caso é só uma âncora pra satisfazer a foreign key, não limita o
  -- acesso - ver RLS de organizacoes/unidades abaixo e getAcessoAtual().
  role text not null check (role in ('gestao', 'operacional', 'master')),
  status text not null default 'ativo' check (status in ('convidado', 'ativo', 'revogado')),
  created_at timestamptz not null default now()
);

create table if not exists logs_auditoria (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references unidades(id),
  user_id uuid not null references auth.users(id),
  acao text not null,
  entidade text not null,
  entidade_id text not null,
  dados_antigos jsonb,
  dados_novos jsonb,
  criado_em timestamptz not null default now()
);

alter table organizacoes enable row level security;
alter table unidades enable row level security;
alter table perfis enable row level security;
alter table vinculos enable row level security;
alter table logs_auditoria enable row level security;

-- Perfis: cada um só lê o próprio.
create policy "perfis_select_own" on perfis
  for select using (id = auth.uid());

-- Vínculos: cada um só lê os próprios - é o ponto de partida de toda
-- resolução de acesso, não pode depender de outra tabela pra funcionar.
create policy "vinculos_select_own" on vinculos
  for select using (user_id = auth.uid());

-- Unidades: quem tem vínculo ativo (direto, ou via unidade_id nulo =
-- organização inteira) enxerga a linha - ou quem tem qualquer vínculo
-- "master", que enxerga toda unidade de toda organização.
create policy "unidades_select_por_vinculo" on unidades
  for select using (
    exists (
      select 1 from vinculos v
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and (
          v.role = 'master'
          or (
            v.organizacao_id = unidades.organizacao_id
            and (v.unidade_id is null or v.unidade_id = unidades.id)
          )
        )
    )
  );

-- Organizações: quem tem vínculo ativo naquela organização, ou qualquer
-- vínculo "master" (enxerga todas).
create policy "organizacoes_select_por_vinculo" on organizacoes
  for select using (
    exists (
      select 1 from vinculos v
      where v.user_id = auth.uid()
        and v.status = 'ativo'
        and (v.role = 'master' or v.organizacao_id = organizacoes.id)
    )
  );

-- Logs de auditoria: o app só grava, nunca lê por aqui (leitura é direto no
-- painel do Supabase). O dono do log é sempre quem está logado, nunca um
-- user_id arbitrário vindo de outro lugar.
create policy "logs_auditoria_insert_own" on logs_auditoria
  for insert with check (user_id = auth.uid());

-- Sem policy de escrita em organizacoes/unidades/perfis/vinculos: inserts,
-- convites e revogações são feitos direto no painel do Supabase (Table
-- Editor ou SQL editor), nunca pelo app.

-- Pedidos de Compra (Editor de Espelhos / Pedidos Feitos, adicionado 24/07).
-- Criar Cotação continua 100% calculado na hora a partir da planilha - só
-- vira registro de verdade quando o comprador salva no Editor de Espelhos.
-- Chave natural (unidade, fornecedor, data da contagem base) permite editar
-- e resalvar o mesmo pedido depois.
create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references unidades(id),
  fornecedor text not null,
  data_contagem_base text not null,
  previsao_entrega date,
  observacao_entrega text,
  recebido boolean not null default false,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, fornecedor, data_contagem_base)
);

create table if not exists pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos(id) on delete cascade,
  sku text not null,
  nome text not null,
  -- Nome de Compra (como o fornecedor chama o item) - Pedidos Feitos sempre
  -- mostra esse, nunca o nome interno: é o nome que bate com a nota que
  -- chega fisicamente, pro funcionário conferir contra o que recebeu.
  nome_compra text,
  unidade_base text not null,
  quantidade_pedida numeric not null,
  quantidade_recebida numeric,
  preco_antigo numeric,
  preco_atualizado numeric,
  -- Valor começa como referência do Cadastro. Só vira uma cotação real
  -- depois que a pessoa confirma explicitamente o campo de preço.
  preco_confirmado boolean not null default false,
  -- Verdadeiro só depois de um clique explícito em "Confirmar aqui" no
  -- Editor de Espelhos (adicionado 03/08) - editar quantidade/preço sozinho
  -- nunca marca isso. Sem essa coluna, item de fornecedor único ficava
  -- "confirmado" na hora que a quantidade era gravada, mesmo sem decisão
  -- nenhuma de propósito.
  vencedor_confirmado boolean not null default false
);

alter table pedidos enable row level security;
alter table pedido_itens enable row level security;

-- Compatibilidade com bancos criados antes da comparação de cotações.
alter table pedido_itens add column if not exists preco_confirmado boolean not null default false;
update pedido_itens
set preco_confirmado = true
where preco_atualizado is not null
  and (vencedor_confirmado = true or preco_antigo is distinct from preco_atualizado);

-- Pedidos/pedido_itens: qualquer vínculo ativo (Gestão, Operacional ou
-- master) que alcance a unidade pode ler/gravar - o recorte real de quem
-- pode editar o quê (preço e quantidade pedida só Gestão/master; recebido e
-- observação também Operacional) é decidido nas Server Actions
-- (`requireGestao()` em salvar pedido, `atualizarRecebimento` só mexe em
-- recebido/observação/quantidade recebida em qualquer chamada), não aqui.
create policy "pedidos_select_por_vinculo" on pedidos
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = pedidos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "pedidos_insert_por_vinculo" on pedidos
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = pedidos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "pedidos_update_por_vinculo" on pedidos
  for update using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = pedidos.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "pedido_itens_select_por_vinculo" on pedido_itens
  for select using (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

create policy "pedido_itens_insert_por_vinculo" on pedido_itens
  for insert with check (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

create policy "pedido_itens_update_por_vinculo" on pedido_itens
  for update using (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

create policy "pedido_itens_delete_por_vinculo" on pedido_itens
  for delete using (
    exists (
      select 1 from pedidos p
      join unidades u on u.id = p.unidade_id
      join vinculos v on v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
      where p.id = pedido_itens.pedido_id
    )
  );

-- Consolidado de Vendas (fechamento diário) - substitui a planilha solta que a
-- Ana usava pra somar formas de pagamento contra canal de venda. Liberado por
-- unidade via `unidades.consolidado_vendas_habilitado` (edição direta no
-- Supabase, mesma convenção de `spreadsheet_id`/`ativo` - sem tela de admin).
alter table unidades add column if not exists consolidado_vendas_habilitado boolean not null default false;

-- Totais/diferença/status nunca são geradas pelo Postgres: a Server Action
-- sempre recalcula os três a partir dos 7 valores brutos antes de gravar
-- (criar e editar), pra nunca confiar em total calculado no navegador - mesmo
-- princípio de `ItemInventario.total`/`alerta` na camada de Sheets.
create table if not exists consolidados_vendas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references unidades(id),
  data date not null,
  credito numeric(10,2) not null default 0,
  debito numeric(10,2) not null default 0,
  pix numeric(10,2) not null default 0,
  dinheiro numeric(10,2) not null default 0,
  vale_alimentacao numeric(10,2) not null default 0,
  salao numeric(10,2) not null default 0,
  delivery_proprio numeric(10,2) not null default 0,
  ifood numeric(10,2) not null default 0,
  food99 numeric(10,2) not null default 0,
  total_formas_pagamento numeric(10,2) not null,
  total_canais numeric(10,2) not null,
  total_marketplaces numeric(10,2) not null,
  faturamento_total numeric(10,2) not null,
  diferenca numeric(10,2) not null,
  status text not null check (status in ('conferido', 'divergente')),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, data)
);

alter table consolidados_vendas enable row level security;

-- Select/insert/update liberados pra qualquer vínculo ativo que alcance a
-- unidade (Gestão, Operacional ou master) - o recorte fino de quem pode
-- editar depois de salvo (só Gestão/master) é decidido na Server Action
-- (`requireGestao()`), não aqui - mesmo padrão de `pedidos`/`pedido_itens`.
create policy "consolidados_vendas_select_por_vinculo" on consolidados_vendas
  for select using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = consolidados_vendas.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "consolidados_vendas_insert_por_vinculo" on consolidados_vendas
  for insert with check (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = consolidados_vendas.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

create policy "consolidados_vendas_update_por_vinculo" on consolidados_vendas
  for update using (
    exists (
      select 1 from vinculos v
      join unidades u on u.id = consolidados_vendas.unidade_id
      where v.user_id = auth.uid() and v.status = 'ativo'
        and (v.role = 'master' or (v.organizacao_id = u.organizacao_id and (v.unidade_id is null or v.unidade_id = u.id)))
    )
  );

-- Perfis: além do próprio (policy original acima), também enxerga o nome de
-- quem tem vínculo ativo na mesma organização/unidade, ou é master - precisa
-- disso pra mostrar "Responsável" no Histórico do Consolidado de Vendas sem
-- expor nome de gente de cliente nenhum fora do alcance de quem está vendo.
create policy "perfis_select_mesma_unidade" on perfis
  for select using (
    exists (
      select 1 from vinculos v1
      join vinculos v2 on v2.user_id = perfis.id and v2.status = 'ativo'
      where v1.user_id = auth.uid() and v1.status = 'ativo'
        and (
          v1.role = 'master'
          or (
            v1.organizacao_id = v2.organizacao_id
            and (v1.unidade_id is null or v2.unidade_id is null or v1.unidade_id = v2.unidade_id)
          )
        )
    )
  );
