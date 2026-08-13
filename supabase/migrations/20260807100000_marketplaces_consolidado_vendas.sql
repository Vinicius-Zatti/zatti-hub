alter table consolidados_vendas
  add column if not exists ifood numeric(10,2) not null default 0,
  add column if not exists food99 numeric(10,2) not null default 0,
  add column if not exists total_marketplaces numeric(10,2) not null default 0,
  add column if not exists faturamento_total numeric(10,2);

update consolidados_vendas
set
  total_marketplaces = ifood + food99,
  faturamento_total = total_formas_pagamento + ifood + food99
where faturamento_total is null;

alter table consolidados_vendas
  alter column faturamento_total set not null;
