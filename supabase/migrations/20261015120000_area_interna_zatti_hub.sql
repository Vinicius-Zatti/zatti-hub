-- Área de trabalho do Vinícius (15/10/2026): organização própria "Zatti HUB", separada das
-- organizações de cliente. Com ela escolhida no seletor, o app mostra só Início, Agenda, Meu Tempo,
-- Comercial, Clientes, Conteúdo, Time de IA e Acessos; nas organizações de cliente, o master vê só
-- os módulos do restaurante.
--
-- `organizacoes.area_interna` marca a organização. Só pode haver uma (índice único parcial). Ela
-- precisa de uma unidade ativa porque `getAcessoAtual` sempre resolve uma unidade; essa unidade
-- nasce com todos os módulos de restaurante desligados e estoque no banco (vazio).
-- Ninguém tem vínculo de cliente com ela: só o master a enxerga (RLS de sempre).
-- A coluna não tem policy de escrita: muda só por SQL do dono, como as flags de `unidades`.
--
-- Rodar ANTES de publicar o app: o código novo lê `organizacoes.area_interna`.
-- Desfazer: `update public.organizacoes set ativo = false where id = 'zatti-hub';`
begin;

alter table public.organizacoes
  add column if not exists area_interna boolean not null default false;

comment on column public.organizacoes.area_interna is
  'Área de trabalho do Vinícius (15/10/2026): organização interna "Zatti HUB", sem módulos de restaurante.';

create unique index if not exists organizacoes_uma_area_interna
  on public.organizacoes (area_interna) where area_interna;

insert into public.organizacoes (id, nome, tipo_cliente, ativo, area_interna)
values ('zatti-hub', 'Zatti HUB', 'saas', true, true)
on conflict (id) do update set area_interna = true, ativo = true;

insert into public.unidades (id, organizacao_id, nome, spreadsheet_id, ativo, fonte_dados_estoque)
values ('zatti-hub-escritorio', 'zatti-hub', 'Escritório', null, true, 'banco')
on conflict (id) do nothing;

commit;

