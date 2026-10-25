-- Permissões por módulo (Navegação V2, fase 6 - 25/10/2026).
--
-- Três níveis por módulo para cada vínculo: sem_acesso, ver, editar. A tabela guarda só
-- EXCEÇÕES ao padrão do papel: sem linha, a pessoa continua exatamente como hoje (o papel e as
-- policies de sempre decidem). Por isso esta migration é aditiva: nenhuma policy é trocada e
-- nenhum acesso aumenta no banco. As linhas só RESTRINGEM.
--
-- Chaves (coluna `modulo`):
--   módulos: estoque, vendas, financeiro, cardapio, garante, equipe, relatorios, cadastros,
--            configuracoes
--   ações sensíveis (exceções dentro de um módulo, liberadas para quem edita o módulo, o dono
--   pode tirar): financeiro.apagar_lancamento, financeiro.fechar_mes, vendas.editar_dia_lancado
--
-- Onde vale no banco (primeira fatia):
--   * financeiro: `usuario_pode_usar_financeiro_gerencial` e `unidades_financeiro_acessiveis`
--     passam a exigir "ver" (sem_acesso não lê nem grava nada, por policy ou RPC); a
--     Conciliação exige "editar"; gatilho de escrita exige "editar" nas tabelas do Financeiro
--     (vale também dentro das RPCs SECURITY DEFINER, porque gatilho não é pulado por elas).
--   * vendas: `usuario_pode_usar_consolidado` exige "ver"; gatilho de escrita exige "editar".
--   * cardapio: `usuario_pode_usar_fichas` exige "ver"; gatilho de escrita exige "editar".
--   * ações sensíveis: gatilhos próprios (apagar lançamento, gravar fechamento do mês, editar
--     consolidado já lançado).
--   * equipe e configuracoes: a escrita já é só pelo servidor (service_role, depois de
--     requireEquipe/requireMaster); a barreira é a do app, que lê esta tabela.
--   * relatorios: só tela; os dados por baixo são do Financeiro e de Vendas (acima).
--   * estoque, garante e cadastros: ainda NÃO têm a barreira do banco. `salvar_permissoes_modulo`
--     recusa mudar essas chaves ('modulo_indisponivel') até a próxima fatia.
--
-- Quem grava: só `salvar_permissoes_modulo`, executada pelo service_role com o id de quem está
-- logado (`p_ator`, lido da sessão no servidor), conferido de novo aqui, como em
-- 20261024200000_editar_vinculo_acesso.sql. Master (qualquer organização) ou o dono (gestão
-- ativa da organização inteira, sem restrição na própria Equipe) da organização. Só
-- organização do piloto da Navegação V2. Auditoria em logs_auditoria.
--
-- Desfazer: `drop table public.permissoes_modulo cascade;` devolve o comportamento de antes (as
-- funções novas passam a não achar linha nenhuma); para limpar tudo, reaplicar os corpos
-- anteriores dos 4 helpers (citados ao lado de cada um) e dropar gatilhos e funções novas.

begin;

-- ── Tabela ────────────────────────────────────────────────────────────────

