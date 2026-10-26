-- Titular da organização e perfil de chef no Cardápio (decisões de Vinícius, 26/10/2026).
--
-- A) TITULAR. Até aqui o "dono" era deduzido: gestão ativa da organização inteira. Passa a ser o
--    titular, uma pessoa por organização (quem pagou o app), marcada pelo master. Tabela própria
--    `titulares_organizacao` (o vini_operador tem DML em `organizacoes`; aqui ele só lê).
--    Reserva: organização sem titular válido (nenhum marcado, ou o marcado deixou de ser gestão
--    ativa) continua como hoje, com a gestão da organização inteira contando como dono.
--    Onde vale: `vinculo_e_dono` decide o padrão de Configurações e quem administra as
--    permissões (`salvar_permissoes_modulo`: só o dono e o master; gestão que não é o dono não
--    administra; ninguém além do master mexe nas permissões do dono). Senha provisória e
--    editar acesso pela Equipe: a conta do titular marcado só o master mexe ('alvo_titular').
--    Migração de dados: marca sozinho só onde não há dúvida (exatamente um vínculo gestão ativo
--    da organização inteira, de alguém que não é master).
--
-- B) CHEF. Cardápio ganha o nível "chef" (entre "ver" e "editar"), só por exceção e só no
--    Cardápio. Pode ser dado à operação (única exceção acima do padrão do papel). Chef cria e
--    edita ficha, componentes e modo de preparo e grava o preço de venda como RASCUNHO
--    (`fichas_tecnicas.preco_venda_rascunho`). Não grava preço oficial (Salão e os 3 canais),
--    nem a Margem Ideal (`configuracao_financeira`), nem categorias, conversões ou exclusão.
--    A gestão aceita o rascunho na Precificação (vira `preco_venda`).
--    Limite conhecido da leitura: a policy de select de `fichas_tecnicas` (e de componentes) não
--    muda. Quem tem "ver" ou "chef" e consulta a Data API direto ainda lê preço oficial, preços de
--    canal, rascunho e observações gerenciais. O app não manda esses campos ao navegador de quem
--    não pode ver (src/lib/fichas-tecnicas-visibilidade.ts); fechar no banco exige separar as
--    colunas (view ou tabela própria) numa próxima fatia.
--    Conversões de unidade (`produto_conversoes`) passam a ter o gatilho do Cardápio ("editar").
--
-- Quem chama as funções de escrita: o servidor (service_role) com o id de quem está logado
-- (`p_ator`, lido da sessão). Toda função nova revoga o vini_operador (default privileges de
-- 20261019180000_papel_vini_operador.sql).
--
-- Lock: troca policies e gatilhos das tabelas do Cardápio e recria funções usadas por vinculos.
-- Rodar fora do horário de uso.
--
-- Desfazer: `drop table public.titulares_organizacao cascade` devolve a dedução antiga (as
-- funções passam a cair sempre na reserva); o nível chef some apagando as linhas
-- `nivel = 'chef'` de permissoes_modulo.

begin;

-- ══ A) Titular ══════════════════════════════════════════════════════════

create table if not exists public.titulares_organizacao (
  organizacao_id text primary key references public.organizacoes(id) on delete cascade,
  vinculo_id uuid not null unique references public.vinculos(id) on delete cascade,
  marcado_por uuid references auth.users(id),
  marcado_em timestamptz not null default now()
);

comment on table public.titulares_organizacao is
  'Titular (dono) de cada organização, marcado pelo master. Sem linha válida vale a reserva: gestão da organização inteira.';

alter table public.titulares_organizacao enable row level security;
-- O app lê pela função `titulares_das_minhas_organizacoes`; ninguém lê nem grava direto.
revoke all on public.titulares_organizacao from public, anon, authenticated;
grant all on public.titulares_organizacao to service_role;

revoke insert, update, delete, truncate on public.titulares_organizacao from vini_operador;
grant select on public.titulares_organizacao to vini_operador;
drop policy if exists vini_operador_leitura on public.titulares_organizacao;
create policy vini_operador_leitura on public.titulares_organizacao
  for select to vini_operador using (true);

grant select on public.titulares_organizacao to vini_leitura;
drop policy if exists vini_leitura_select on public.titulares_organizacao;
create policy vini_leitura_select on public.titulares_organizacao
  for select to vini_leitura using (true);

