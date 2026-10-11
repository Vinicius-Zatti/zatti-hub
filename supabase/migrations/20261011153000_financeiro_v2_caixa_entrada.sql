-- Financeiro V2, fatia F4 (11/10/2026): Caixa de Entrada de notas, boletos e recibos.
--
-- Pedido de Vinícius: "receber notas e recibos pelo wpp ... e também a opção de fazer uma pasta no
-- google drive". Desenho D8/D9 com o veredito do Codex:
-- - Entrada por upload na tela, pelo WhatsApp do Vini (só número cadastrado, um número = uma
--   unidade na V1) e por pasta do Google Drive da unidade (lida pelo Vini).
-- - Mesmo arquivo (sha256) na mesma unidade reaproveita a entrada, venha do canal que vier.
-- - Integração externa autentica por token com escopo (hash em tabela sem grant). O service role
--   do servidor só guarda o arquivo e a leitura da IA; quem lança é sempre uma pessoa, pela RPC
--   `fin_caixa_entrada_lancar` (cria o documento e vincula a entrada na mesma transação).
-- - Leitura recuperável: situação, tentativas e trava de 10 minutos.
begin;

-- ── Tokens de integração (Vini) ───────────────────────────────────────────
create table if not exists public.fin_integracao_tokens (
  escopo text not null check (escopo in ('caixa_entrada', 'alertas')),
  versao integer not null check (versao > 0),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (escopo, versao)
);
alter table public.fin_integracao_tokens enable row level security;
revoke all on table public.fin_integracao_tokens from public, anon, authenticated;

