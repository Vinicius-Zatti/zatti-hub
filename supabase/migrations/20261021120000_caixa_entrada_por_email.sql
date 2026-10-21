-- Caixa de Entrada por e-mail (pedido de Vinícius em 21/10/2026): uma conta Gmail só para notas e um
-- apelido por unidade (conta+apelido@gmail.com). O cliente encaminha a nota que recebeu e o Vini lê a
-- caixa. Só vale e-mail vindo de remetente cadastrado pela Gestão da unidade, como no WhatsApp.
-- O apelido nasce sozinho no primeiro e-mail autorizado: primeira palavra do id da unidade
-- ("betones-bbq-betones-bbq" -> "betones"); se outra unidade já usa, fica o id inteiro.
begin;

alter table public.fin_caixa_entrada drop constraint if exists fin_caixa_entrada_canal_check;
alter table public.fin_caixa_entrada add constraint fin_caixa_entrada_canal_check
  check (canal in ('upload', 'whatsapp', 'drive', 'email'));

create table if not exists public.fin_caixa_entrada_enderecos (
  unidade_id text primary key references public.unidades(id),
  apelido text not null unique check (apelido ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  criado_em timestamptz not null default now()
);

create table if not exists public.fin_caixa_entrada_emails (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 120),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create unique index if not exists fin_caixa_entrada_email_unico
  on public.fin_caixa_entrada_emails (unidade_id, email) where ativo;

alter table public.fin_caixa_entrada_enderecos enable row level security;
alter table public.fin_caixa_entrada_emails enable row level security;
revoke all on table public.fin_caixa_entrada_enderecos, public.fin_caixa_entrada_emails from public, anon, authenticated;
grant select on table public.fin_caixa_entrada_enderecos, public.fin_caixa_entrada_emails to authenticated;
drop policy if exists "fin_caixa_entrada_enderecos_select" on public.fin_caixa_entrada_enderecos;
create policy "fin_caixa_entrada_enderecos_select" on public.fin_caixa_entrada_enderecos
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));
drop policy if exists "fin_caixa_entrada_emails_select" on public.fin_caixa_entrada_emails;
create policy "fin_caixa_entrada_emails_select" on public.fin_caixa_entrada_emails
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));
grant select, insert, update on table public.fin_caixa_entrada_enderecos, public.fin_caixa_entrada_emails to service_role;

create or replace function public.fin_caixa_entrada_configurar(p_unidade text, p_config jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text;
  v_email text;
  v_apelido text;
begin
  if not public.usuario_pode_usar_financeiro_gerencial(p_unidade, array['gestao']) then
    raise exception 'Configuracao da Caixa de Entrada e restrita a Gestao/master' using errcode = '42501';
  end if;
  if p_config->>'acao' = 'adicionar_remetente' then
    v_tel := regexp_replace(coalesce(p_config->>'telefone', ''), '\D', '', 'g');
    if char_length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
    if exists (select 1 from public.fin_caixa_entrada_remetentes r where r.telefone = v_tel and r.ativo) then
      raise exception 'Numero ja cadastrado em uma unidade' using errcode = '23505';
    end if;
    insert into public.fin_caixa_entrada_remetentes (unidade_id, telefone, nome, criado_por)
    values (p_unidade, v_tel, trim(p_config->>'nome'), auth.uid());
  elsif p_config->>'acao' = 'remover_remetente' then
    update public.fin_caixa_entrada_remetentes set ativo = false
      where unidade_id = p_unidade and id = (p_config->>'id')::uuid;
  elsif p_config->>'acao' = 'adicionar_email' then
    v_email := lower(trim(coalesce(p_config->>'email', '')));
    if exists (select 1 from public.fin_caixa_entrada_emails e where e.unidade_id = p_unidade and e.email = v_email and e.ativo) then
      raise exception 'E-mail ja cadastrado nesta unidade' using errcode = '23505';
    end if;
    insert into public.fin_caixa_entrada_emails (unidade_id, email, nome, criado_por)
    values (p_unidade, v_email, trim(p_config->>'nome'), auth.uid());
    if not exists (select 1 from public.fin_caixa_entrada_enderecos d where d.unidade_id = p_unidade) then
      v_apelido := regexp_replace(lower(split_part(p_unidade, '-', 1)), '[^a-z0-9]', '', 'g');
      if v_apelido = '' or exists (select 1 from public.fin_caixa_entrada_enderecos d where d.apelido = v_apelido) then
        v_apelido := regexp_replace(lower(p_unidade), '[^a-z0-9-]', '', 'g');
      end if;
      insert into public.fin_caixa_entrada_enderecos (unidade_id, apelido) values (p_unidade, left(v_apelido, 80));
    end if;
  elsif p_config->>'acao' = 'remover_email' then
    update public.fin_caixa_entrada_emails set ativo = false
      where unidade_id = p_unidade and id = (p_config->>'id')::uuid;
  elsif p_config->>'acao' = 'solicitar_pasta' then
    insert into public.fin_caixa_entrada_pastas (unidade_id, situacao, email_compartilhar, solicitada_por)
    values (p_unidade, 'solicitada', nullif(trim(p_config->>'email'), ''), auth.uid())
    on conflict (unidade_id) do update
      set email_compartilhar = excluded.email_compartilhar, solicitada_por = excluded.solicitada_por,
          situacao = case when public.fin_caixa_entrada_pastas.pasta_id is null then 'solicitada' else 'ativa' end,
          atualizado_em = now();
  elsif p_config->>'acao' = 'desligar_pasta' then
    update public.fin_caixa_entrada_pastas set situacao = 'desligada', atualizado_em = now() where unidade_id = p_unidade;
  else
    raise exception 'Acao invalida' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.fin_caixa_entrada_configurar(text, jsonb) from public, anon;
grant execute on function public.fin_caixa_entrada_configurar(text, jsonb) to authenticated;

commit;
