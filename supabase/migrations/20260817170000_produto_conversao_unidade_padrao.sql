-- "Und. na Ficha" só pode ser uma das 3 unidades padrão usadas em toda
-- Ficha Técnica (mesmo conjunto do rendimento: KG/LT/UN) - trava no banco,
-- não só na UI (o campo de texto livre virou select, mas a barreira que
-- vale de verdade é essa constraint).
alter table public.produto_conversoes
  drop constraint if exists produto_conversoes_unidade_saida_check;

alter table public.produto_conversoes
  add constraint produto_conversoes_unidade_saida_check check (unidade_saida in ('KG', 'LT', 'UN'));
