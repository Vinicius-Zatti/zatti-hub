-- Produto "só revenda" (sem transformação, ex: lata de refrigerante) ganha
-- uma ficha técnica de Venda automaticamente ao marcar `revenda` na grade de
-- Edição de Dados - evita montar na mão uma ficha de 1 componente só pra
-- cada item revendido puro. `ficha_revenda_id` rastreia qual ficha foi
-- criada por esse fluxo, pra marcar Inativa (nunca excluir - pode já ter
-- categoria/preço ajustados) se a pessoa desmarcar `revenda` depois, e pra
-- reaproveitar a mesma ficha (nunca duplicar) se marcar de novo.
begin;

alter table public.produtos
  add column if not exists revenda boolean not null default false,
  add column if not exists ficha_revenda_id uuid;

alter table public.produtos
  drop constraint if exists produtos_ficha_revenda_id_fkey,
  add constraint produtos_ficha_revenda_id_fkey
    foreign key (unidade_id, ficha_revenda_id)
    references public.fichas_tecnicas(unidade_id, id) on delete set null;

-- Categoria padrão pra ficha de revenda automática - mesmo padrão de seed
-- das categorias iniciais (ver 20260811100000_fichas_tecnicas.sql). Só nas
-- unidades que já usam Fichas Técnicas; unidade nova segue o mesmo caminho
-- manual das outras categorias (Categorias > + Nova categoria).
insert into public.categorias_ficha (unidade_id, camada, codigo, nome)
select u.id, 'VEN', 'REV', 'Revenda'
from public.unidades u
where u.fichas_tecnicas_habilitado = true
on conflict (unidade_id, camada, codigo) do nothing;

commit;
