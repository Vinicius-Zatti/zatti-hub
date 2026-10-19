-- Papel de operação do Vini no app inteiro (decisão de Vinícius em 19/10/2026: "o Vini tem que ser o
-- responsável sempre por fazer tudo que eu mando fazer no app"). Lê e escreve em todas as tabelas do
-- schema public, passando pelas políticas próprias abaixo. Coisa sensível não é barrada aqui: é regra
-- de processo do Vini, que pede aprovação (alerta ou demanda) antes de agir.
-- Fora do alcance: schema auth (logins e senhas dos usuários) e storage.
-- A senha é definida fora do repositório e fica no cofre local (ZATTI_HUB_OPERADOR_URL).
-- Tabela nova criada depois desta migração precisa da política vini_operador_tudo na própria migração.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vini_operador') then
    create role vini_operador login noinherit connection limit 5;
  end if;
end
$$;

alter role vini_operador set statement_timeout = '30s';

grant usage on schema public to vini_operador;
grant select, insert, update, delete on all tables in schema public to vini_operador;
grant usage, select on all sequences in schema public to vini_operador;
grant execute on all functions in schema public to vini_operador;

alter default privileges in schema public grant select, insert, update, delete on tables to vini_operador;
alter default privileges in schema public grant usage, select on sequences to vini_operador;
alter default privileges in schema public grant execute on functions to vini_operador;

do $$
declare
  t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('drop policy if exists vini_operador_tudo on public.%I', t);
    execute format(
      'create policy vini_operador_tudo on public.%I for all to vini_operador using (true) with check (true)',
      t
    );
  end loop;
end
$$;
