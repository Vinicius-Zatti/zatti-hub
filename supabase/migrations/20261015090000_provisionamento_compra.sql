-- Compra do Zatti Hub com cadastro automático (15/10/2026).
-- Plano e decisões de Vinícius: _execucao/zatti-hub/compra-cadastro-automatico-plano.md.
-- O Vini, depois de conferir o pagamento aprovado no Mercado Pago, chama
-- POST /api/provisionamento/compra com o token do escopo 'provisionamento'. O app cria
-- organização (SaaS, nome = restaurante digitado), uma unidade (estoque no banco, Precificação
-- ligada, Financeiro desligado) e o usuário de gestão com senha provisória, e pede ao Vini o
-- envio do acesso pelo WhatsApp (mesma rota da Equipe).
--
--   fin_integracao_tokens            ganha o escopo 'provisionamento' (token do Vini, hash SHA-256)
--   zh_provisionamentos              um registro por pagamento: idempotência, situação e o que
--                                    já foi criado (organização, unidade, conta), para retomar
--                                    sem duplicar se uma tentativa cair no meio
--   zh_provisionamento_reservar      service role: reserva a vez de executar (uma tentativa por
--                                    vez; reserva sem conclusão em 10 min pode ser retomada;
--                                    depois de 6 tentativas vira revisão manual)
--
-- Sem token cadastrado nada é criado: a rota responde 401 e o Vini guarda a compra na fila.
-- Só acrescenta. Idempotente.
begin;

-- ── Escopo novo no token de integração ─────────────────────────────────────
do $$
declare
  v record;
begin
  for v in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.fin_integracao_tokens'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%escopo%'
  loop
    execute format('alter table public.fin_integracao_tokens drop constraint %I', v.conname);
  end loop;
end $$;
alter table public.fin_integracao_tokens
  add constraint fin_integracao_tokens_escopo_check
  check (escopo in ('caixa_entrada', 'alertas', 'garante', 'provisionamento'));

-- ── Um registro por pagamento ──────────────────────────────────────────────
create table if not exists public.zh_provisionamentos (
  id uuid primary key default gen_random_uuid(),
  pagamento_id text not null unique check (pagamento_id ~ '^[0-9]{1,20}$'),
  status text not null default 'processando'
    check (status in ('processando', 'concluido', 'revisao_manual', 'falhou')),
  email text not null check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and char_length(email) <= 254),
  nome text not null check (char_length(nome) between 2 and 160),
  whatsapp text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  restaurante text not null check (char_length(restaurante) between 2 and 120),
  valor numeric(12, 2),
  lead_site_id text check (lead_site_id is null or char_length(lead_site_id) <= 64),
  organizacao_id text references public.organizacoes(id) on delete restrict,
  unidade_id text references public.unidades(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  vinculo_id uuid references public.vinculos(id) on delete set null,
  envio text check (envio is null or envio in ('aceito', 'falhou', 'incerto')),
  motivo text not null default '' check (char_length(motivo) <= 300),
  tentativas integer not null default 0 check (tentativas >= 0),
  reservado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- Guarda e-mail e WhatsApp do comprador: ninguém do app lê, só o service role.
alter table public.zh_provisionamentos enable row level security;
revoke all on table public.zh_provisionamentos from public, anon, authenticated;
grant select, insert, update on table public.zh_provisionamentos to service_role;

drop trigger if exists tocar_atualizado_em on public.zh_provisionamentos;
create trigger tocar_atualizado_em before update on public.zh_provisionamentos
  for each row execute function public.tocar_atualizado_em();

-- ── Reserva da vez de executar ─────────────────────────────────────────────
-- Devolve {acao: 'executar' | 'terminado' | 'em_andamento', registro}. 'executar' traz o que já
-- foi criado em tentativas anteriores, para a rota continuar de onde parou.
create or replace function public.zh_provisionamento_reservar(p_pedido jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.zh_provisionamentos%rowtype;
  v_pag text := p_pedido->>'pagamento_id';
begin
  if v_pag is null or v_pag !~ '^[0-9]{1,20}$' then
    raise exception 'Pagamento invalido' using errcode = '22023';
  end if;

  insert into public.zh_provisionamentos
    (pagamento_id, status, email, nome, whatsapp, restaurante, valor, lead_site_id, tentativas, reservado_em)
  values (
    v_pag, 'processando', lower(btrim(p_pedido->>'email')), btrim(p_pedido->>'nome'), p_pedido->>'whatsapp',
    btrim(p_pedido->>'restaurante'), nullif(p_pedido->>'valor', '')::numeric, nullif(p_pedido->>'lead_site_id', ''),
    1, now()
  )
  on conflict (pagamento_id) do nothing
  returning * into v;
  if found then
    return jsonb_build_object('acao', 'executar', 'registro', to_jsonb(v));
  end if;

  select * into v from public.zh_provisionamentos p where p.pagamento_id = v_pag for update;
  if v.status in ('concluido', 'revisao_manual') then
    return jsonb_build_object('acao', 'terminado', 'registro', to_jsonb(v));
  end if;
  if v.status = 'processando' and v.reservado_em > now() - interval '10 minutes' then
    return jsonb_build_object('acao', 'em_andamento');
  end if;
  if v.tentativas >= 6 then
    update public.zh_provisionamentos p
       set status = 'revisao_manual',
           motivo = left('Falhou 6 vezes. Último erro: ' || coalesce(nullif(v.motivo, ''), 'sem detalhe'), 300)
     where p.id = v.id
    returning * into v;
    return jsonb_build_object('acao', 'terminado', 'registro', to_jsonb(v));
  end if;

  update public.zh_provisionamentos p
     set status = 'processando', tentativas = p.tentativas + 1, reservado_em = now()
   where p.id = v.id
  returning * into v;
  return jsonb_build_object('acao', 'executar', 'registro', to_jsonb(v));
end;
$$;
revoke all on function public.zh_provisionamento_reservar(jsonb) from public, anon, authenticated;
grant execute on function public.zh_provisionamento_reservar(jsonb) to service_role;

commit;

-- Depois de rodar: cadastrar o token do Vini (o valor fica só no cofre e na Railway).
-- insert into public.fin_integracao_tokens (escopo, versao, hash)
-- values ('provisionamento', 1, encode(extensions.digest(convert_to('<TOKEN>', 'UTF8'), 'sha256'), 'hex'));
