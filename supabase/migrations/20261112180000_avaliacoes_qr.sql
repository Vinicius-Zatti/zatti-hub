-- Avaliações: pesquisa de satisfação por QR Code com a marca do restaurante (12/11/2026).
-- Pedido de Vinícius (12/11): o cliente final responde pelo QR (salão ou delivery), a página segue
-- a logo e as cores da unidade, a tela gera a arte do QR para imprimir, nota baixa vira alerta no
-- WhatsApp de quem a gestão escolher e a gestão vê o painel. Desenho reaproveitado da pesquisa da
-- 255 no Horizzon HUB (supabase/31-avaliacoes.sql de lá), com os padrões do Zatti Hub.
--
--   unidades.avaliacoes_habilitado     módulo ligado na unidade (só master liga; nasce desligado)
--   permissoes_modulo / funções        chave nova 'avaliacoes' (gestão edita; operacional sem acesso)
--   avaliacoes_termos                  texto do consentimento do WhatsApp, versionado (imutável)
--   avaliacoes_pesquisas               uma por unidade: endereço fixo (slug), marca, link do Google,
--                                      quem recebe o alerta de nota baixa, pausada ou não
--   avaliacoes_pesquisa_versoes        perguntas (modelo fixo: ligar/desligar e mudar o texto);
--                                      editar cria versão nova, a resposta guarda a versão
--   avaliacoes_respostas               uma linha por avaliação. Grava só pela RPC do servidor.
--                                      Sem IP puro: hash com sal do servidor (IP e aparelho).
--                                      WhatsApp só com consentimento (CHECK): data, versão e texto.
--   avaliacoes_alertas                 fila do alerta de nota baixa que o Vini envia (mesmo
--                                      desenho de garante_avisos: reservar, confirmar, incerto)
--   bucket avaliacoes-logos            logo da unidade, leitura pública (só a logo), escrita só
--                                      pelo servidor depois da checagem de permissão
--
-- LGPD: a unidade é a controladora dos dados de quem responde; a Zatti, a operadora. O texto do
-- consentimento diz isso e cada resposta guarda a versão e a cópia do texto aceito.
--
-- Aditivo: nenhuma tabela existente perde coluna. A única função existente recriada é
-- `salvar_permissoes_modulo` (mesmo corpo de 20261026120000_titular_e_chef.sql, com a chave nova)
-- e `permissao_chave_liberada` (mais uma chave). Aplicar ANTES de publicar o app.
--
-- Desfazer: `drop table avaliacoes_alertas, avaliacoes_respostas, avaliacoes_pesquisa_versoes,
-- avaliacoes_pesquisas, avaliacoes_termos cascade;` + apagar o bucket + recriar as duas funções de
-- permissão sem 'avaliacoes' (linhas de permissoes_modulo com 'avaliacoes' antes).

begin;

-- ══ 1. Módulo ligado por unidade ═════════════════════════════════════════
alter table public.unidades
  add column if not exists avaliacoes_habilitado boolean not null default false;

-- ══ 2. Permissão por módulo: chave 'avaliacoes' ══════════════════════════
-- O check da coluna `modulo` nasceu sem nome (inline); acha pelo conteúdo (a lista com
-- 'configuracoes') e recria com nome. O check do chef (só cardápio) fica.
do $$
declare
  v record;
begin
  for v in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.permissoes_modulo'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%''configuracoes''%'
  loop
    execute format('alter table public.permissoes_modulo drop constraint %I', v.conname);
  end loop;
