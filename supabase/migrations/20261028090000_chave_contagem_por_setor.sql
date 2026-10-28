-- Chave "Contagem por setor" por unidade (pedido de Vinícius, 28/10/2026).
--
-- Antes, bastava cadastrar um setor para a unidade passar a contar por setor sem ninguém decidir,
-- e os produtos sem setor saíam da contagem. Agora o modo é uma chave da unidade, ligada em
-- Configurações > Módulos pelo dono, pela gestão ou pelo master. Desligada, a contagem segue sem
-- setor, mesmo com setores cadastrados (que ficam guardados).
--
-- O que muda:
--   unidades.contagem_por_setor_habilitada   false por padrão. Na criação da coluna, liga só nas
--                                           unidades com pelo menos 1 setor ativo, menos a Zatti
--                                           Burger (o setor "Cozinha" de lá é só de vídeo).
--   exigir_contagem_por_setor_ligada         gatilho em contagens: abrir data por setor (nova ou
--                                           convertida) exige a chave ligada. Era aqui que o banco
--                                           deixava o modo sair da existência de setor.
--   proteger_troca_contagem_por_setor        gatilho em unidades: não desliga com contagem por
--                                           setor em andamento (aberta e com setor ainda não
--                                           enviado), nem liga com o estoque na planilha. Vale
--                                           para qualquer caminho, inclusive service role.
--   definir_contagem_por_setor(unidade, bool) a troca pela tela: gestão ou master da unidade, sem
--                                           exceção "sem acesso" em Configurações.
--   situacao_contagem_por_setor(unidade)     o que a tela mostra antes de trocar: produtos ativos
--                                           sem setor ativo, setores ativos e datas em andamento.
--
-- Idempotente, sem apagar dado. Lock curto em unidades e contagens (gatilhos novos).

begin;

-- 1. Coluna e carga inicial (só na criação: rodar de novo não religa quem desligou) -----------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'unidades' and column_name = 'contagem_por_setor_habilitada'
  ) then
    alter table public.unidades add column contagem_por_setor_habilitada boolean not null default false;

    update public.unidades u
       set contagem_por_setor_habilitada = true
     where u.id <> 'zatti-burger'
       and lower(btrim(u.nome)) <> 'zatti burger'
       and exists (select 1 from public.setores s where s.unidade_id = u.id and s.ativo = true);
  end if;
end $$;

comment on column public.unidades.contagem_por_setor_habilitada is
  'Chave "Contagem por setor" (28/10/2026). Ligada: a contagem pede o setor e congela a lista. '
  'Desligada: contagem sem setor, mesmo com setores cadastrados. Troca por definir_contagem_por_setor.';

-- 2. Datas por setor em andamento (uso interno) ------------------------------------------------

-- Aberta por setor e com algum setor do snapshot ainda não enviado. Data aberta com snapshot
-- vazio (nenhum setor) não prende nada.
create or replace function public.datas_contagem_setor_em_andamento(p_unidade_id text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(to_char(c.data, 'DD/MM/YYYY') order by c.data), '{}')
    from public.contagens c
   where c.unidade_id = p_unidade_id
     and c.modalidade = 'setor'
     and exists (
       select 1 from public.contagem_setores cs
        where cs.contagem_id = c.id and cs.situacao <> 'concluido'
     );
$$;

revoke all on function public.datas_contagem_setor_em_andamento(text) from public, anon, authenticated;

-- 3. Abrir por setor exige a chave ligada -------------------------------------------------------

create or replace function public.exigir_contagem_por_setor_ligada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.modalidade = 'setor'
     and (tg_op = 'INSERT' or old.modalidade is distinct from 'setor')
     and not exists (
       select 1 from public.unidades u
        where u.id = new.unidade_id and u.contagem_por_setor_habilitada = true
     ) then
    raise exception 'A contagem por setor está desligada nesta unidade. Para ligar, vá em Configurações > Módulos.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_contagem_por_setor_ligada() from public, anon, authenticated;

drop trigger if exists exigir_contagem_por_setor_ligada on public.contagens;
create trigger exigir_contagem_por_setor_ligada
  before insert or update of modalidade on public.contagens
  for each row execute function public.exigir_contagem_por_setor_ligada();

