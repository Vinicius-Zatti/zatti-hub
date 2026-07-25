-- Zatti Hub - schema de autenticação e multiempresa.
-- Rodar inteiro no SQL editor do Supabase (projeto novo), uma vez, antes de
-- ligar o login. Depois disso, seed de organizações/unidades/vínculos é
-- feito à parte (ver pedido no final do plano de login).

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
  unidade_base text not null,
  quantidade_pedida numeric not null,
  quantidade_recebida numeric,
  preco_antigo numeric,
  preco_atualizado numeric
);

alter table pedidos enable row level security;
alter table pedido_itens enable row level security;

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
