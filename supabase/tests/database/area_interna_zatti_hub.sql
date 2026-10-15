-- Área de trabalho do Vinícius (15/10/2026) - fronteira no banco.
-- Prova: a organização "Zatti HUB" existe marcada como interna, com uma unidade ativa sem módulos
-- de restaurante; só pode haver uma organização interna; e as organizações de antes continuam
-- como clientes (default false).

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  (select area_interna from public.organizacoes where id = 'zatti-hub'),
  true,
  'Zatti HUB existe e é a área interna'
);
select is(
  (select count(*)::int from public.unidades where organizacao_id = 'zatti-hub' and ativo),
  1,
  'Zatti HUB tem uma unidade ativa (getAcessoAtual precisa de uma)'
);
select ok(
  (select not (consolidado_vendas_habilitado or financeiro_gerencial_habilitado or fichas_tecnicas_habilitado or garante_habilitado)
     from public.unidades where id = 'zatti-hub-escritorio'),
  'a unidade Escritório nasce sem módulos de restaurante'
);

insert into public.organizacoes (id, nome, tipo_cliente) values ('cliente-teste-area', 'Cliente Teste', 'saas');
select is(
  (select area_interna from public.organizacoes where id = 'cliente-teste-area'),
  false,
  'organização nova é cliente por padrão'
);

select throws_ok(
  $$insert into public.organizacoes (id, nome, tipo_cliente, area_interna) values ('outra-interna', 'Outra', 'saas', true)$$,
  '23505',
  null,
  'só existe uma área interna'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'organizacoes' and cmd in ('UPDATE', 'ALL')),
  0,
  'nenhuma policy deixa o app mudar organizações (área interna só por SQL)'
);

select * from finish();
rollback;