end $$;
alter table public.permissoes_modulo
  add constraint permissoes_modulo_modulo_check check (modulo in (
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'avaliacoes', 'equipe', 'relatorios', 'cadastros',
    'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  ));

-- Padrão do papel (`permissao_nivel_padrao`) não muda: gestão 'editar', master 'editar' e a
-- operação cai no 'sem_acesso' do fim do case. Teto igual ao padrão.
create or replace function public.permissao_chave_liberada(p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_chave in (
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'avaliacoes', 'equipe', 'relatorios', 'cadastros',
    'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  );
$$;

-- antes (20261026120000_titular_e_chef.sql): mesma função sem 'avaliacoes' em c_chaves.
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
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'avaliacoes', 'equipe', 'relatorios', 'cadastros',
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

  if not exists (
    select 1 from public.organizacoes
     where id = p_organizacao_id and ativo = true and equipe_habilitado = true
  ) then
    return 'sem_permissao';
  end if;
  if not public.organizacao_no_piloto_permissoes(p_organizacao_id) then
    return 'fora_do_piloto';
  end if;

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

  perform 1 from public.organizacoes where id = p_organizacao_id for update;
  select id, user_id, organizacao_id, unidade_id, role, status into v_alvo
    from public.vinculos where id = p_vinculo_id for update;
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

-- Quem usa o módulo nesta unidade: gestão da unidade (ou master com segundo fator), módulo ligado
-- e, por exceção, nunca abaixo de `p_nivel`. A operação não entra (o padrão dela é sem acesso e
-- o teto não sobe).
create or replace function public.usuario_pode_usar_avaliacoes(p_unidade_id text, p_nivel text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, array['gestao'])
    and exists (select 1 from public.unidades u where u.id = p_unidade_id and u.avaliacoes_habilitado)
    and public.pode_modulo('avaliacoes', p_nivel, p_unidade_id);
$$;
revoke all on function public.usuario_pode_usar_avaliacoes(text, text) from public, anon;
grant execute on function public.usuario_pode_usar_avaliacoes(text, text) to authenticated;

-- ══ 3. Texto do consentimento (versionado) ═══════════════════════════════
-- `{restaurante}` vira o nome exibido da pesquisa. Versão nova = linha nova (nunca editar uma
-- versão usada: cada resposta aponta para a que a pessoa leu).
create table if not exists public.avaliacoes_termos (
  versao integer primary key check (versao > 0),
  modelo text not null check (char_length(modelo) between 40 and 800 and position('{restaurante}' in modelo) > 0),
  criado_em timestamptz not null default now()
);
insert into public.avaliacoes_termos (versao, modelo) values (1,
  'Autorizo {restaurante} a falar comigo pelo WhatsApp sobre esta avaliação. {restaurante} é responsável pelos meus dados; a Zatti Hub só guarda e organiza a avaliação em nome do restaurante. Posso pedir a qualquer momento para apagar meu número.')
on conflict (versao) do nothing;

create or replace function public.avaliacoes_texto_termo(p_versao integer, p_restaurante text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select replace(t.modelo, '{restaurante}', btrim(p_restaurante)) from public.avaliacoes_termos t where t.versao = p_versao;
$$;
revoke all on function public.avaliacoes_texto_termo(integer, text) from public, anon, authenticated;

-- ══ 4. Pesquisa da unidade ═══════════════════════════════════════════════
create table if not exists public.avaliacoes_pesquisas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null unique references public.unidades(id) on delete restrict,
  -- Endereço público fixo: /avaliar/<slug>/salao e /avaliar/<slug>/delivery. Não muda pela tela
  -- (o QR impresso continuaria apontando para o antigo).
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nome_exibido text not null check (char_length(btrim(nome_exibido)) between 2 and 60),
  cor_principal text not null default '#1F4E79' check (cor_principal ~ '^#[0-9A-F]{6}$'),
  cor_fundo text not null default '#FFFFFF' check (cor_fundo ~ '^#[0-9A-F]{6}$'),
  logo_path text check (logo_path is null or logo_path ~ '^[A-Za-z0-9_-]+/[0-9a-f-]{36}\.(png|jpg|svg)$'),
  texto_agradecimento text not null default 'Obrigado! Sua opinião ajuda a gente a melhorar a cada dia.'
    check (char_length(btrim(texto_agradecimento)) between 3 and 200),
  -- "Avaliar no Google" aparece para TODOS na tela de obrigado (mostrar só para nota alta é
  -- proibido pelo Google). Sem link, sem botão.
  link_google text check (link_google is null or (link_google ~ '^https://' and char_length(link_google) <= 500)),
  ativa boolean not null default true,
  versao_atual integer not null default 1,
  -- Quem recebe o alerta de nota baixa (pessoa da Equipe com WhatsApp). Nulo = sem alerta.
  alerta_vinculo_id uuid references public.vinculos(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.avaliacoes_pesquisa_versoes (
  pesquisa_id uuid not null references public.avaliacoes_pesquisas(id) on delete restrict,
  versao integer not null check (versao > 0),
  perguntas jsonb not null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (pesquisa_id, versao)
);

-- ══ 5. Respostas ═════════════════════════════════════════════════════════
create table if not exists public.avaliacoes_respostas (
  id uuid primary key default gen_random_uuid(),
  pesquisa_id uuid not null references public.avaliacoes_pesquisas(id) on delete restrict,
  unidade_id text not null references public.unidades(id) on delete restrict,
  versao integer not null,
  origem text not null check (origem in ('salao', 'delivery')),
  atendimento smallint check (atendimento between 1 and 5),
  comida smallint check (comida between 1 and 5),
  espera text check (espera in ('ate_15', 'de_15_a_30', 'de_30_a_45', 'mais_de_45')),
  nps smallint check (nps between 0 and 10),
  conheceu text check (conheceu in ('instagram', 'google', 'ifood', 'indicacao', 'passando', 'ja_cliente', 'outro')),
  conheceu_outro text check (conheceu_outro is null or (conheceu = 'outro' and char_length(conheceu_outro) between 1 and 80)),
  comentario text check (comentario is null or char_length(comentario) between 1 and 1000),
  nota_baixa boolean not null default false,
  -- LGPD: sem consentimento não existe número.
  whatsapp text check (whatsapp is null or whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  consentimento_em timestamptz,
  consentimento_versao integer references public.avaliacoes_termos(versao),
  consentimento_texto text,
  -- Antispam: SHA-256 com sal do servidor. Nunca o IP puro.
  hash_ip text not null check (hash_ip ~ '^[0-9a-f]{64}$'),
  hash_dispositivo text not null check (hash_dispositivo ~ '^[0-9a-f]{64}$'),
  criado_em timestamptz not null default now(),
  foreign key (pesquisa_id, versao) references public.avaliacoes_pesquisa_versoes (pesquisa_id, versao),
  constraint avaliacoes_respostas_whatsapp_consentimento check (
    (whatsapp is null and consentimento_em is null and consentimento_versao is null and consentimento_texto is null)
    or (whatsapp is not null and consentimento_em is not null and consentimento_versao is not null and consentimento_texto is not null)
  )
);
create index if not exists avaliacoes_respostas_unidade_data on public.avaliacoes_respostas (unidade_id, criado_em desc);
create index if not exists avaliacoes_respostas_dispositivo on public.avaliacoes_respostas (pesquisa_id, hash_dispositivo, criado_em desc);
create index if not exists avaliacoes_respostas_ip on public.avaliacoes_respostas (pesquisa_id, hash_ip, criado_em desc);

-- ══ 6. Fila do alerta de nota baixa ══════════════════════════════════════
-- pendente -> reservado -> enviado | incerto | falhou (depois de 3 tentativas); pendente ->
-- expirado (mais de 3 dias). Só nasce com alguém marcado para receber, na hora da resposta.
create table if not exists public.avaliacoes_alertas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id) on delete restrict,
  resposta_id uuid not null unique references public.avaliacoes_respostas(id) on delete cascade,
  estado text not null default 'pendente'
    check (estado in ('pendente', 'reservado', 'enviado', 'falhou', 'incerto', 'expirado')),
  tentativas integer not null default 0 check (tentativas between 0 and 3),
  tentativa_id uuid,
  reservado_em timestamptz,
  fechado_em timestamptz,
  motivo text check (motivo is null or char_length(motivo) <= 40),
  gerado_em timestamptz not null default now(),
  check ((estado in ('pendente', 'reservado')) = (fechado_em is null)),
  check (estado <> 'reservado' or (tentativa_id is not null and reservado_em is not null))
);
create index if not exists avaliacoes_alertas_unidade_estado on public.avaliacoes_alertas (unidade_id, estado);
create index if not exists avaliacoes_alertas_reservados on public.avaliacoes_alertas (tentativa_id) where estado = 'reservado';

-- ══ 7. RLS e privilégios ═════════════════════════════════════════════════
alter table public.avaliacoes_termos enable row level security;
alter table public.avaliacoes_pesquisas enable row level security;
alter table public.avaliacoes_pesquisa_versoes enable row level security;
alter table public.avaliacoes_respostas enable row level security;
alter table public.avaliacoes_alertas enable row level security;

revoke all on table public.avaliacoes_termos, public.avaliacoes_pesquisas, public.avaliacoes_pesquisa_versoes,
  public.avaliacoes_respostas, public.avaliacoes_alertas from public, anon, authenticated;

grant select on table public.avaliacoes_termos, public.avaliacoes_pesquisas, public.avaliacoes_pesquisa_versoes,
  public.avaliacoes_alertas to authenticated;
-- Hashes de IP e de aparelho ficam fora do alcance do usuário (privilégio de coluna): quem lê
-- respostas pelo app usa lista explícita de colunas, nunca select *.
grant select (
  id, pesquisa_id, unidade_id, versao, origem, atendimento, comida, espera, nps, conheceu, conheceu_outro,
  comentario, nota_baixa, whatsapp, consentimento_em, consentimento_versao, consentimento_texto, criado_em
) on public.avaliacoes_respostas to authenticated;

drop policy if exists avaliacoes_termos_select on public.avaliacoes_termos;
create policy avaliacoes_termos_select on public.avaliacoes_termos for select to authenticated using (true);

drop policy if exists avaliacoes_pesquisas_select on public.avaliacoes_pesquisas;
create policy avaliacoes_pesquisas_select on public.avaliacoes_pesquisas for select to authenticated
  using (public.usuario_pode_usar_avaliacoes(unidade_id, 'ver'));

drop policy if exists avaliacoes_pesquisa_versoes_select on public.avaliacoes_pesquisa_versoes;
create policy avaliacoes_pesquisa_versoes_select on public.avaliacoes_pesquisa_versoes for select to authenticated
  using (exists (select 1 from public.avaliacoes_pesquisas p
                  where p.id = pesquisa_id and public.usuario_pode_usar_avaliacoes(p.unidade_id, 'ver')));

drop policy if exists avaliacoes_respostas_select on public.avaliacoes_respostas;
create policy avaliacoes_respostas_select on public.avaliacoes_respostas for select to authenticated
  using (public.usuario_pode_usar_avaliacoes(unidade_id, 'ver'));

drop policy if exists avaliacoes_alertas_select on public.avaliacoes_alertas;
create policy avaliacoes_alertas_select on public.avaliacoes_alertas for select to authenticated
  using (public.usuario_pode_usar_avaliacoes(unidade_id, 'ver'));

-- Sem policy nem grant de escrita: toda escrita passa pelas RPCs abaixo.
grant select, insert, update, delete on table public.avaliacoes_termos, public.avaliacoes_pesquisas,
  public.avaliacoes_pesquisa_versoes, public.avaliacoes_respostas, public.avaliacoes_alertas to service_role;

-- Operador do Vini (default privileges de 20261019180000): só lê. Resposta de cliente é dado de
-- terceiro; mudar passa pelas RPCs.
revoke insert, update, delete, truncate on table public.avaliacoes_termos, public.avaliacoes_pesquisas,
  public.avaliacoes_pesquisa_versoes, public.avaliacoes_respostas, public.avaliacoes_alertas from vini_operador;
grant select on table public.avaliacoes_termos, public.avaliacoes_pesquisas, public.avaliacoes_pesquisa_versoes,
  public.avaliacoes_respostas, public.avaliacoes_alertas to vini_operador;
do $$
declare
  t text;
begin
  foreach t in array array['avaliacoes_termos', 'avaliacoes_pesquisas', 'avaliacoes_pesquisa_versoes',
                           'avaliacoes_respostas', 'avaliacoes_alertas'] loop
    execute format('drop policy if exists vini_operador_leitura on public.%I', t);
    execute format('create policy vini_operador_leitura on public.%I for select to vini_operador using (true)', t);
  end loop;
end $$;

-- ══ 8. Regras puras (espelho de src/lib/avaliacoes/regras.ts) ════════════

-- Contraste WCAG entre duas cores #RRGGBB (1 a 21).
create or replace function public.avaliacoes_contraste(p_a text, p_b text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_l numeric[];
  v_hex text;
  v_c numeric;
  v_canal numeric[];
  i integer;
  j integer;
begin
  v_l := array[0, 0];
  for i in 1..2 loop
    v_hex := case when i = 1 then p_a else p_b end;
    if v_hex is null or v_hex !~* '^#[0-9a-f]{6}$' then
      return null;
    end if;
    v_canal := array[0, 0, 0];
    for j in 0..2 loop
      v_c := ('x' || lpad(substr(v_hex, 2 + j * 2, 2), 8, '0'))::bit(32)::integer / 255.0;
      v_canal[j + 1] := case when v_c <= 0.03928 then v_c / 12.92 else power((v_c + 0.055) / 1.055, 2.4) end;
    end loop;
    v_l[i] := 0.2126 * v_canal[1] + 0.7152 * v_canal[2] + 0.0722 * v_canal[3];
  end loop;
  return (greatest(v_l[1], v_l[2]) + 0.05) / (least(v_l[1], v_l[2]) + 0.05);
end;
$$;
revoke all on function public.avaliacoes_contraste(text, text) from public, anon;
grant execute on function public.avaliacoes_contraste(text, text) to authenticated, service_role;

-- Modelo fixo de perguntas: as 6 chaves, cada uma uma vez, com texto (3 a 200) e ativa
-- (booleano); ao menos uma ativa. Devolve nulo ou o problema.
create or replace function public.avaliacoes_validar_perguntas(p_perguntas jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_chaves text[] := '{}';
  v_ativas integer := 0;
  v_texto text;
begin
  if p_perguntas is null or jsonb_typeof(p_perguntas) <> 'array' or jsonb_array_length(p_perguntas) <> 6 then
    return 'perguntas_invalidas';
  end if;
  for v_item in select * from jsonb_array_elements(p_perguntas) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'chave', '') not in ('atendimento', 'comida', 'espera', 'nps', 'conheceu', 'comentario')
       or (v_item ->> 'chave') = any (v_chaves)
       or jsonb_typeof(v_item -> 'ativa') is distinct from 'boolean'
       or jsonb_typeof(v_item -> 'texto') is distinct from 'string' then
      return 'perguntas_invalidas';
    end if;
    v_chaves := v_chaves || (v_item ->> 'chave');
    v_texto := btrim(v_item ->> 'texto');
    if char_length(v_texto) < 3 or char_length(v_texto) > 200 then
      return 'texto_pergunta';
    end if;
    if (v_item ->> 'ativa')::boolean then
      v_ativas := v_ativas + 1;
    end if;
  end loop;
  if v_ativas = 0 then
    return 'nenhuma_ativa';
  end if;
  return null;
end;
$$;
revoke all on function public.avaliacoes_validar_perguntas(jsonb) from public, anon, authenticated;

create or replace function public.avaliacoes_perguntas_padrao()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"chave": "atendimento", "texto": "Como foi o atendimento?", "ativa": true},
    {"chave": "comida", "texto": "Como estava a comida?", "ativa": true},
    {"chave": "espera", "texto": "Quanto tempo você esperou?", "ativa": true},
    {"chave": "nps", "texto": "De 0 a 10, quanto você indicaria a gente para um amigo?", "ativa": true},
    {"chave": "conheceu", "texto": "Como você conheceu a gente?", "ativa": true},
    {"chave": "comentario", "texto": "Quer contar mais alguma coisa?", "ativa": true}
  ]'::jsonb;
$$;
revoke all on function public.avaliacoes_perguntas_padrao() from public, anon, authenticated;

-- Pergunta ativa nesta versão?
create or replace function public.avaliacoes_pergunta_ativa(p_perguntas jsonb, p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((select (q ->> 'ativa')::boolean from jsonb_array_elements(p_perguntas) q where q ->> 'chave' = p_chave limit 1), false);
$$;
revoke all on function public.avaliacoes_pergunta_ativa(jsonb, text) from public, anon, authenticated;

-- Por que um vínculo não serve para receber o alerta (nulo = serve): ativo, com WhatsApp, e da
-- equipe da organização alcançando a unidade (gestão ou operação), ou master.
create or replace function public.avaliacoes_motivo_vinculo_alerta(p_unidade_id text, p_vinculo_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (
      select 1
        from public.vinculos v
        join public.unidades u on u.id = p_unidade_id and u.ativo
        join public.organizacoes o on o.id = u.organizacao_id and o.ativo
       where v.id = p_vinculo_id
         and v.status = 'ativo'
         and (v.role = 'master'
              or (v.role in ('gestao', 'operacional') and v.organizacao_id = u.organizacao_id
                  and (v.unidade_id is null or v.unidade_id = u.id)))
    ) then 'vinculo_nao_elegivel'
    when not exists (select 1 from public.vinculos v where v.id = p_vinculo_id and v.whatsapp is not null)
      then 'vinculo_sem_whatsapp'
    else null
  end;
$$;
revoke all on function public.avaliacoes_motivo_vinculo_alerta(text, uuid) from public, anon, authenticated;

-- ══ 9. Gestão: criar e configurar a pesquisa ═════════════════════════════

-- Cria a pesquisa da unidade (uma só) com o modelo padrão. O endereço sai do nome da unidade
-- (sem acento, minúsculo, hífen), com sufixo se já existir. Devolve o id (o mesmo se já existe).
create or replace function public.avaliacoes_criar_pesquisa(p_unidade_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_nome text;
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('avaliacoes_pesquisa:' || p_unidade_id, 0));
  select id into v_id from public.avaliacoes_pesquisas where unidade_id = p_unidade_id;
  if v_id is not null then
    return v_id;
  end if;

  select btrim(nome) into v_nome from public.unidades where id = p_unidade_id;
  v_base := lower(translate(coalesce(v_nome, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'));
  v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 30), '-');
  if char_length(v_base) < 2 then
    v_base := 'restaurante';
  end if;
  v_slug := v_base;
  while exists (select 1 from public.avaliacoes_pesquisas where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n::text;
  end loop;

  insert into public.avaliacoes_pesquisas (unidade_id, slug, nome_exibido, criado_por)
  values (p_unidade_id, v_slug, left(coalesce(nullif(v_nome, ''), 'Restaurante'), 60), auth.uid())
  returning id into v_id;
  insert into public.avaliacoes_pesquisa_versoes (pesquisa_id, versao, perguntas, criado_por)
  values (v_id, 1, public.avaliacoes_perguntas_padrao(), auth.uid());

  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_criar_pesquisa', 'avaliacoes_pesquisa', v_id::text,
          jsonb_build_object('slug', v_slug));
  return v_id;
end;
$$;
revoke all on function public.avaliacoes_criar_pesquisa(text) from public, anon;
grant execute on function public.avaliacoes_criar_pesquisa(text) to authenticated;

-- Marca, link do Google, agradecimento e pausa. Cores em #RRGGBB maiúsculo, com contraste mínimo
-- de 3 entre a cor principal (botões e notas escolhidas) e a de fundo.
create or replace function public.avaliacoes_salvar_marca(
  p_unidade_id text,
  p_nome_exibido text,
  p_cor_principal text,
  p_cor_fundo text,
  p_texto_agradecimento text,
  p_link_google text,
  p_ativa boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes record;
  v_link text := nullif(btrim(coalesce(p_link_google, '')), '');
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_nome_exibido, ''))) not between 2 and 60 then
    raise exception 'nome_invalido' using errcode = '22023';
  end if;
  if coalesce(p_cor_principal, '') !~ '^#[0-9A-F]{6}$' or coalesce(p_cor_fundo, '') !~ '^#[0-9A-F]{6}$' then
    raise exception 'cor_invalida' using errcode = '22023';
  end if;
  if public.avaliacoes_contraste(p_cor_principal, p_cor_fundo) < 3 then
    raise exception 'contraste_baixo' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_texto_agradecimento, ''))) not between 3 and 200 then
    raise exception 'agradecimento_invalido' using errcode = '22023';
  end if;
  if v_link is not null and (v_link !~ '^https://' or char_length(v_link) > 500) then
    raise exception 'link_google_invalido' using errcode = '22023';
  end if;
  if p_ativa is null then
    raise exception 'pedido_invalido' using errcode = '22023';
  end if;

  select * into v_antes from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if not found then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  update public.avaliacoes_pesquisas
     set nome_exibido = btrim(p_nome_exibido), cor_principal = p_cor_principal, cor_fundo = p_cor_fundo,
         texto_agradecimento = btrim(p_texto_agradecimento), link_google = v_link, ativa = p_ativa,
         atualizado_em = now()
   where id = v_antes.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_salvar_marca', 'avaliacoes_pesquisa', v_antes.id::text,
          jsonb_build_object('nome', v_antes.nome_exibido, 'corPrincipal', v_antes.cor_principal, 'corFundo', v_antes.cor_fundo,
                             'linkGoogle', v_antes.link_google, 'ativa', v_antes.ativa),
          jsonb_build_object('nome', btrim(p_nome_exibido), 'corPrincipal', p_cor_principal, 'corFundo', p_cor_fundo,
                             'linkGoogle', v_link, 'ativa', p_ativa));
end;
$$;
revoke all on function public.avaliacoes_salvar_marca(text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.avaliacoes_salvar_marca(text, text, text, text, text, text, boolean) to authenticated;

-- Grava o caminho da logo que o servidor acabou de subir (ou nulo para tirar). Devolve o caminho
-- anterior, para o servidor apagar o arquivo velho. O caminho tem de ser da própria unidade.
create or replace function public.avaliacoes_definir_logo(p_unidade_id text, p_logo_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antes text;
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_logo_path is not null and (left(p_logo_path, char_length(p_unidade_id) + 1) <> p_unidade_id || '/'
     or p_logo_path !~ '^[A-Za-z0-9_-]+/[0-9a-f-]{36}\.(png|jpg|svg)$') then
    raise exception 'logo_invalida' using errcode = '22023';
  end if;
  select id, logo_path into v_id, v_antes from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if v_id is null then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  update public.avaliacoes_pesquisas set logo_path = p_logo_path, atualizado_em = now() where id = v_id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_definir_logo', 'avaliacoes_pesquisa', v_id::text,
          jsonb_build_object('logo', v_antes), jsonb_build_object('logo', p_logo_path));
  return v_antes;
end;
$$;
revoke all on function public.avaliacoes_definir_logo(text, text) from public, anon;
grant execute on function public.avaliacoes_definir_logo(text, text) to authenticated;

-- Perguntas: só muda texto e ligado/desligado. Mudou algo = versão nova (as respostas antigas
-- continuam ligadas à versão em que foram dadas). Devolve a versão atual.
create or replace function public.avaliacoes_salvar_perguntas(p_unidade_id text, p_perguntas jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_atual jsonb;
  v_erro text;
  v_normal jsonb;
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  v_erro := public.avaliacoes_validar_perguntas(p_perguntas);
  if v_erro is not null then
    raise exception '%', v_erro using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('chave', q ->> 'chave', 'texto', btrim(q ->> 'texto'), 'ativa', (q ->> 'ativa')::boolean)
                   order by o)
    into v_normal
    from jsonb_array_elements(p_perguntas) with ordinality as e(q, o);

  select id, versao_atual into v_p from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if not found then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  select perguntas into v_atual from public.avaliacoes_pesquisa_versoes where pesquisa_id = v_p.id and versao = v_p.versao_atual;
  if v_atual = v_normal then
    return v_p.versao_atual;
  end if;
  insert into public.avaliacoes_pesquisa_versoes (pesquisa_id, versao, perguntas, criado_por)
  values (v_p.id, v_p.versao_atual + 1, v_normal, auth.uid());
  update public.avaliacoes_pesquisas set versao_atual = v_p.versao_atual + 1, atualizado_em = now() where id = v_p.id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_salvar_perguntas', 'avaliacoes_pesquisa', v_p.id::text,
          jsonb_build_object('versao', v_p.versao_atual), jsonb_build_object('versao', v_p.versao_atual + 1, 'perguntas', v_normal));
  return v_p.versao_atual + 1;
end;
$$;
revoke all on function public.avaliacoes_salvar_perguntas(text, jsonb) from public, anon;
grant execute on function public.avaliacoes_salvar_perguntas(text, jsonb) to authenticated;

-- Quem recebe o alerta de nota baixa (nulo = ninguém, sem alerta).
create or replace function public.avaliacoes_definir_destinatario(p_unidade_id text, p_vinculo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antes uuid;
  v_motivo text;
begin
  if not public.usuario_pode_usar_avaliacoes(p_unidade_id, 'editar') then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_vinculo_id is not null then
    v_motivo := public.avaliacoes_motivo_vinculo_alerta(p_unidade_id, p_vinculo_id);
    if v_motivo is not null then
      raise exception '%', v_motivo using errcode = '22023';
    end if;
  end if;
  select id, alerta_vinculo_id into v_id, v_antes from public.avaliacoes_pesquisas where unidade_id = p_unidade_id for update;
  if v_id is null then
    raise exception 'pesquisa_inexistente' using errcode = '22023';
  end if;
  if v_antes is not distinct from p_vinculo_id then
    return p_vinculo_id;
  end if;
  update public.avaliacoes_pesquisas set alerta_vinculo_id = p_vinculo_id, atualizado_em = now() where id = v_id;
  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (p_unidade_id, auth.uid(), 'avaliacoes_definir_destinatario', 'avaliacoes_pesquisa', v_id::text,
          jsonb_build_object('vinculoId', v_antes), jsonb_build_object('vinculoId', p_vinculo_id));
  return p_vinculo_id;
end;
$$;
revoke all on function public.avaliacoes_definir_destinatario(text, uuid) from public, anon;
grant execute on function public.avaliacoes_definir_destinatario(text, uuid) to authenticated;

-- ══ 10. Página pública (só o servidor) ═══════════════════════════════════

-- O que a página /avaliar/<slug>/<origem> precisa: marca, perguntas ativas da versão atual e o
-- texto do consentimento vigente. Nulo = não existe ou o módulo está desligado.
create or replace function public.avaliacoes_pesquisa_publica(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'slug', p.slug, 'nome', p.nome_exibido, 'corPrincipal', p.cor_principal, 'corFundo', p.cor_fundo,
           'logoPath', p.logo_path, 'agradecimento', p.texto_agradecimento, 'linkGoogle', p.link_google,
           'ativa', p.ativa, 'versao', p.versao_atual, 'perguntas', v.perguntas,
           'termoVersao', t.versao, 'termoTexto', replace(t.modelo, '{restaurante}', p.nome_exibido))
    from public.avaliacoes_pesquisas p
    join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
    join public.organizacoes o on o.id = u.organizacao_id and o.ativo
    join public.avaliacoes_pesquisa_versoes v on v.pesquisa_id = p.id and v.versao = p.versao_atual
    cross join lateral (select * from public.avaliacoes_termos order by versao desc limit 1) t
   where p.slug = p_slug;
$$;
revoke all on function public.avaliacoes_pesquisa_publica(text) from public, anon, authenticated;
grant execute on function public.avaliacoes_pesquisa_publica(text) to service_role;

-- Grava uma avaliação. Só o servidor do Zatti Hub chama (service role), que calcula os hashes:
-- ninguém fura o limite chamando a RPC direto.
-- Retorno: {ok:true} | {ok:true, descartada:true} (armadilha ou rápido demais: finge sucesso) |
--          {ok:false, codigo: nao_encontrada | encerrada | limite | invalida | whatsapp_invalido, campo?}
-- Limites: por aparelho, 1 a cada 30 min e 5 por dia; por IP, 40 por hora (Wi-Fi do salão e
-- internet de celular dividem IP, por isso folgado).
create or replace function public.avaliacoes_registrar(
  p_slug text,
  p_origem text,
  p_respostas jsonb,
  p_whatsapp text,
  p_consentimento boolean,
  p_termo_versao integer,
  p_armadilha text,
  p_decorrido_ms integer,
  p_hash_ip text,
  p_hash_dispositivo text,
  p_agora timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_perguntas jsonb;
  v_atendimento smallint;
  v_comida smallint;
  v_nps smallint;
  v_espera text;
  v_conheceu text;
  v_conheceu_outro text;
  v_comentario text;
  v_val jsonb;
  v_digitos text;
  v_whatsapp text;
  v_termo_texto text;
  v_baixa boolean;
  v_id uuid;
begin
  if p_armadilha is not null and btrim(p_armadilha) <> '' then
    return jsonb_build_object('ok', true, 'descartada', true);
  end if;
  if p_decorrido_ms is null or p_decorrido_ms < 4000 then
    return jsonb_build_object('ok', true, 'descartada', true);
  end if;
  if coalesce(p_hash_ip, '') !~ '^[0-9a-f]{64}$' or coalesce(p_hash_dispositivo, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'hash_invalido' using errcode = '22023';
  end if;
  if p_origem is null or p_origem not in ('salao', 'delivery') then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrada');
  end if;

  select p.id, p.unidade_id, p.ativa, p.versao_atual, p.nome_exibido, p.alerta_vinculo_id into v_p
    from public.avaliacoes_pesquisas p
    join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
    join public.organizacoes o on o.id = u.organizacao_id and o.ativo
   where p.slug = p_slug;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'nao_encontrada');
  end if;
  if not v_p.ativa then
    return jsonb_build_object('ok', false, 'codigo', 'encerrada');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('avaliacoes_registrar:' || v_p.id::text || ':' || p_hash_dispositivo, 0));
  if exists (select 1 from public.avaliacoes_respostas r
              where r.pesquisa_id = v_p.id and r.hash_dispositivo = p_hash_dispositivo
                and r.criado_em > p_agora - interval '30 minutes')
     or (select count(*) from public.avaliacoes_respostas r
          where r.pesquisa_id = v_p.id and r.hash_dispositivo = p_hash_dispositivo
            and r.criado_em > p_agora - interval '24 hours') >= 5
     or (select count(*) from public.avaliacoes_respostas r
          where r.pesquisa_id = v_p.id and r.hash_ip = p_hash_ip
            and r.criado_em > p_agora - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'codigo', 'limite');
  end if;

  select perguntas into v_perguntas from public.avaliacoes_pesquisa_versoes where pesquisa_id = v_p.id and versao = v_p.versao_atual;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    return jsonb_build_object('ok', false, 'codigo', 'invalida');
  end if;

  -- Notas de 1 a 5 (obrigatórias quando ativas).
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'atendimento') then
    v_val := p_respostas -> 'atendimento';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'atendimento');
    end if;
    v_atendimento := (v_val #>> '{}')::smallint;
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'comida') then
    v_val := p_respostas -> 'comida';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^[1-5]$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'comida');
    end if;
    v_comida := (v_val #>> '{}')::smallint;
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'espera') then
    v_val := p_respostas -> 'espera';
    if v_val is null or jsonb_typeof(v_val) <> 'string'
       or (v_val #>> '{}') not in ('ate_15', 'de_15_a_30', 'de_30_a_45', 'mais_de_45') then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'espera');
    end if;
    v_espera := v_val #>> '{}';
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'nps') then
    v_val := p_respostas -> 'nps';
    if v_val is null or jsonb_typeof(v_val) <> 'number' or (v_val #>> '{}') !~ '^([0-9]|10)$' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'nps');
    end if;
    v_nps := (v_val #>> '{}')::smallint;
  end if;
  -- Opcionais.
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'conheceu') then
    v_val := p_respostas -> 'conheceu';
    if v_val is not null and jsonb_typeof(v_val) <> 'null' then
      if jsonb_typeof(v_val) <> 'string'
         or (v_val #>> '{}') not in ('instagram', 'google', 'ifood', 'indicacao', 'passando', 'ja_cliente', 'outro') then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'conheceu');
      end if;
      v_conheceu := v_val #>> '{}';
      if v_conheceu = 'outro' and jsonb_typeof(p_respostas -> 'conheceu_outro') = 'string' then
        v_conheceu_outro := nullif(btrim(regexp_replace(p_respostas ->> 'conheceu_outro', '[\x01-\x1F\x7F]', ' ', 'g')), '');
        if char_length(v_conheceu_outro) > 80 then
          return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'conheceu');
        end if;
      end if;
    end if;
  end if;
  if public.avaliacoes_pergunta_ativa(v_perguntas, 'comentario') then
    v_val := p_respostas -> 'comentario';
    if v_val is not null and jsonb_typeof(v_val) = 'string' then
      v_comentario := nullif(btrim(regexp_replace(v_val #>> '{}', '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
      if char_length(v_comentario) > 1000 then
        return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'comentario');
      end if;
    elsif v_val is not null and jsonb_typeof(v_val) <> 'null' then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'comentario');
    end if;
  end if;

  -- WhatsApp: só com o consentimento marcado e o número preenchido. Guarda 55 + DDD + número.
  if coalesce(p_consentimento, false) and nullif(btrim(coalesce(p_whatsapp, '')), '') is not null then
    v_digitos := regexp_replace(p_whatsapp, '\D', '', 'g');
    if v_digitos ~ '^[1-9][0-9]{9,10}$' then
      v_digitos := '55' || v_digitos;
    end if;
    if v_digitos !~ '^55[1-9][0-9]{9,10}$' then
      return jsonb_build_object('ok', false, 'codigo', 'whatsapp_invalido');
    end if;
    v_termo_texto := public.avaliacoes_texto_termo(p_termo_versao, v_p.nome_exibido);
    if v_termo_texto is null then
      return jsonb_build_object('ok', false, 'codigo', 'invalida', 'campo', 'consentimento');
    end if;
    v_whatsapp := v_digitos;
  end if;

  v_baixa := coalesce(v_atendimento <= 2, false) or coalesce(v_comida <= 2, false) or coalesce(v_nps <= 6, false);

  insert into public.avaliacoes_respostas (
    pesquisa_id, unidade_id, versao, origem, atendimento, comida, espera, nps, conheceu, conheceu_outro, comentario,
    nota_baixa, whatsapp, consentimento_em, consentimento_versao, consentimento_texto, hash_ip, hash_dispositivo, criado_em
  ) values (
    v_p.id, v_p.unidade_id, v_p.versao_atual, p_origem, v_atendimento, v_comida, v_espera, v_nps, v_conheceu,
    case when v_conheceu = 'outro' then v_conheceu_outro end, v_comentario, v_baixa,
    v_whatsapp,
    case when v_whatsapp is not null then p_agora end,
    case when v_whatsapp is not null then p_termo_versao end,
    case when v_whatsapp is not null then v_termo_texto end,
    p_hash_ip, p_hash_dispositivo, p_agora
  ) returning id into v_id;

  if v_baixa and v_p.alerta_vinculo_id is not null then
    insert into public.avaliacoes_alertas (unidade_id, resposta_id, gerado_em) values (v_p.unidade_id, v_id, p_agora);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz)
  to service_role;

-- ══ 11. Ciclo do Vini (mesmo token e desenho dos avisos do Garante) ══════
-- Para cada unidade com alerta pendente: expira o que passou de 3 dias; só das 7h às 23h (São
-- Paulo) e com o destinatário ainda válido, reserva tudo numa tentativa e devolve a lista.
-- Reserva sem confirmação em 15 min vira 'incerto' e não volta à fila.
create or replace function public.avaliacoes_alertas_reservar(p_agora timestamptz default now())
returns table (unidade_id text, unidade_nome text, tentativa_id uuid, telefone text, destinatario_nome text, alertas jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hora integer := extract(hour from (p_agora at time zone 'America/Sao_Paulo'))::integer;
  v_u record;
  v_tentativa uuid;
  v_alertas jsonb;
begin
  update public.avaliacoes_alertas a
     set estado = 'incerto', fechado_em = p_agora, motivo = 'reserva_vencida'
   where a.estado = 'reservado' and a.reservado_em < p_agora - interval '15 minutes';
  update public.avaliacoes_alertas a
     set estado = 'expirado', fechado_em = p_agora, motivo = 'mais_de_3_dias'
   where a.estado = 'pendente' and a.gerado_em < p_agora - interval '3 days';

  for v_u in
    select p.unidade_id as unidade, p.nome_exibido as nome, v.whatsapp as whatsapp, pf.nome as nome_pessoa,
           public.avaliacoes_motivo_vinculo_alerta(p.unidade_id, p.alerta_vinculo_id) as motivo
      from public.avaliacoes_pesquisas p
      join public.unidades u on u.id = p.unidade_id and u.ativo and u.avaliacoes_habilitado
      join public.vinculos v on v.id = p.alerta_vinculo_id
      left join public.perfis pf on pf.id = v.user_id
     where exists (select 1 from public.avaliacoes_alertas a where a.unidade_id = p.unidade_id and a.estado = 'pendente')
     order by p.unidade_id
  loop
    if v_u.motivo is not null or v_hora < 7 or v_hora >= 23 then
      continue;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('avaliacoes_alertas:' || v_u.unidade, 0));
    v_tentativa := gen_random_uuid();
    with r as (
      update public.avaliacoes_alertas a
         set estado = 'reservado', tentativa_id = v_tentativa, reservado_em = p_agora, tentativas = a.tentativas + 1
       where a.unidade_id = v_u.unidade and a.estado = 'pendente'
       returning a.resposta_id
    )
    select jsonb_agg(jsonb_build_object(
             'respostaId', s.id, 'criadoEm', s.criado_em, 'origem', s.origem, 'atendimento', s.atendimento,
             'comida', s.comida, 'nps', s.nps, 'espera', s.espera, 'comentario', left(s.comentario, 300),
             'whatsappCliente', s.whatsapp) order by s.criado_em, s.id)
      into v_alertas
      from r join public.avaliacoes_respostas s on s.id = r.resposta_id;
    if v_alertas is null then
      continue;
    end if;
    unidade_id := v_u.unidade;
    unidade_nome := v_u.nome;
    tentativa_id := v_tentativa;
    telefone := v_u.whatsapp;
    destinatario_nome := v_u.nome_pessoa;
    alertas := v_alertas;
    return next;
  end loop;
end;
$$;
revoke all on function public.avaliacoes_alertas_reservar(timestamptz) from public, anon, authenticated;
grant execute on function public.avaliacoes_alertas_reservar(timestamptz) to service_role;

-- Mesma regra de garante_avisos_confirmar: 'enviado' fecha, 'incerto' fecha sem repetir, 'falhou'
-- volta à fila até a 3ª tentativa enquanto a reserva vale (15 min). Repetir é inócuo.
create or replace function public.avaliacoes_alertas_confirmar(p_tentativa_id uuid, p_resultado text, p_agora timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := coalesce(p_agora, now());
  v_limite timestamptz := coalesce(p_agora, now()) - interval '15 minutes';
  v_n integer;
begin
  if p_tentativa_id is null or p_resultado is null or p_resultado not in ('enviado', 'falhou', 'incerto') then
    raise exception 'resultado_invalido' using errcode = '22023';
  end if;
  update public.avaliacoes_alertas a
     set estado = case when p_resultado = 'enviado' then 'enviado'
                       when p_resultado = 'incerto' or a.reservado_em < v_limite then 'incerto'
                       when a.tentativas >= 3 then 'falhou'
                       else 'pendente' end,
         fechado_em = case when p_resultado = 'falhou' and a.tentativas < 3 and a.reservado_em >= v_limite then null
                           else v_agora end,
         motivo = case when p_resultado <> 'falhou' then null
                       when a.reservado_em < v_limite then 'reserva_vencida'
                       else 'falhou_' || a.tentativas::text end
   where a.tentativa_id = p_tentativa_id and a.estado = 'reservado';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.avaliacoes_alertas_confirmar(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.avaliacoes_alertas_confirmar(uuid, text, timestamptz) to service_role;

-- ══ 12. Logo: bucket público só para leitura ═════════════════════════════
-- Até 300 KB, PNG, JPEG ou SVG. Sem policy em storage.objects para authenticated/anon: quem grava
-- e apaga é o servidor (service role) depois de conferir a permissão; a leitura é pela URL pública.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avaliacoes-logos', 'avaliacoes-logos', true, 307200, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ══ 13. Operador do Vini: nenhuma função nova (default privileges) ═══════
revoke execute on function public.usuario_pode_usar_avaliacoes(text, text) from vini_operador;
revoke execute on function public.avaliacoes_texto_termo(integer, text) from vini_operador;
revoke execute on function public.avaliacoes_contraste(text, text) from vini_operador;
revoke execute on function public.avaliacoes_validar_perguntas(jsonb) from vini_operador;
revoke execute on function public.avaliacoes_perguntas_padrao() from vini_operador;
revoke execute on function public.avaliacoes_pergunta_ativa(jsonb, text) from vini_operador;
revoke execute on function public.avaliacoes_motivo_vinculo_alerta(text, uuid) from vini_operador;
revoke execute on function public.avaliacoes_criar_pesquisa(text) from vini_operador;
revoke execute on function public.avaliacoes_salvar_marca(text, text, text, text, text, text, boolean) from vini_operador;
revoke execute on function public.avaliacoes_definir_logo(text, text) from vini_operador;
revoke execute on function public.avaliacoes_salvar_perguntas(text, jsonb) from vini_operador;
revoke execute on function public.avaliacoes_definir_destinatario(text, uuid) from vini_operador;
revoke execute on function public.avaliacoes_pesquisa_publica(text) from vini_operador;
revoke execute on function public.avaliacoes_registrar(text, text, jsonb, text, boolean, integer, text, integer, text, text, timestamptz) from vini_operador;
revoke execute on function public.avaliacoes_alertas_reservar(timestamptz) from vini_operador;
revoke execute on function public.avaliacoes_alertas_confirmar(uuid, text, timestamptz) from vini_operador;

commit;