-- 4. Troca da chave: nunca com contagem em andamento ------------------------------------------

create or replace function public.proteger_troca_contagem_por_setor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_datas text[];
begin
  if new.contagem_por_setor_habilitada is not distinct from old.contagem_por_setor_habilitada then
    return new;
  end if;

  -- Mesma trava da abertura e da designação: ninguém abre uma data no meio da troca.
  perform public.travar_setores_unidade(new.id);

  -- Só ao desligar: com a chave desligada a unidade conta no modo antigo, que não deixa nada
  -- aberto no banco (a lista é enviada de uma vez). Data por setor deixada aberta de antes da
  -- chave (ex.: o vídeo da Zatti Burger) não pode prender a unidade: ao ligar, ela só volta a
  -- poder ser terminada.
  v_datas := public.datas_contagem_setor_em_andamento(new.id);
  if not new.contagem_por_setor_habilitada and cardinality(v_datas) > 0 then
    raise exception 'Há contagem por setor em andamento (%). Envie todos os setores dessa data antes de trocar o modo da contagem.',
      array_to_string(v_datas, ', ')
      using errcode = 'P0001';
  end if;

  if new.contagem_por_setor_habilitada and new.fonte_dados_estoque <> 'banco' then
    raise exception 'A contagem por setor só existe com o estoque no Zatti Hub (esta unidade usa a planilha).'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.proteger_troca_contagem_por_setor() from public, anon, authenticated;

drop trigger if exists proteger_troca_contagem_por_setor on public.unidades;
create trigger proteger_troca_contagem_por_setor
  before update of contagem_por_setor_habilitada on public.unidades
  for each row execute function public.proteger_troca_contagem_por_setor();

-- 5. Trocar pela tela ---------------------------------------------------------------------------

-- Exceção aberta só para esta chave: os outros módulos seguem só master (podem ser pagos). Aqui
-- dono e gestão também trocam. `usuario_tem_acesso_unidade(..., ['gestao'])` aceita gestão da
-- unidade e master com segundo fator; `pode_modulo` tira quem recebeu "sem acesso" em
-- Configurações. Devolve true quando mudou.
create or replace function public.definir_contagem_por_setor(p_unidade_id text, p_ligar boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_atual boolean;
begin
  if p_ligar is null then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  if not public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao'])
     or not public.pode_modulo('configuracoes', 'ver', p_unidade_id) then
    raise exception 'Sem permissão para trocar o modo da contagem nesta unidade.' using errcode = '42501';
  end if;

  select u.contagem_por_setor_habilitada into v_atual
    from public.unidades u
   where u.id = p_unidade_id
   for update;
  if v_atual is null then
    raise exception 'Unidade não encontrada.' using errcode = 'P0001';
  end if;
  if v_atual = p_ligar then
    return false;
  end if;

  update public.unidades set contagem_por_setor_habilitada = p_ligar where id = p_unidade_id;
  return true;
end;
$$;

revoke all on function public.definir_contagem_por_setor(text, boolean) from public, anon;
grant execute on function public.definir_contagem_por_setor(text, boolean) to authenticated;

-- 6. O que a tela mostra antes de trocar ------------------------------------------------------

-- Produto sem setor = ativo e sem vínculo com setor ativo (o mesmo critério do snapshot da
-- abertura: ele fica fora da contagem).
create or replace function public.situacao_contagem_por_setor(p_unidade_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.usuario_tem_acesso_unidade(p_unidade_id, null) then
    raise exception 'Sem acesso a esta unidade' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'produtosSemSetor', (
      select count(*)
        from public.produtos p
       where p.unidade_id = p_unidade_id
         and p.ativo = true
         and not exists (
           select 1 from public.produto_setores ps
             join public.setores s on s.id = ps.setor_id
            where ps.produto_id = p.id and s.ativo = true
         )
    ),
    'setoresAtivos', (
      select count(*) from public.setores s where s.unidade_id = p_unidade_id and s.ativo = true
    ),
    'emAndamento', to_jsonb(public.datas_contagem_setor_em_andamento(p_unidade_id))
  );
end;
$$;

revoke all on function public.situacao_contagem_por_setor(text) from public, anon;
grant execute on function public.situacao_contagem_por_setor(text) to authenticated;

commit;
