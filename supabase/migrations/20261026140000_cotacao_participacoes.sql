-- Participação do fornecedor por cotação (parecer do Codex de 24/10/2026, ponto 3).
-- Confirmar o vencedor apaga o item dos concorrentes que perderam. O desfazer recria o item
-- nos concorrentes que a tela reconstrói, e a tela só sabia deles pelo Fornecedor 1 a 4 do
-- Cadastro ou pelo item salvo no pedido. O fornecedor trazido pelo "+ Adicionar item" sem
-- vaga no Cadastro (ou com o vínculo falhado) sumia dessa lista depois de recarregar e o
-- desfazer não o restaurava.
--
-- Aqui fica registrado, por unidade + contagem base + fornecedor + SKU, que o fornecedor
-- entrou na cotação daquele item. A linha nasce sozinha quando o item entra no pedido do
-- fornecedor (gatilho depois do insert em pedido_itens) e nunca é apagada pelo vencedor:
-- é dela que a tela e o desfazer tiram os concorrentes, independente das 4 vagas do Cadastro.
--
-- Só aditiva: tabela nova, função nova, gatilho novo e cópia dos itens que já existem.
-- Nenhuma tabela, coluna ou função existente muda.

begin;

create table if not exists public.cotacao_participacoes (
  unidade_id text not null references public.unidades(id),
  data_contagem_base text not null,
  fornecedor text not null,
  sku text not null,
  criado_em timestamptz not null default now(),
  primary key (unidade_id, data_contagem_base, fornecedor, sku)
);

alter table public.cotacao_participacoes enable row level security;

-- Leitura pelo mesmo escopo dos pedidos. Escrita só pelo gatilho (dono da tabela): o app
-- nunca grava aqui direto.
drop policy if exists cotacao_participacoes_select_por_vinculo on public.cotacao_participacoes;
create policy cotacao_participacoes_select_por_vinculo on public.cotacao_participacoes
  for select to authenticated
  using (unidade_id in (select public.unidades_acessiveis()));

revoke all on public.cotacao_participacoes from anon;
revoke insert, update, delete, truncate on public.cotacao_participacoes from authenticated;
grant select on public.cotacao_participacoes to authenticated;

create or replace function public.registrar_participacao_cotacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cotacao_participacoes (unidade_id, data_contagem_base, fornecedor, sku)
  select p.unidade_id, p.data_contagem_base, p.fornecedor, new.sku
  from public.pedidos p
  where p.id = new.pedido_id
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.registrar_participacao_cotacao() from public, anon, authenticated;

drop trigger if exists registrar_participacao_cotacao on public.pedido_itens;
create trigger registrar_participacao_cotacao
  after insert on public.pedido_itens
  for each row execute function public.registrar_participacao_cotacao();

-- Itens que já estão nos pedidos passam a contar como participação. Concorrente que já
-- perdeu antes desta migration não tem mais item e não volta por aqui.
insert into public.cotacao_participacoes (unidade_id, data_contagem_base, fornecedor, sku)
select distinct p.unidade_id, p.data_contagem_base, p.fornecedor, pi.sku
from public.pedido_itens pi
join public.pedidos p on p.id = pi.pedido_id
on conflict do nothing;

commit;