create table if not exists public.permissoes_modulo (
  vinculo_id uuid not null references public.vinculos(id) on delete cascade,
  modulo text not null check (modulo in (
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'equipe', 'relatorios', 'cadastros',
    'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  )),
  nivel text not null check (nivel in ('sem_acesso', 'ver', 'editar')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  primary key (vinculo_id, modulo)
);

alter table public.permissoes_modulo enable row level security;
revoke all on public.permissoes_modulo from public, anon, authenticated;
grant select on public.permissoes_modulo to authenticated;

-- Cada pessoa lê só as exceções dos próprios vínculos (o app monta o menu com elas). A Equipe
-- lê as dos outros pelo servidor, depois de requireEquipe. Sem policy de escrita.
drop policy if exists permissoes_modulo_select_proprio on public.permissoes_modulo;
create policy permissoes_modulo_select_proprio on public.permissoes_modulo
  for select to authenticated
  using (vinculo_id in (select v.id from public.vinculos v where v.user_id = auth.uid()));

-- Operador do Vini (20261019180000_papel_vini_operador.sql dá DML em toda tabela nova por
-- default privileges): aqui só lê. Mudar permissão é sensível e passa pela função com auditoria.
revoke insert, update, delete, truncate on public.permissoes_modulo from vini_operador;
grant select on public.permissoes_modulo to vini_operador;
drop policy if exists vini_operador_leitura on public.permissoes_modulo;
create policy vini_operador_leitura on public.permissoes_modulo
  for select to vini_operador
  using (true);

-- ── Regras puras (espelho de src/lib/permissoes/modulos.ts) ───────────────

create or replace function public.permissao_nivel_rank(p_nivel text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_nivel when 'editar' then 2 when 'ver' then 1 when 'sem_acesso' then 0 else -1 end;
$$;

-- Padrão do papel = o que a pessoa faz hoje, sem linha nenhuma.
create or replace function public.permissao_nivel_padrao(p_role text, p_org_inteira boolean, p_chave text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'master' then 'editar'
    when p_chave = 'configuracoes' then
      case when p_role = 'gestao' and p_org_inteira then 'ver' else 'sem_acesso' end
    when p_chave = 'relatorios' then 'ver'
    when p_role = 'gestao' then 'editar'
    when p_role = 'operacional' then
      case
        when p_chave in ('estoque', 'vendas', 'financeiro', 'garante') then 'editar'
        when p_chave = 'cardapio' then 'ver'
        else 'sem_acesso'
      end
    else 'sem_acesso'
  end;
$$;

-- Teto: a exceção nunca dá mais que o papel dá hoje. Única exceção que amplia: gestão pode
-- receber "ver" em Configurações (por padrão só o dono vê; ligar módulo segue só master).
create or replace function public.permissao_nivel_maximo(p_role text, p_org_inteira boolean, p_chave text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role = 'gestao' and p_chave = 'configuracoes' then 'ver'
    else public.permissao_nivel_padrao(p_role, p_org_inteira, p_chave)
  end;
$$;

-- Chaves que já têm a barreira do banco (ou que só existem pelo servidor) nesta fatia.
create or replace function public.permissao_chave_liberada(p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_chave in (
    'vendas', 'financeiro', 'cardapio', 'equipe', 'relatorios', 'configuracoes',
    'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  );
$$;

-- Piloto da Navegação V2 (espelho de UNIDADES_PILOTO_NAVEGACAO em src/lib/navegacao/piloto.ts).
-- Some na fase 8, junto com a lista do app.
create or replace function public.organizacao_no_piloto_permissoes(p_organizacao_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.unidades u
     where u.organizacao_id = p_organizacao_id and u.id = any (array['zatti-burger'])
  );
$$;

-- ── Leitura da permissão de quem está logado ─────────────────────────────

-- Unidades em que a sessão NÃO tem `p_nivel` em `p_chave` por causa de uma exceção gravada.
-- Negada só quando todo vínculo ativo (não master) que cobre a unidade tem linha abaixo do
-- nível pedido; um vínculo sem linha mantém o comportamento de hoje. Master nunca é negado.
-- Conjunto calculado uma vez por consulta (mesmo desenho de unidades_acessiveis).
create or replace function public.unidades_modulo_negadas(p_chave text, p_nivel text)
returns setof text
language sql
stable
security definer
set search_path = ''
rows 5
as $$
  select u.id
  from public.unidades u
  where auth.uid() is not null
    and not exists (
      select 1 from public.vinculos vm
       where vm.user_id = auth.uid() and vm.status = 'ativo' and vm.role = 'master'
    )
    and exists (
      select 1
        from public.vinculos v
        join public.permissoes_modulo p on p.vinculo_id = v.id and p.modulo = p_chave
       where v.user_id = auth.uid() and v.status = 'ativo' and v.role <> 'master'
         and v.organizacao_id = u.organizacao_id
         and (v.unidade_id is null or v.unidade_id = u.id)
         and public.permissao_nivel_rank(p.nivel) < public.permissao_nivel_rank(p_nivel)
    )
    and not exists (
      select 1
        from public.vinculos v
        left join public.permissoes_modulo p on p.vinculo_id = v.id and p.modulo = p_chave
       where v.user_id = auth.uid() and v.status = 'ativo' and v.role <> 'master'
         and v.organizacao_id = u.organizacao_id
         and (v.unidade_id is null or v.unidade_id = u.id)
         and (p.vinculo_id is null or public.permissao_nivel_rank(p.nivel) >= public.permissao_nivel_rank(p_nivel))
    );
$$;

-- A sessão tem `p_nivel` em `p_chave` nesta unidade? (sem exceção = sim; o papel decide no resto)
create or replace function public.pode_modulo(p_chave text, p_nivel text, p_unidade_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_unidade_id is null
      or not exists (
        select 1 from public.unidades_modulo_negadas(p_chave, p_nivel) n where n = p_unidade_id
      );
$$;

revoke all on function public.unidades_modulo_negadas(text, text) from public, anon;
revoke all on function public.pode_modulo(text, text, text) from public, anon;
revoke all on function public.organizacao_no_piloto_permissoes(text) from public, anon, authenticated;
grant execute on function public.unidades_modulo_negadas(text, text) to authenticated;
grant execute on function public.pode_modulo(text, text, text) to authenticated;
grant execute on function public.organizacao_no_piloto_permissoes(text) to service_role;

-- ── Helpers existentes: mesma regra + a exceção (só restringe) ───────────

-- antes (20261011150000_financeiro_v2_acesso_unidade.sql): sem a última linha.
create or replace function public.usuario_pode_usar_financeiro_gerencial(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id
        and u.financeiro_gerencial_habilitado = true
        and (u.financeiro_liberado_equipe or public.usuario_e_titular_financeiro())
    )
    and public.pode_modulo('financeiro', 'ver', p_unidade_id);
$$;

-- antes (20261022120000_rls_fase2_unidades_acessiveis.sql): sem a última linha.
create or replace function public.unidades_financeiro_acessiveis(p_papeis text[] default null)
returns setof text
language sql
stable
security definer
set search_path = ''
rows 20
as $$
  select u.id
  from public.unidades u
  where u.id in (select public.unidades_acessiveis(p_papeis))
    and u.financeiro_gerencial_habilitado = true
    and (u.financeiro_liberado_equipe or public.usuario_e_titular_financeiro())
    and u.id not in (select public.unidades_modulo_negadas('financeiro', 'ver'));
$$;

-- antes (20260930090000_financeiro_conciliacao_v1_importacao.sql): sem a última linha.
-- Conciliação é trabalho (decide, baixa, importa): exige editar o Financeiro.
create or replace function public.usuario_pode_usar_conciliacao(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_pode_usar_financeiro_gerencial(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id and u.conciliacao_habilitada = true
    )
    and public.pode_modulo('financeiro', 'editar', p_unidade_id);
$$;

-- antes (20260811090000_seguranca_rls.sql): sem a última linha.
create or replace function public.usuario_pode_usar_consolidado(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1
      from public.unidades u
      where u.id = p_unidade_id
        and u.consolidado_vendas_habilitado = true
    )
    and public.pode_modulo('vendas', 'ver', p_unidade_id);
$$;

-- antes (20260811100000_fichas_tecnicas.sql): sem a última linha.
create or replace function public.usuario_pode_usar_fichas(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id
        and u.fichas_tecnicas_habilitado = true
    )
    and public.pode_modulo('cardapio', 'ver', p_unidade_id);
$$;

-- ── Gatilhos de escrita ───────────────────────────────────────────────────

-- tg_argv[0] = chave exigida em nível "editar"; tg_argv[1] = mensagem para a tela.
-- Sem sessão de usuário (service_role, rotinas, migrations) não confere: essas escritas já
-- passam por outra barreira. Vale dentro de RPC SECURITY DEFINER chamada pelo usuário.
create or replace function public.exigir_permissao_modulo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := tg_argv[0];
  v_mensagem text := tg_argv[1];
begin
  if auth.uid() is not null then
    if tg_op in ('UPDATE', 'DELETE') and not public.pode_modulo(v_chave, 'editar', old.unidade_id) then
      raise exception '%', v_mensagem using errcode = '42501';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and not public.pode_modulo(v_chave, 'editar', new.unidade_id) then
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

do $$
declare
  t text;
  v_msg_fin constant text :=
    'Seu acesso ao Financeiro é só para ver. Peça a quem administra a equipe para liberar a edição.';
  v_msg_cardapio constant text :=
    'Seu acesso ao Cardápio é só para ver. Peça a quem administra a equipe para liberar a edição.';
begin
  foreach t in array array[
    'fin_alerta_destinatarios', 'fin_baixas', 'fin_caixa_entrada', 'fin_caixa_entrada_pastas',
    'fin_caixa_entrada_remetentes', 'fin_categorias', 'fin_contas_financeiras', 'fin_contrapartes',
    'fin_documentos', 'fin_estoque_mensal', 'fin_fatura_pagamentos', 'fin_faturas_cartao',
    'fin_fechamentos', 'fin_lancamentos', 'fin_metas_unidade', 'fin_parcelas',
    'fin_provisoes_parametros', 'fin_provisoes_reversoes', 'fin_recorrencias',
    'fin_saidas_sem_receita', 'fin_transferencias'
  ] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo(%L, %L)',
      t, 'financeiro', v_msg_fin
    );
  end loop;

  foreach t in array array[
    'categorias_ficha', 'fichas_tecnicas', 'ficha_componentes', 'ficha_etapas', 'ficha_versoes',
    'ficha_sku_contador', 'configuracao_financeira'
  ] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo(%L, %L)',
      t, 'cardapio', v_msg_cardapio
    );
  end loop;
end;
$$;

drop trigger if exists permissao_modulo_editar on public.consolidados_vendas;
create trigger permissao_modulo_editar
  before insert or update or delete on public.consolidados_vendas
  for each row execute function public.exigir_permissao_modulo(
    'vendas', 'Seu acesso a Vendas é só para ver. Peça a quem administra a equipe para liberar a edição.');

-- Ações sensíveis (exceções dentro do módulo).
drop trigger if exists permissao_acao_apagar_lancamento on public.fin_lancamentos;
create trigger permissao_acao_apagar_lancamento
  before delete on public.fin_lancamentos
  for each row execute function public.exigir_permissao_modulo(
    'financeiro.apagar_lancamento',
    'Apagar lançamento não está liberado para você. Peça a quem administra a equipe.');

drop trigger if exists permissao_acao_fechar_mes on public.fin_fechamentos;
create trigger permissao_acao_fechar_mes
  before insert or update or delete on public.fin_fechamentos
  for each row execute function public.exigir_permissao_modulo(
    'financeiro.fechar_mes',
    'Fechar ou reabrir o mês não está liberado para você. Peça a quem administra a equipe.');

drop trigger if exists permissao_acao_editar_dia_lancado on public.consolidados_vendas;
create trigger permissao_acao_editar_dia_lancado
  before update on public.consolidados_vendas
  for each row execute function public.exigir_permissao_modulo(
    'vendas.editar_dia_lancado',
    'Editar um dia de vendas já lançado não está liberado para você. Peça a quem administra a equipe.');

-- ── Escrita das permissões ────────────────────────────────────────────────

-- `p_niveis`: estado desejado completo do vínculo, {"financeiro": "ver", ...}. Chave ausente =
-- padrão do papel. Grava só o que difere do padrão. Devolve 'ok' ou o motivo:
-- 'sem_mudanca', 'pedido_invalido', 'sem_permissao', 'fora_do_piloto', 'nao_encontrado',
-- 'proprio_vinculo', 'revogado', 'acima_do_papel', 'modulo_indisponivel'.
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
       or (v_par.value #>> '{}') not in ('sem_acesso', 'ver', 'editar') then
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

  -- Quem pede: master, ou o dono (gestão ativa da organização inteira) com a Equipe liberada.
  v_ator_master := exists (
    select 1 from public.vinculos where user_id = p_ator and status = 'ativo' and role = 'master'
  );
  v_ator_dono := exists (
    select 1 from public.vinculos v
     where v.user_id = p_ator and v.status = 'ativo' and v.role = 'gestao'
       and v.organizacao_id = p_organizacao_id and v.unidade_id is null
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

  foreach v_chave in array c_chaves loop
    v_padrao := public.permissao_nivel_padrao(v_alvo.role, v_alvo.unidade_id is null, v_chave);
    v_nivel := coalesce(p_niveis ->> v_chave, v_padrao);
    if public.permissao_nivel_rank(v_nivel)
       > public.permissao_nivel_rank(public.permissao_nivel_maximo(v_alvo.role, v_alvo.unidade_id is null, v_chave)) then
      return 'acima_do_papel';
    end if;
    -- Ação sensível é liga/desliga: só "editar" (liberada) ou "sem_acesso".
    if position('.' in v_chave) > 0 and v_nivel = 'ver' then
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

revoke all on function public.permissao_nivel_rank(text) from public, anon;
revoke all on function public.permissao_nivel_padrao(text, boolean, text) from public, anon;
revoke all on function public.permissao_nivel_maximo(text, boolean, text) from public, anon;
revoke all on function public.permissao_chave_liberada(text) from public, anon;
grant execute on function public.permissao_nivel_rank(text) to authenticated, service_role;
grant execute on function public.permissao_nivel_padrao(text, boolean, text) to authenticated, service_role;
grant execute on function public.permissao_nivel_maximo(text, boolean, text) to authenticated, service_role;
grant execute on function public.permissao_chave_liberada(text) to authenticated, service_role;

-- Default privileges de 20261019180000_papel_vini_operador.sql dão EXECUTE em toda função nova
-- ao vini_operador. As SECURITY DEFINER desta migration não ficam com ele (a escrita de
-- permissões confere o ator só pelo app; o resto lê a sessão de usuário, que ele não tem).
revoke execute on function public.salvar_permissoes_modulo(uuid, text, uuid, jsonb) from vini_operador;
revoke execute on function public.organizacao_no_piloto_permissoes(text) from vini_operador;
revoke execute on function public.unidades_modulo_negadas(text, text) from vini_operador;
revoke execute on function public.pode_modulo(text, text, text) from vini_operador;
revoke execute on function public.exigir_permissao_modulo() from vini_operador;

commit;
