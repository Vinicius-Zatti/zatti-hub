-- Fator de correção (perda/quebra de preparo, ex: tomate perde peso ao
-- limpar - preço efetivo por kg utilizável fica maior que o preço de
-- compra) - dimensão separada da conversão de unidade, pode se aplicar
-- mesmo sem trocar de unidade.
alter table public.produto_conversoes
  add column if not exists fator_correcao numeric(6,3) not null default 1 check (fator_correcao > 0);