-- Titular que vale: o marcado, se ainda for gestão ativa da mesma organização.
create or replace function public.titular_valido_da_organizacao(p_organizacao_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.vinculo_id
    from public.titulares_organizacao t
    join public.vinculos v on v.id = t.vinculo_id
   where t.organizacao_id = p_organizacao_id
     and v.organizacao_id = p_organizacao_id
     and v.status = 'ativo'
     and v.role = 'gestao';
$$;

-- Dono = o titular válido; sem ele (reserva), a gestão da organização inteira, como antes.
create or replace function public.vinculo_e_dono(p_vinculo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vinculos v
     where v.id = p_vinculo_id
       and v.status <> 'revogado'
       and v.role = 'gestao'
       and coalesce(public.titular_valido_da_organizacao(v.organizacao_id) = v.id, v.unidade_id is null)
  );
$$;

-- Conta que é titular válida de alguma organização (protege senha e acesso dela).
create or replace function public.conta_e_titular(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.titulares_organizacao t
      join public.vinculos v on v.id = t.vinculo_id
     where v.user_id = p_user_id
       and v.organizacao_id = t.organizacao_id
       and v.status = 'ativo'
       and v.role = 'gestao'
  );
$$;

-- O app (getAcessoAtual) lê o titular válido das organizações da própria pessoa.
create or replace function public.titulares_das_minhas_organizacoes()
returns table (organizacao_id text, vinculo_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select o.organizacao_id, public.titular_valido_da_organizacao(o.organizacao_id)
    from (
      select distinct v.organizacao_id
        from public.vinculos v
       where v.user_id = auth.uid() and v.status in ('ativo', 'convidado')
    ) o
   where public.titular_valido_da_organizacao(o.organizacao_id) is not null;
$$;

revoke all on function public.titular_valido_da_organizacao(text) from public, anon, authenticated;
revoke all on function public.vinculo_e_dono(uuid) from public, anon, authenticated;
revoke all on function public.conta_e_titular(uuid) from public, anon, authenticated;
revoke all on function public.titulares_das_minhas_organizacoes() from public, anon;
grant execute on function public.titular_valido_da_organizacao(text) to service_role;
grant execute on function public.vinculo_e_dono(uuid) to service_role;
grant execute on function public.conta_e_titular(uuid) to service_role;
grant execute on function public.titulares_das_minhas_organizacoes() to authenticated, service_role;

-- Marcar, trocar ou tirar o titular (p_vinculo_id nulo = tirar). Só master. O vínculo precisa ser
-- gestão ativa daquela organização e de alguém que não é master. Devolve 'ok' ou o motivo:
-- 'sem_permissao', 'nao_encontrado', 'vinculo_invalido', 'sem_mudanca'. Auditoria em logs_auditoria.
create or replace function public.marcar_titular_organizacao(
  p_ator uuid,
  p_organizacao_id text,
  p_vinculo_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antigo uuid;
  v_alvo record;
  v_alvo_user uuid;
  v_unidade_log text;
begin
  if p_ator is null or p_organizacao_id is null then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.vinculos where user_id = p_ator and status = 'ativo' and role = 'master'
  ) then
    return 'sem_permissao';
  end if;

  -- Mesma ordem de trava das outras funções de acesso (organização, depois vínculo).
  perform 1 from public.organizacoes where id = p_organizacao_id for update;
  if not found then
    return 'nao_encontrado';
  end if;

  if p_vinculo_id is not null then
    select id, user_id, organizacao_id, role, status into v_alvo
      from public.vinculos where id = p_vinculo_id for update;
    if not found or v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role <> 'gestao'
       or v_alvo.status <> 'ativo'
       or exists (
         select 1 from public.vinculos m
          where m.user_id = v_alvo.user_id and m.role = 'master' and m.status = 'ativo'
       ) then
      return 'vinculo_invalido';
    end if;
    v_alvo_user := v_alvo.user_id;
  end if;

  select vinculo_id into v_antigo from public.titulares_organizacao where organizacao_id = p_organizacao_id;
  if v_antigo is not distinct from p_vinculo_id then
    return 'sem_mudanca';
  end if;

  if p_vinculo_id is null then
    delete from public.titulares_organizacao where organizacao_id = p_organizacao_id;
  else
    insert into public.titulares_organizacao (organizacao_id, vinculo_id, marcado_por, marcado_em)
    values (p_organizacao_id, p_vinculo_id, p_ator, now())
    on conflict (organizacao_id) do update
      set vinculo_id = excluded.vinculo_id, marcado_por = excluded.marcado_por, marcado_em = excluded.marcado_em;
  end if;

  select id into v_unidade_log from public.unidades
   where organizacao_id = p_organizacao_id
   order by ativo desc, id
   limit 1;
  if v_unidade_log is null then
    raise exception 'sem_unidade_para_auditoria' using errcode = '22023';
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (v_unidade_log, p_ator, 'marcar_titular', 'organizacao', p_organizacao_id,
          jsonb_build_object('vinculoId', v_antigo),
          jsonb_build_object('vinculoId', p_vinculo_id, 'userId', v_alvo_user));
  return 'ok';
end;
$$;

revoke all on function public.marcar_titular_organizacao(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.marcar_titular_organizacao(uuid, text, uuid) to service_role;

-- Migração de dados: só o caso sem dúvida. O resto fica na reserva até o master marcar.
insert into public.titulares_organizacao (organizacao_id, vinculo_id, marcado_por)
select c.organizacao_id, c.vinculo_id, null
  from (
    select v.organizacao_id, (array_agg(v.id))[1] as vinculo_id, count(*) as total
      from public.vinculos v
      join public.organizacoes o on o.id = v.organizacao_id
     where v.role = 'gestao' and v.status = 'ativo' and v.unidade_id is null
       and coalesce(o.area_interna, false) = false
       and not exists (
         select 1 from public.vinculos m
          where m.user_id = v.user_id and m.role = 'master' and m.status = 'ativo'
       )
     group by v.organizacao_id
  ) c
 where c.total = 1
on conflict (organizacao_id) do nothing;

-- ══ B) Nível chef ═══════════════════════════════════════════════════════

alter table public.permissoes_modulo drop constraint if exists permissoes_modulo_nivel_check;
alter table public.permissoes_modulo
  add constraint permissoes_modulo_nivel_check check (nivel in ('sem_acesso', 'ver', 'chef', 'editar'));
alter table public.permissoes_modulo drop constraint if exists permissoes_modulo_chef_so_cardapio;
alter table public.permissoes_modulo
  add constraint permissoes_modulo_chef_so_cardapio check (nivel <> 'chef' or modulo = 'cardapio');

-- antes (20261025090000): editar 2, ver 1. Chef fica entre ver e editar.
create or replace function public.permissao_nivel_rank(p_nivel text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_nivel when 'editar' then 3 when 'chef' then 2 when 'ver' then 1 when 'sem_acesso' then 0 else -1 end;
$$;

-- antes (20261025090000): sem o chef. O segundo parâmetro passa a ser "é o dono" (titular ou,
-- na reserva, gestão da organização inteira); só Configurações usa.
create or replace function public.permissao_nivel_maximo(p_role text, p_org_inteira boolean, p_chave text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'gestao' and p_chave = 'configuracoes' then 'ver'
    when p_role = 'operacional' and p_chave = 'cardapio' then 'chef'
    else public.permissao_nivel_padrao(p_role, p_org_inteira, p_chave)
  end;
$$;

-- antes (20261025090000): sempre "editar". tg_argv[2] (opcional) = nível exigido.
create or replace function public.exigir_permissao_modulo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := tg_argv[0];
  v_mensagem text := tg_argv[1];
  v_nivel text := coalesce(tg_argv[2], 'editar');
begin
  if auth.uid() is not null then
    if tg_op in ('UPDATE', 'DELETE') and not public.pode_modulo(v_chave, v_nivel, old.unidade_id) then
      raise exception '%', v_mensagem using errcode = '42501';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and not public.pode_modulo(v_chave, v_nivel, new.unidade_id) then
      raise exception '%', v_mensagem using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_permissao_modulo() from public, anon, authenticated;
revoke execute on function public.exigir_permissao_modulo() from vini_operador;

-- Chef: vínculo operacional ativo que cobre a unidade com a exceção 'chef' no Cardápio. Confere a
-- sessão vigente como todo helper que lê vínculo direto.
create or replace function public.usuario_e_chef_cardapio(p_unidade_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sessao_vigente() and exists (
    select 1
      from public.vinculos v
      join public.unidades u on u.id = p_unidade_id and u.organizacao_id = v.organizacao_id
      join public.permissoes_modulo p on p.vinculo_id = v.id and p.modulo = 'cardapio' and p.nivel = 'chef'
     where v.user_id = auth.uid() and v.status = 'ativo' and v.role = 'operacional'
       and (v.unidade_id is null or v.unidade_id = p_unidade_id)
  );
$$;

-- Quem grava ficha: gestão (como hoje) ou o chef. O gatilho de permissão confere o nível.
create or replace function public.usuario_pode_editar_fichas(p_unidade_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_pode_usar_fichas(p_unidade_id, array['gestao'])
      or (public.usuario_pode_usar_fichas(p_unidade_id, null) and public.usuario_e_chef_cardapio(p_unidade_id));
$$;

create or replace function public.usuario_pode_editar_ficha_id(p_ficha_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fichas_tecnicas f
     where f.id = p_ficha_id and public.usuario_pode_editar_fichas(f.unidade_id)
  );
$$;

revoke all on function public.usuario_e_chef_cardapio(text) from public, anon;
revoke all on function public.usuario_pode_editar_fichas(text) from public, anon;
revoke all on function public.usuario_pode_editar_ficha_id(uuid) from public, anon;
grant execute on function public.usuario_e_chef_cardapio(text) to authenticated;
grant execute on function public.usuario_pode_editar_fichas(text) to authenticated;
grant execute on function public.usuario_pode_editar_ficha_id(uuid) to authenticated;

-- Preço rascunho do chef. Carimbo de quem e quando vem do gatilho, nunca do formulário.
alter table public.fichas_tecnicas
  add column if not exists preco_venda_rascunho numeric(12,2)
    check (preco_venda_rascunho is null or preco_venda_rascunho >= 0),
  add column if not exists preco_venda_rascunho_por uuid references auth.users(id),
  add column if not exists preco_venda_rascunho_em timestamptz;

-- Policies de escrita das fichas: antes `usuario_pode_usar_fichas(..., array['gestao'])`.
-- Exclusão de ficha, categorias, conversões e Margem Ideal seguem só da gestão.
drop policy if exists "fichas_tecnicas_insert_gestao" on public.fichas_tecnicas;
create policy "fichas_tecnicas_insert_gestao" on public.fichas_tecnicas
  for insert to authenticated
  with check (
    public.usuario_pode_editar_fichas(unidade_id)
    and criado_por = auth.uid()
    and atualizado_por = auth.uid()
  );
drop policy if exists "fichas_tecnicas_update_gestao" on public.fichas_tecnicas;
create policy "fichas_tecnicas_update_gestao" on public.fichas_tecnicas
  for update to authenticated
  using (public.usuario_pode_editar_fichas(unidade_id))
  with check (
    public.usuario_pode_editar_fichas(unidade_id)
    and atualizado_por = auth.uid()
  );

drop policy if exists "ficha_componentes_gestao" on public.ficha_componentes;
create policy "ficha_componentes_gestao" on public.ficha_componentes
  for all to authenticated
  using (public.usuario_pode_editar_ficha_id(ficha_id))
  with check (public.usuario_pode_editar_ficha_id(ficha_id));

drop policy if exists "ficha_etapas_gestao" on public.ficha_etapas;
create policy "ficha_etapas_gestao" on public.ficha_etapas
  for all to authenticated
  using (public.usuario_pode_editar_ficha_id(ficha_id))
  with check (public.usuario_pode_editar_ficha_id(ficha_id));

drop policy if exists "ficha_versoes_insert_gestao" on public.ficha_versoes;
create policy "ficha_versoes_insert_gestao" on public.ficha_versoes
  for insert to authenticated
  with check (
    public.usuario_pode_editar_ficha_id(ficha_id)
    and criado_por = auth.uid()
  );

-- Gatilhos de permissão: ficha, componentes, etapas e versões aceitam "chef"; apagar ficha,
-- categorias e Margem Ideal seguem exigindo "editar" (gatilho de 20261025090000).
do $$
declare
  t text;
  v_msg constant text :=
    'Seu acesso ao Cardápio é só para ver. Peça a quem administra a equipe para liberar a edição.';
begin
  foreach t in array array['fichas_tecnicas', 'ficha_componentes', 'ficha_etapas', 'ficha_versoes'] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo(%L, %L, %L)',
      t, 'cardapio', v_msg, 'chef'
    );
  end loop;
end;
$$;

-- Conversões de unidade são da gestão: exigem "editar" no Cardápio (faltavam em 20261025090000).
drop trigger if exists permissao_modulo_editar on public.produto_conversoes;
create trigger permissao_modulo_editar
  before insert or update or delete on public.produto_conversoes
  for each row execute function public.exigir_permissao_modulo(
    'cardapio', 'Seu acesso ao Cardápio não inclui conversões de unidade. Peça a quem administra a equipe.');

drop trigger if exists permissao_cardapio_apagar_ficha on public.fichas_tecnicas;
create trigger permissao_cardapio_apagar_ficha
  before delete on public.fichas_tecnicas
  for each row execute function public.exigir_permissao_modulo(
    'cardapio', 'Apagar ficha técnica é só da gestão.');

-- Preço oficial: quem não tem "editar" no Cardápio (o chef) não muda preço de venda nem de canal.
-- Vale dentro da RPC salvar_ficha_tecnica (o servidor manda o preço que já estava).
create or replace function public.proteger_preco_oficial_ficha()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.preco_venda_rascunho is distinct from old.preco_venda_rascunho then
    if new.preco_venda_rascunho is null then
      new.preco_venda_rascunho_por := null;
      new.preco_venda_rascunho_em := null;
    else
      new.preco_venda_rascunho_por := auth.uid();
      new.preco_venda_rascunho_em := now();
    end if;
  else
    new.preco_venda_rascunho_por := old.preco_venda_rascunho_por;
    new.preco_venda_rascunho_em := old.preco_venda_rascunho_em;
  end if;

  if auth.uid() is not null and not public.pode_modulo('cardapio', 'editar', new.unidade_id) then
    if (tg_op = 'INSERT' and (
          new.preco_venda is not null or new.preco_venda_delivery_proprio is not null
          or new.preco_venda_ifood is not null or new.preco_venda_99food is not null))
       or (tg_op = 'UPDATE' and (
          new.preco_venda is distinct from old.preco_venda
          or new.preco_venda_delivery_proprio is distinct from old.preco_venda_delivery_proprio
          or new.preco_venda_ifood is distinct from old.preco_venda_ifood
          or new.preco_venda_99food is distinct from old.preco_venda_99food)) then
      raise exception 'Preço de venda oficial é da gestão. Grave o seu como rascunho.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_preco_oficial_ficha() from public, anon, authenticated;
revoke execute on function public.proteger_preco_oficial_ficha() from vini_operador;

drop trigger if exists proteger_preco_oficial_ficha on public.fichas_tecnicas;
create trigger proteger_preco_oficial_ficha
  before insert or update on public.fichas_tecnicas
  for each row execute function public.proteger_preco_oficial_ficha();

-- ══ Permissões: titular + chef ══════════════════════════════════════════

-- antes (20261025090000): org_inteira = vínculo sem unidade. Agora = dono (`vinculo_e_dono`).
create or replace function public.ajustar_permissoes_apos_troca_vinculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dono boolean := public.vinculo_e_dono(new.id);
begin
  delete from public.permissoes_modulo p
   where p.vinculo_id = new.id
     and (
       new.role = 'master'
       or p.nivel = public.permissao_nivel_padrao(new.role, v_dono, p.modulo)
       or public.permissao_nivel_rank(p.nivel)
          > public.permissao_nivel_rank(public.permissao_nivel_maximo(new.role, v_dono, p.modulo))
     );
  return new;
end;
$$;

revoke all on function public.ajustar_permissoes_apos_troca_vinculo() from public, anon, authenticated;
revoke execute on function public.ajustar_permissoes_apos_troca_vinculo() from vini_operador;

-- antes (20261025090000): dono = gestão da organização inteira; "alvo_dono" = outro vínculo da
-- organização inteira. Agora dono = `vinculo_e_dono` (titular, ou a reserva) e o nível "chef"
-- (só Cardápio). Resto igual.
create or replace function public.salvar_permissoes_modulo(
  p_ator uuid,
  p_organizacao_id text,
  p_vinculo_id uuid,
  p_niveis jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_chaves constant text[] := array[
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'equipe', 'relatorios', 'cadastros',
    'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  ];
  v_par record;
  v_alvo record;
  v_alvo_dono boolean;
  v_ator_master boolean;
  v_ator_dono boolean;
  v_chave text;
  v_nivel text;
  v_padrao text;
  v_novas jsonb := '{}'::jsonb;
  v_antigas jsonb;
  v_unidade_log text;
begin
  if p_ator is null or p_organizacao_id is null or p_vinculo_id is null then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  if p_niveis is null or jsonb_typeof(p_niveis) <> 'object' then
    return 'pedido_invalido';
  end if;
  for v_par in select key, value from jsonb_each(p_niveis) loop
    if not (v_par.key = any (c_chaves))
       or jsonb_typeof(v_par.value) <> 'string'
       or (v_par.value #>> '{}') not in ('sem_acesso', 'ver', 'chef', 'editar')
       or ((v_par.value #>> '{}') = 'chef' and v_par.key <> 'cardapio') then
      return 'pedido_invalido';
    end if;
  end loop;

  -- Organização: ativa, Equipe ligada e no piloto.
  if not exists (
    select 1 from public.organizacoes
     where id = p_organizacao_id and ativo = true and equipe_habilitado = true
  ) then
    return 'sem_permissao';
  end if;
  if not public.organizacao_no_piloto_permissoes(p_organizacao_id) then
    return 'fora_do_piloto';
  end if;

  -- Quem pede: master, ou o dono (titular; sem titular, gestão da organização inteira) com a
  -- Equipe liberada. Gestão que não é o dono não administra permissões.
  v_ator_master := exists (
    select 1 from public.vinculos where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  v_ator_dono := exists (
    select 1 from public.vinculos v
     where v.user_id = p_ator and v.status = 'ativo' and v.role = 'gestao'
       and v.organizacao_id = p_organizacao_id
       and public.vinculo_e_dono(v.id)
       and not exists (
         select 1 from public.permissoes_modulo p
          where p.vinculo_id = v.id and p.modulo = 'equipe' and p.nivel <> 'editar'
       )
  );
  if not v_ator_master and not v_ator_dono then
    return 'sem_permissao';
  end if;

  -- Mesma ordem de trava de editar_vinculo_acesso (organização, depois vínculo).
  perform 1 from public.organizacoes where id = p_organizacao_id for update;
  select id, user_id, organizacao_id, unidade_id, role, status into v_alvo
    from public.vinculos where id = p_vinculo_id for update;
  -- Mesma resposta para "não existe" e "não é seu".
  if not found or v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role = 'master' then
    return 'nao_encontrado';
  end if;
  if v_alvo.user_id = p_ator then
    return 'proprio_vinculo';
  end if;
  if v_alvo.status = 'revogado' then
    return 'revogado';
  end if;
  v_alvo_dono := public.vinculo_e_dono(v_alvo.id);
  if not v_ator_master and v_alvo_dono then
    return 'alvo_dono';
  end if;

  foreach v_chave in array c_chaves loop
    v_padrao := public.permissao_nivel_padrao(v_alvo.role, v_alvo_dono, v_chave);
    v_nivel := coalesce(p_niveis ->> v_chave, v_padrao);
    if public.permissao_nivel_rank(v_nivel)
       > public.permissao_nivel_rank(public.permissao_nivel_maximo(v_alvo.role, v_alvo_dono, v_chave)) then
      return 'acima_do_papel';
    end if;
    -- Ação sensível é liga/desliga: só "editar" (liberada) ou "sem_acesso".
    if position('.' in v_chave) > 0 and v_nivel in ('ver', 'chef') then
      return 'pedido_invalido';
    end if;
    if v_nivel <> v_padrao then
      if not public.permissao_chave_liberada(v_chave) then
        return 'modulo_indisponivel';
      end if;
      v_novas := v_novas || jsonb_build_object(v_chave, v_nivel);
    end if;
  end loop;

  select coalesce(jsonb_object_agg(modulo, nivel), '{}'::jsonb) into v_antigas
    from public.permissoes_modulo where vinculo_id = v_alvo.id;
  if v_antigas = v_novas then
    return 'sem_mudanca';
  end if;

  delete from public.permissoes_modulo where vinculo_id = v_alvo.id;
  insert into public.permissoes_modulo (vinculo_id, modulo, nivel, atualizado_por)
  select v_alvo.id, e.key, e.value, p_ator from jsonb_each_text(v_novas) e;

  v_unidade_log := v_alvo.unidade_id;
  if v_unidade_log is null then
    select id into v_unidade_log from public.unidades
     where organizacao_id = v_alvo.organizacao_id
     order by ativo desc, id
     limit 1;
  end if;
  if v_unidade_log is null then
    raise exception 'sem_unidade_para_auditoria' using errcode = '22023';
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (v_unidade_log, p_ator, 'editar_permissoes_modulo', 'vinculo', v_alvo.id::text,
          jsonb_build_object('excecoes', v_antigas),
          jsonb_build_object('excecoes', v_novas, 'userId', v_alvo.user_id, 'role', v_alvo.role,
                             'organizacaoId', v_alvo.organizacao_id));
  return 'ok';
end;
$$;

revoke all on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) to service_role;
revoke execute on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) from vini_operador;

-- ══ Senha provisória e editar acesso: a conta do titular só o master mexe ═

-- antes (20261024150000): igual, sem a recusa 'alvo_titular' no escopo da Equipe.
create or replace function public.gerar_senha_provisoria_conta(
  p_ator uuid,
  p_vinculo_id uuid,
  p_escopo text,
  p_organizacao_id text,
  p_hash text,
  p_expira_em timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo record;
  v_ator_master boolean;
  v_ator_gestao boolean;
  v_ator_unidade_fixa boolean;
  v_ator_unidade text;
  v_pendente record;
  v_ja_pendente boolean := false;
  v_unidade_log text;
begin
  if p_ator is null or p_vinculo_id is null or p_escopo is null or p_escopo not in ('master', 'equipe') then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  -- Mesma validade do fluxo atual (7 dias), com folga de relógio entre servidor e banco.
  if p_expira_em is null or p_expira_em <= now() or p_expira_em > now() + interval '7 days 10 minutes' then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;

  -- Quem pede.
  v_ator_master := exists (
    select 1 from public.vinculos
     where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  if p_escopo = 'master' then
    if not v_ator_master then
      return 'sem_permissao';
    end if;
  else
    if p_organizacao_id is null or not exists (
      select 1 from public.organizacoes
       where id = p_organizacao_id and ativo = true and equipe_habilitado = true
    ) then
      return 'sem_permissao';
    end if;
    v_ator_gestao := exists (
      select 1 from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = p_organizacao_id
    );
    if not v_ator_master and not v_ator_gestao then
      return 'sem_permissao';
    end if;
    -- Gestor com vínculo de organização inteira não fica preso a unidade.
    v_ator_unidade_fixa := not v_ator_master and not exists (
      select 1 from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao'
         and organizacao_id = p_organizacao_id and unidade_id is null
    );
    if v_ator_unidade_fixa then
      select min(unidade_id) into v_ator_unidade
        from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = p_organizacao_id;
    end if;
  end if;

  -- Teto por pessoa no escopo da Equipe: 5 gerações a cada 10 minutos. A trava por
  -- pessoa serializa os pedidos dela, para dois pedidos simultâneos não passarem do teto.
  if p_escopo = 'equipe' then
    perform pg_advisory_xact_lock(hashtextextended('gerar_senha_provisoria_ator:' || p_ator::text, 0));
    if (
      select count(*) from public.logs_auditoria
       where acao = 'gerar_senha_provisoria' and user_id = p_ator
         and criado_em >= now() - interval '10 minutes'
         and dados_novos ->> 'escopo' = 'equipe'
    ) >= 5 then
      return 'limite_ator';
    end if;
  end if;

  -- Para quem.
  select id, user_id, organizacao_id, unidade_id, role, status, whatsapp_alterado_em into v_alvo
    from public.vinculos where id = p_vinculo_id;
  if not found or v_alvo.status = 'revogado' then
    return 'nao_encontrado';
  end if;
  if v_alvo.user_id = p_ator then
    return 'propria_conta';
  end if;

  if p_escopo = 'equipe' then
    -- Mesma resposta para "não existe" e "não é seu" (não revela vínculo de outro cliente).
    if v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role = 'master' or v_alvo.status <> 'ativo' then
      return 'nao_encontrado';
    end if;
    if v_ator_unidade_fixa and v_alvo.unidade_id is distinct from v_ator_unidade then
      return 'nao_encontrado';
    end if;
    if exists (
      select 1 from public.vinculos
       where user_id = v_alvo.user_id and status in ('ativo', 'convidado') and role = 'master'
    ) then
      return 'nao_encontrado';
    end if;
    -- Conta do titular: só o master gera (tela Acessos).
    if not v_ator_master and public.conta_e_titular(v_alvo.user_id) then
      return 'alvo_titular';
    end if;
    if exists (
      select 1 from public.vinculos
       where user_id = v_alvo.user_id and status in ('ativo', 'convidado')
         and organizacao_id <> p_organizacao_id
    ) then
      return 'outra_organizacao';
    end if;
    if v_ator_unidade_fixa and exists (
      select 1 from public.vinculos
       where user_id = v_alvo.user_id and status in ('ativo', 'convidado')
         and unidade_id is distinct from v_ator_unidade
    ) then
      return 'outra_unidade';
    end if;
    -- A provisória da Equipe vai para o WhatsApp do vínculo: número trocado agora há
    -- pouco não recebe senha (troca e geração em sequência por quem não é a pessoa).
    if v_alvo.whatsapp_alterado_em is not null and v_alvo.whatsapp_alterado_em > now() - interval '30 minutes' then
      return 'whatsapp_recente';
    end if;
  end if;

  -- Trava a conta: duas gerações seguidas fazem fila, e um login em andamento espera
  -- (ver o gatilho de sessão de 20261024150000).
  perform 1 from auth.users where id = v_alvo.user_id and deleted_at is null for update;
  if not found then
    return 'nao_encontrado';
  end if;

  select * into v_pendente from public.senhas_temporarias where user_id = v_alvo.user_id for update;
  v_ja_pendente := found;

  if v_ja_pendente then
    -- Já pendente: só a provisória muda (a senha do Auth já é sorteada).
    if v_pendente.enviada_em >= now() - interval '2 minutes' then
      return 'limite';
    end if;
    update public.senhas_temporarias
       set hash = p_hash, expira_em = p_expira_em, versao = versao + 1, enviada_em = now(), tentativas = 0
     where user_id = v_alvo.user_id;
  else
    if exists (
      select 1 from public.logs_auditoria
       where acao = 'gerar_senha_provisoria' and entidade_id = v_alvo.user_id::text
         and criado_em >= now() - interval '2 minutes'
    ) then
      return 'limite';
    end if;

    -- Senha do Auth sorteada: ninguém conhece, a antiga deixa de entrar.
    perform set_config('zatti.troca_senha_equipe', v_alvo.user_id::text, true);
    update auth.users
       set encrypted_password = extensions.crypt(
             encode(extensions.gen_random_bytes(32), 'base64'), extensions.gen_salt('bf', 10)),
           updated_at = now()
     where id = v_alvo.user_id;
    perform set_config('zatti.troca_senha_equipe', '', true);
    perform public.equipe_limpar_acessos_auth(v_alvo.user_id);

    insert into public.perfis (id, sessoes_validas_desde)
    values (v_alvo.user_id, now())
    on conflict (id) do update set sessoes_validas_desde = excluded.sessoes_validas_desde;

    insert into public.senhas_temporarias (user_id, vinculo_id, hash, expira_em, versao, enviada_em, tentativas, origem)
    values (v_alvo.user_id, v_alvo.id, p_hash, p_expira_em, 1, now(), 0, 'redefinicao');
  end if;

  -- Auditoria na unidade do vínculo, ou na primeira unidade da organização dele.
  v_unidade_log := v_alvo.unidade_id;
  if v_unidade_log is null then
    select id into v_unidade_log from public.unidades
     where organizacao_id = v_alvo.organizacao_id
     order by ativo desc, id
     limit 1;
  end if;
  if v_unidade_log is null then
    raise exception 'sem_unidade_para_auditoria' using errcode = '22023';
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (v_unidade_log, p_ator, 'gerar_senha_provisoria', 'usuario', v_alvo.user_id::text,
          jsonb_build_object('contaJaPendente', v_ja_pendente),
          jsonb_build_object('escopo', p_escopo, 'vinculoId', v_alvo.id, 'organizacaoId', v_alvo.organizacao_id,
                             'expiraEm', p_expira_em));
  return 'ok';
end;
$$;

revoke all on function public.gerar_senha_provisoria_conta(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated, vini_operador;
grant execute on function public.gerar_senha_provisoria_conta(uuid, uuid, text, text, text, timestamptz)
  to service_role;

-- antes (20261024200000): igual, sem a recusa 'alvo_titular' no escopo da Equipe.
create or replace function public.editar_vinculo_acesso(
  p_ator uuid,
  p_vinculo_id uuid,
  p_escopo text,
  p_organizacao_id text,
  p_novo_role text,
  p_nova_unidade_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org text;
  v_alvo record;
  v_ator_master boolean;
  v_ator_gestao boolean;
  v_ator_unidade_fixa boolean := false;
  v_ator_unidade text;
  v_unidade_log text;
begin
  if p_ator is null or p_vinculo_id is null or p_escopo is null or p_escopo not in ('master', 'equipe') then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;

  -- O que se pede (antes de olhar quem pede: não depende de ninguém).
  if p_novo_role is null or p_novo_role not in ('gestao', 'operacional') then
    return 'papel_invalido';
  end if;
  if p_novo_role = 'operacional' and p_nova_unidade_id is null then
    return 'operacional_sem_unidade';
  end if;

  -- Quem pede (mesmo desenho de gerar_senha_provisoria_conta).
  v_ator_master := exists (
    select 1 from public.vinculos
     where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  if p_escopo = 'master' then
    if not v_ator_master then
      return 'sem_permissao';
    end if;
  else
    if p_organizacao_id is null or not exists (
      select 1 from public.organizacoes
       where id = p_organizacao_id and ativo = true and equipe_habilitado = true
    ) then
      return 'sem_permissao';
    end if;
    v_ator_gestao := exists (
      select 1 from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = p_organizacao_id
    );
    if not v_ator_master and not v_ator_gestao then
      return 'sem_permissao';
    end if;
    v_ator_unidade_fixa := not v_ator_master and not exists (
      select 1 from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao'
         and organizacao_id = p_organizacao_id and unidade_id is null
    );
    if v_ator_unidade_fixa then
      select min(unidade_id) into v_ator_unidade
        from public.vinculos
       where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = p_organizacao_id;
    end if;
  end if;

  -- Trava comum por organização antes do vínculo (mesma ordem de revogar_vinculo_equipe):
  -- duas edições ou edição + revogação no mesmo cliente fazem fila, sem deadlock.
  select organizacao_id into v_org from public.vinculos where id = p_vinculo_id;
  if not found then
    return 'nao_encontrado';
  end if;
  perform 1 from public.organizacoes where id = v_org for update;

  select id, user_id, organizacao_id, unidade_id, role, status into v_alvo
    from public.vinculos where id = p_vinculo_id for update;
  if not found or v_alvo.organizacao_id <> v_org then
    return 'nao_encontrado';
  end if;

  if p_escopo = 'equipe' then
    -- Mesma resposta para "não existe" e "não é seu" (não revela vínculo de outro cliente).
    if v_alvo.organizacao_id <> p_organizacao_id or v_alvo.role = 'master' then
      return 'nao_encontrado';
    end if;
    if v_ator_unidade_fixa and v_alvo.unidade_id is distinct from v_ator_unidade then
      return 'nao_encontrado';
    end if;
  elsif v_alvo.role = 'master' then
    return 'vinculo_master';
  end if;

  if v_alvo.user_id = p_ator then
    return 'proprio_vinculo';
  end if;
  -- Acesso do titular: só o master edita (tela Acessos).
  if p_escopo = 'equipe' and not v_ator_master and public.conta_e_titular(v_alvo.user_id) then
    return 'alvo_titular';
  end if;
  if v_alvo.status = 'revogado' then
    return 'revogado';
  end if;

  -- Unidade nova: ativa e da organização do vínculo.
  if p_nova_unidade_id is not null and not exists (
    select 1 from public.unidades
     where id = p_nova_unidade_id and organizacao_id = v_alvo.organizacao_id and ativo = true
  ) then
    return 'unidade_invalida';
  end if;
  -- Gestor de uma unidade só não tira ninguém dela nem dá "todas as unidades".
  if v_ator_unidade_fixa and p_nova_unidade_id is distinct from v_ator_unidade then
    return 'fora_da_unidade';
  end if;

  if v_alvo.role = p_novo_role and v_alvo.unidade_id is not distinct from p_nova_unidade_id then
    return 'sem_mudanca';
  end if;

  if exists (
    select 1 from public.vinculos
     where user_id = v_alvo.user_id and organizacao_id = v_alvo.organizacao_id
       and unidade_id is not distinct from p_nova_unidade_id and role = p_novo_role
       and status in ('ativo', 'convidado') and id <> v_alvo.id
  ) then
    return 'duplicado';
  end if;

  -- Equipe nunca deixa o cliente sem gestão geral nem a unidade sem gestão
  -- (regra de revogar_vinculo_equipe, aplicada ao que a edição tira).
  if p_escopo = 'equipe' and v_alvo.role = 'gestao' and v_alvo.status = 'ativo' then
    if v_alvo.unidade_id is null
       and not (p_novo_role = 'gestao' and p_nova_unidade_id is null)
       and not exists (
         select 1 from public.vinculos
          where organizacao_id = v_alvo.organizacao_id and role = 'gestao' and status = 'ativo'
            and unidade_id is null and id <> v_alvo.id
       ) then
      return 'ultima_gestao';
    end if;
    if v_alvo.unidade_id is not null
       and not (p_novo_role = 'gestao' and (p_nova_unidade_id is null or p_nova_unidade_id = v_alvo.unidade_id))
       and not exists (
         select 1 from public.vinculos
          where organizacao_id = v_alvo.organizacao_id and role = 'gestao' and status = 'ativo'
            and (unidade_id is null or unidade_id = v_alvo.unidade_id) and id <> v_alvo.id
       ) then
      return 'ultima_gestao';
    end if;
  end if;

  begin
    update public.vinculos
       set role = p_novo_role, unidade_id = p_nova_unidade_id
     where id = v_alvo.id;
  exception when unique_violation then
    return 'duplicado';
  end;

  -- Auditoria na unidade nova, ou na antiga, ou na primeira unidade da organização.
  v_unidade_log := coalesce(p_nova_unidade_id, v_alvo.unidade_id);
  if v_unidade_log is null then
    select id into v_unidade_log from public.unidades
     where organizacao_id = v_alvo.organizacao_id
     order by ativo desc, id
     limit 1;
  end if;
  if v_unidade_log is null then
    raise exception 'sem_unidade_para_auditoria' using errcode = '22023';
  end if;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (v_unidade_log, p_ator, 'editar_vinculo', 'vinculo', v_alvo.id::text,
          jsonb_build_object('role', v_alvo.role, 'unidadeId', v_alvo.unidade_id),
          jsonb_build_object('role', p_novo_role, 'unidadeId', p_nova_unidade_id, 'escopo', p_escopo,
                             'userId', v_alvo.user_id, 'organizacaoId', v_alvo.organizacao_id));
  return 'ok';
end;
$$;

revoke all on function public.editar_vinculo_acesso(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, vini_operador;
grant execute on function public.editar_vinculo_acesso(uuid, uuid, text, text, text, text)
  to service_role;

-- ══ Tirar acesso e trocar WhatsApp: a conta do titular só o master mexe ═

-- Mesma regra de quem pede das outras duas: escopo 'master' (p_ator master ativo) ou 'equipe'
-- (p_ator master ou gestão ativa da organização do vínculo). Delega a revogação a
-- `revogar_vinculo_equipe(uuid)` (trava e "última gestão" de sempre), que continua existindo.
-- Devolve 'ok', 'sem_permissao', 'nao_encontrado', 'alvo_titular' ou 'ultima_gestao'.
create or replace function public.revogar_vinculo_equipe(p_ator uuid, p_vinculo_id uuid, p_escopo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo record;
  v_ator_master boolean;
begin
  if p_ator is null or p_vinculo_id is null or p_escopo is null or p_escopo not in ('master', 'equipe') then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  select id, user_id, organizacao_id, role into v_alvo from public.vinculos where id = p_vinculo_id;
  if not found or v_alvo.role = 'master' then
    return 'nao_encontrado';
  end if;
  -- Mesma trava de revogar_vinculo_equipe(uuid): organização antes do vínculo.
  perform 1 from public.organizacoes where id = v_alvo.organizacao_id for update;

  v_ator_master := exists (
    select 1 from public.vinculos where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  if p_escopo = 'master' and not v_ator_master then
    return 'sem_permissao';
  end if;
  if p_escopo = 'equipe' and not v_ator_master and not exists (
    select 1 from public.vinculos
     where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = v_alvo.organizacao_id
  ) then
    return 'sem_permissao';
  end if;
  if not v_ator_master and public.conta_e_titular(v_alvo.user_id) then
    return 'alvo_titular';
  end if;
  return public.revogar_vinculo_equipe(p_vinculo_id);
end;
$$;

revoke all on function public.revogar_vinculo_equipe(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.revogar_vinculo_equipe(uuid, uuid, text) to service_role;

-- Trocar o WhatsApp de alguém da equipe. O gatilho de 20261024150000 marca a troca (espera de 30
-- minutos para senha provisória). Devolve 'ok', 'sem_permissao', 'nao_encontrado',
-- 'alvo_titular' ou 'sem_mudanca'. O número vem já normalizado pelo servidor.
create or replace function public.atualizar_whatsapp_vinculo(
  p_ator uuid,
  p_vinculo_id uuid,
  p_escopo text,
  p_whatsapp text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alvo record;
  v_ator_master boolean;
begin
  if p_ator is null or p_vinculo_id is null or p_escopo is null or p_escopo not in ('master', 'equipe')
     or p_whatsapp is null or p_whatsapp !~ '^\+?[0-9]{8,15}$' then
    raise exception 'parametro_invalido' using errcode = '22023';
  end if;
  select id, user_id, organizacao_id, role, whatsapp into v_alvo
    from public.vinculos where id = p_vinculo_id for update;
  if not found or v_alvo.role = 'master' then
    return 'nao_encontrado';
  end if;
  v_ator_master := exists (
    select 1 from public.vinculos where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  if p_escopo = 'master' and not v_ator_master then
    return 'sem_permissao';
  end if;
  if p_escopo = 'equipe' and not v_ator_master and not exists (
    select 1 from public.vinculos
     where user_id = p_ator and status = 'ativo' and role = 'gestao' and organizacao_id = v_alvo.organizacao_id
  ) then
    return 'sem_permissao';
  end if;
  if not v_ator_master and public.conta_e_titular(v_alvo.user_id) then
    return 'alvo_titular';
  end if;
  if v_alvo.whatsapp is not distinct from p_whatsapp then
    return 'sem_mudanca';
  end if;
  update public.vinculos set whatsapp = p_whatsapp where id = v_alvo.id;
  return 'ok';
end;
$$;

revoke all on function public.atualizar_whatsapp_vinculo(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.atualizar_whatsapp_vinculo(uuid, uuid, text, text) to service_role;

-- Default privileges de 20261019180000 dão EXECUTE em toda função nova ao vini_operador.
revoke execute on function public.revogar_vinculo_equipe(uuid, uuid, text) from vini_operador;
revoke execute on function public.atualizar_whatsapp_vinculo(uuid, uuid, text, text) from vini_operador;
revoke execute on function public.titular_valido_da_organizacao(text) from vini_operador;
revoke execute on function public.vinculo_e_dono(uuid) from vini_operador;
revoke execute on function public.conta_e_titular(uuid) from vini_operador;
revoke execute on function public.titulares_das_minhas_organizacoes() from vini_operador;
revoke execute on function public.marcar_titular_organizacao(uuid, text, uuid) from vini_operador;
revoke execute on function public.usuario_e_chef_cardapio(text) from vini_operador;
revoke execute on function public.usuario_pode_editar_fichas(text) from vini_operador;
revoke execute on function public.usuario_pode_editar_ficha_id(uuid) from vini_operador;

commit;
