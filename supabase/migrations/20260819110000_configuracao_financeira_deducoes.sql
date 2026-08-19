-- Deduções sobre o preço de venda (taxa média da maquininha + alíquota de
-- imposto) - entram no cálculo do Preço de Venda Sugerido e na margem real
-- de cada produto, junto com a margem de contribuição necessária.
alter table public.configuracao_financeira
  add column if not exists taxa_pagamento numeric(6,4) not null default 0 check (taxa_pagamento >= 0 and taxa_pagamento < 1),
  add column if not exists aliquota_imposto numeric(6,4) not null default 0 check (aliquota_imposto >= 0 and aliquota_imposto < 1);