create or replace function public.fin_integracao_token_valido(p_token text, p_escopo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null and char_length(p_token) between 32 and 200 and exists (
    select 1 from public.fin_integracao_tokens t
    where t.escopo = p_escopo and t.ativo
      and t.hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
  );
$$;
revoke all on function public.fin_integracao_token_valido(text, text) from public, anon, authenticated;

-- ── Remetentes autorizados e pastas do Drive ──────────────────────────────
create table if not exists public.fin_caixa_entrada_remetentes (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  telefone text not null check (telefone ~ '^[0-9]{12,13}$'),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
-- V1: um número serve uma unidade só (escolha entre unidades fica para depois).
create unique index if not exists fin_caixa_entrada_remetente_unico
  on public.fin_caixa_entrada_remetentes (telefone) where ativo;

create table if not exists public.fin_caixa_entrada_pastas (
  unidade_id text primary key references public.unidades(id),
  situacao text not null default 'solicitada' check (situacao in ('solicitada', 'ativa', 'desligada')),
  email_compartilhar text check (email_compartilhar is null or email_compartilhar ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  pasta_id text check (pasta_id is null or pasta_id ~ '^[A-Za-z0-9_-]{10,100}$'),
  link text check (link is null or link ~ '^https://drive\.google\.com/'),
  solicitada_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now(),
  check (situacao <> 'ativa' or pasta_id is not null)
);

-- ── Entradas ──────────────────────────────────────────────────────────────
create table if not exists public.fin_caixa_entrada (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  canal text not null check (canal in ('upload', 'whatsapp', 'drive')),
  remetente text check (remetente is null or char_length(remetente) <= 120),
  nome_arquivo text not null check (char_length(nome_arquivo) between 1 and 160),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml')),
  tamanho_bytes integer not null check (tamanho_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  caminho_arquivo text not null,
  arquivo_gravado boolean not null default false,
  situacao text not null default 'recebido'
    check (situacao in ('recebido', 'lendo', 'lido', 'falhou', 'lancado', 'anexado', 'descartado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  lendo_desde timestamptz,
  erro_codigo text check (erro_codigo is null or erro_codigo ~ '^[a-z0-9_]{1,60}$'),
  extracao jsonb check (extracao is null or jsonb_typeof(extracao) = 'object'),
  documento_id uuid,
  lancamento_id uuid,
  descarte_motivo text check (descarte_motivo is null or char_length(descarte_motivo) between 3 and 300),
  tratado_por uuid references auth.users(id),
  tratado_em timestamptz,
  criado_por uuid references auth.users(id),
  recebido_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, id),
  foreign key (unidade_id, documento_id) references public.fin_documentos(unidade_id, id),
  foreign key (unidade_id, lancamento_id) references public.fin_lancamentos(unidade_id, id) on delete set null,
  check ((situacao = 'lancado') = (documento_id is not null)),
  check (situacao <> 'anexado' or lancamento_id is not null),
  check ((situacao = 'descartado') = (descarte_motivo is not null))
);
create unique index if not exists fin_caixa_entrada_sha_unico
  on public.fin_caixa_entrada (unidade_id, sha256) where situacao <> 'descartado';
create index if not exists fin_caixa_entrada_fila on public.fin_caixa_entrada (unidade_id, situacao, recebido_em desc);

alter table public.fin_caixa_entrada enable row level security;
alter table public.fin_caixa_entrada_remetentes enable row level security;
alter table public.fin_caixa_entrada_pastas enable row level security;
revoke all on table public.fin_caixa_entrada, public.fin_caixa_entrada_remetentes, public.fin_caixa_entrada_pastas
  from public, anon, authenticated;
grant select on table public.fin_caixa_entrada, public.fin_caixa_entrada_remetentes, public.fin_caixa_entrada_pastas to authenticated;
create policy "fin_caixa_entrada_select" on public.fin_caixa_entrada
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_caixa_entrada_remetentes_select" on public.fin_caixa_entrada_remetentes
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_caixa_entrada_pastas_select" on public.fin_caixa_entrada_pastas
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));

create trigger auditar_escrita after insert or update or delete on public.fin_caixa_entrada
  for each row execute function public.auditar_escrita_financeiro_gerencial();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fin-caixa-entrada', 'fin-caixa-entrada', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'])
on conflict (id) do nothing;
-- Sem policy de storage para authenticated: só o servidor (service role) grava e lê o original.

-- Uso de IA da Caixa de Entrada entra no mesmo relatório semanal (sem usuário quando vem do Vini).
alter table public.fin_ia_chamadas drop constraint if exists fin_ia_chamadas_finalidade_check;
alter table public.fin_ia_chamadas add constraint fin_ia_chamadas_finalidade_check
  check (finalidade in ('extracao_documento', 'classificacao', 'caixa_entrada'));
alter table public.fin_ia_chamadas alter column criado_por drop not null;
alter table public.fin_ia_chamadas add constraint fin_ia_chamadas_autor
  check (criado_por is not null or finalidade = 'caixa_entrada');

-- ── Registro de entrada (servidor, depois de validar sessão ou token) ────
-- Chamada só pelo service role (rota externa ou action do usuário). Devolve a entrada existente
-- quando o mesmo arquivo já está na Caixa de Entrada da unidade.
create or replace function public.fin_caixa_entrada_registrar(
  p_unidade text, p_canal text, p_remetente text, p_nome text, p_mime text, p_tamanho int, p_sha256 text,
  p_criado_por uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existente public.fin_caixa_entrada;
  v_id uuid := gen_random_uuid();
  v_ext text;
begin
  perform pg_advisory_xact_lock(hashtextextended('fin_cx_ent:' || p_unidade || ':' || p_sha256, 0));
  select * into v_existente from public.fin_caixa_entrada
    where unidade_id = p_unidade and sha256 = p_sha256 and situacao <> 'descartado';
  if found then
    return jsonb_build_object('id', v_existente.id, 'novo', false, 'caminho', v_existente.caminho_arquivo,
      'arquivo_gravado', v_existente.arquivo_gravado, 'situacao', v_existente.situacao);
  end if;
  v_ext := case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' else 'xml' end;
  insert into public.fin_caixa_entrada (id, unidade_id, canal, remetente, nome_arquivo, mime, tamanho_bytes, sha256,
    caminho_arquivo, criado_por)
  values (v_id, p_unidade, p_canal, left(p_remetente, 120), left(p_nome, 160), p_mime, p_tamanho, p_sha256,
    p_unidade || '/' || v_id || '/original.' || v_ext, p_criado_por);
  return jsonb_build_object('id', v_id, 'novo', true, 'caminho', p_unidade || '/' || v_id || '/original.' || v_ext,
    'arquivo_gravado', false, 'situacao', 'recebido');
end;
$$;
revoke all on function public.fin_caixa_entrada_registrar(text, text, text, text, text, int, text, uuid)
  from public, anon, authenticated;

-- Trava para leitura (10 minutos), recuperável.
create or replace function public.fin_caixa_entrada_travar_leitura(p_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  update public.fin_caixa_entrada
     set situacao = 'lendo', lendo_desde = now(), tentativas = tentativas + 1, atualizado_em = now()
   where id = p_id and arquivo_gravado
     and (situacao in ('recebido', 'falhou', 'lido') or (situacao = 'lendo' and lendo_desde < now() - interval '10 minutes'))
     and tentativas < 5
  returning true;
$$;
revoke all on function public.fin_caixa_entrada_travar_leitura(uuid) from public, anon, authenticated;

-- ── Lançar (pessoa): documento + vínculo numa transação ───────────────────
create or replace function public.fin_caixa_entrada_lancar(p_entrada uuid, p_documento jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ent public.fin_caixa_entrada;
  v_doc uuid;
begin
  select * into v_ent from public.fin_caixa_entrada where id = p_entrada for update;
  if not found or not public.usuario_pode_usar_financeiro_gerencial(v_ent.unidade_id, null) then
    raise exception 'Entrada invalida' using errcode = '42501';
  end if;
  if v_ent.situacao in ('lancado', 'anexado', 'descartado') then
    raise exception 'Entrada ja tratada' using errcode = 'P0001';
  end if;
  v_doc := public.fin_documento_criar(p_documento || jsonb_build_object('unidade', v_ent.unidade_id, 'origem', 'caixa_entrada'));
  update public.fin_caixa_entrada
     set situacao = 'lancado', documento_id = v_doc, tratado_por = auth.uid(), tratado_em = now(), atualizado_em = now()
   where id = v_ent.id;
  return v_doc;
end;
$$;
revoke all on function public.fin_caixa_entrada_lancar(uuid, jsonb) from public, anon;
grant execute on function public.fin_caixa_entrada_lancar(uuid, jsonb) to authenticated;

-- Anexar a um lançamento existente (comprovante de algo já lançado) ou descartar.
create or replace function public.fin_caixa_entrada_tratar(p_entrada uuid, p_acao text, p_lancamento uuid, p_motivo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ent public.fin_caixa_entrada;
begin
  select * into v_ent from public.fin_caixa_entrada where id = p_entrada for update;
  if not found or not public.usuario_pode_usar_financeiro_gerencial(v_ent.unidade_id, null) then
    raise exception 'Entrada invalida' using errcode = '42501';
  end if;
  if v_ent.situacao in ('lancado', 'anexado', 'descartado') then
    raise exception 'Entrada ja tratada' using errcode = 'P0001';
  end if;
  if p_acao = 'anexar' then
    if not exists (select 1 from public.fin_lancamentos l where l.unidade_id = v_ent.unidade_id and l.id = p_lancamento) then
      raise exception 'Lancamento invalido' using errcode = '23514';
    end if;
    update public.fin_caixa_entrada set situacao = 'anexado', lancamento_id = p_lancamento,
      tratado_por = auth.uid(), tratado_em = now(), atualizado_em = now() where id = v_ent.id;
  elsif p_acao = 'descartar' then
    if char_length(coalesce(trim(p_motivo), '')) < 3 then
      raise exception 'Informe o motivo para descartar' using errcode = '23514';
    end if;
    update public.fin_caixa_entrada set situacao = 'descartado', descarte_motivo = trim(p_motivo),
      tratado_por = auth.uid(), tratado_em = now(), atualizado_em = now() where id = v_ent.id;
  else
    raise exception 'Acao invalida' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.fin_caixa_entrada_tratar(uuid, text, uuid, text) from public, anon;
grant execute on function public.fin_caixa_entrada_tratar(uuid, text, uuid, text) to authenticated;

-- ── Configuração (Gestão): remetentes e pasta do Drive ────────────────────
create or replace function public.fin_caixa_entrada_configurar(p_unidade text, p_config jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text;
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

-- ── Alerta diário de contas a pagar pelo WhatsApp (D10) ───────────────────
create table if not exists public.fin_alerta_destinatarios (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  telefone text not null check (telefone ~ '^[0-9]{12,13}$'),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create unique index if not exists fin_alerta_destinatario_unico
  on public.fin_alerta_destinatarios (unidade_id, telefone) where ativo;

create table if not exists public.fin_alertas_enviados (
  unidade_id text not null references public.unidades(id),
  telefone text not null,
  data date not null,
  tipo text not null check (tipo in ('pagamentos_dia')),
  enviado_em timestamptz not null default now(),
  primary key (unidade_id, telefone, data, tipo)
);

alter table public.fin_alerta_destinatarios enable row level security;
alter table public.fin_alertas_enviados enable row level security;
revoke all on table public.fin_alerta_destinatarios, public.fin_alertas_enviados from public, anon, authenticated;
grant select on table public.fin_alerta_destinatarios to authenticated;
create policy "fin_alerta_destinatarios_select" on public.fin_alerta_destinatarios
  for select to authenticated using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));

-- Configuração ganha destinatários do alerta (mesma barreira de Gestão).
create or replace function public.fin_alerta_configurar(p_unidade text, p_config jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tel text;
begin
  if not public.usuario_pode_usar_financeiro_gerencial(p_unidade, array['gestao']) then
    raise exception 'Configuracao do alerta e restrita a Gestao/master' using errcode = '42501';
  end if;
  if p_config->>'acao' = 'adicionar' then
    v_tel := regexp_replace(coalesce(p_config->>'telefone', ''), '\D', '', 'g');
    if char_length(v_tel) in (10, 11) then v_tel := '55' || v_tel; end if;
    insert into public.fin_alerta_destinatarios (unidade_id, telefone, nome, criado_por)
    values (p_unidade, v_tel, trim(p_config->>'nome'), auth.uid());
  elsif p_config->>'acao' = 'remover' then
    update public.fin_alerta_destinatarios set ativo = false where unidade_id = p_unidade and id = (p_config->>'id')::uuid;
  else
    raise exception 'Acao invalida' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.fin_alerta_configurar(text, jsonb) from public, anon;
grant execute on function public.fin_alerta_configurar(text, jsonb) to authenticated;

-- ── Service role: só estas funções (rotas da integração e leitura do servidor) ──
grant execute on function public.fin_integracao_token_valido(text, text) to service_role;
grant execute on function public.fin_caixa_entrada_registrar(text, text, text, text, text, int, text, uuid) to service_role;
grant execute on function public.fin_caixa_entrada_travar_leitura(uuid) to service_role;
grant select, insert, update on table public.fin_caixa_entrada, public.fin_caixa_entrada_remetentes,
  public.fin_caixa_entrada_pastas, public.fin_alerta_destinatarios, public.fin_alertas_enviados to service_role;

commit;
