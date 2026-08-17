-- Ajustes de Fichas Técnicas a partir do primeiro teste real (Zatti Teste):
-- 1) regra do SKU corrigida pra bater com a mesma lógica de diferenciação
--    já documentada em src/lib/skus/sugerir.ts (produtos): 1 palavra = 3
--    letras dela; 2 palavras = 1ª letra da 1ª + 2 primeiras da 2ª; 3+
--    palavras = 1ª letra de cada uma das 3 primeiras. Conectores (de/da/do
--    etc) não contam como palavra.
-- 2) permite excluir ficha técnica (só Gestão/master) - trigger de
--    ficha_componentes já bloqueia excluir uma ficha em uso como
--    sub-receita de outra (on delete restrict).
-- 3) tabela de conversão de unidade por produto (unidade de saída usada nas
--    fichas técnicas + fator, ex: óleo de soja entra 1 UND de 900ml, sai em
--    ML nas fichas - 1 produto = 1 conversão, opcional).
begin;

create or replace function public.prefixo_sku_ficha(p_nome text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_normalizado text;
  v_todas_palavras text[];
  v_palavras text[] := array[]::text[];
  v_palavra text;
  v_conectores text[] := array['DE','DA','DO','DAS','DOS','E','COM','SEM','AO','A','O','AS','OS','NO','NA','NOS','NAS'];
  v_prefixo text;
begin
  v_normalizado := upper(extensions.unaccent(coalesce(p_nome, '')));
  v_todas_palavras := regexp_split_to_array(v_normalizado, '[^A-Za-z]+');

  foreach v_palavra in array v_todas_palavras loop
    v_palavra := regexp_replace(v_palavra, '[^A-Z]', '', 'g');
    if v_palavra <> '' and not (v_palavra = any(v_conectores)) then
      v_palavras := array_append(v_palavras, v_palavra);
    end if;
  end loop;

  if array_length(v_palavras, 1) is null then
    v_prefixo := '';
  elsif array_length(v_palavras, 1) = 1 then
    v_prefixo := left(v_palavras[1], 3);
  elsif array_length(v_palavras, 1) = 2 then
    v_prefixo := left(v_palavras[1], 1) || left(v_palavras[2], 2);
  else
    v_prefixo := left(v_palavras[1], 1) || left(v_palavras[2], 1) || left(v_palavras[3], 1);
  end if;

  return rpad(v_prefixo, 3, 'X');
end;
$$;

drop policy if exists "fichas_tecnicas_delete_gestao" on public.fichas_tecnicas;
create policy "fichas_tecnicas_delete_gestao" on public.fichas_tecnicas
  for delete to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

drop table if exists public.produto_conversoes;

create table public.produto_conversoes (
  unidade_id text not null references public.unidades(id),
  produto_sku text not null,
  unidade_saida text not null check (unidade_saida ~ '^[A-Z0-9]{1,20}$'),
  fator_por_unidade_base numeric(14,4) not null check (fator_por_unidade_base > 0),
  descricao text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (unidade_id, produto_sku),
  foreign key (unidade_id, produto_sku)
    references public.produtos(unidade_id, sku) on update restrict on delete restrict
);

alter table public.produto_conversoes enable row level security;

create policy "produto_conversoes_select" on public.produto_conversoes
  for select to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, null));

create policy "produto_conversoes_gestao" on public.produto_conversoes
  for all to authenticated
  using (public.usuario_pode_usar_fichas(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_fichas(unidade_id, array['gestao']));

create or replace function public.proteger_produto_conversao()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.unidade_saida := upper(trim(new.unidade_saida));
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_produto_conversao() from public, anon, authenticated;

drop trigger if exists proteger_produto_conversao on public.produto_conversoes;
create trigger proteger_produto_conversao
  before insert or update on public.produto_conversoes
  for each row execute function public.proteger_produto_conversao();

commit;
