-- Insumo novo pela ficha técnica (decisão de Vinícius, 29/10/2026, depois de testar).
--
-- Quem edita ficha técnica (Cardápio "chef" ou mais: o chef da operação, o gerente chef e a
-- gestão com "editar" no Cardápio) cria produto novo pelo "+ Novo insumo" da ficha, mesmo sem
-- "editar" em Cadastros. Até aqui (20261026130000) criar produto exigia gestão (policy
-- `produtos_insert_gestao`) e "editar" em Cadastros (gatilho `permissao_modulo_editar`).
--
-- Só CRIAR. Editar o cadastro do produto (`permissao_modulo_editar_cadastro`, policy
-- `produtos_update_gestao`) e excluir continuam exatamente como estavam. Pelo caminho da ficha o
-- produto nasce só com os campos do cadastro rápido: ativo, sem revenda, sem pré-preparo, sem
-- fornecedor, sem embalagem do fornecedor e sem último preço pago (quem quiser completar usa
-- Cadastros). Desde 30/10/2026 (decisão de Vinícius), também só em grupo que entra em ficha
-- (nunca LIM nem OPE) e sem estoque mínimo nem estoque necessário da semana. `criado_em` e `atualizado_em` são carimbados pelo banco nesse caminho; `ordem`
-- (identidade) fica como a gestão já podia informar. O banco não sabe de qual tela veio o pedido: quem tem a regra da ficha também cria
-- pela Data API, com as mesmas travas de campo.
--
-- Lock: troca uma policy e um gatilho de `produtos` (curto). Rodar fora do horário dos
-- restaurantes.
--
-- Desfazer: voltar a policy para `usuario_tem_acesso_unidade(unidade_id, array['gestao'])`,
-- `drop trigger permissao_criar_produto on public.produtos`, recriar
-- `permissao_modulo_editar before insert or delete` como em 20261026130000 e
-- `drop function public.exigir_permissao_criar_produto(), public.usuario_pode_criar_produto_pela_ficha(text)`.

begin;

-- Quem cria produto pela ficha: quem grava ficha na unidade (gestão com Fichas Técnicas ou o chef
-- operacional, `usuario_pode_editar_fichas`) e tem pelo menos "chef" no Cardápio.
create or replace function public.usuario_pode_criar_produto_pela_ficha(p_unidade_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_pode_editar_fichas(p_unidade_id)
     and public.pode_modulo('cardapio', 'chef', p_unidade_id);
$$;

revoke all on function public.usuario_pode_criar_produto_pela_ficha(text) from public, anon;
grant execute on function public.usuario_pode_criar_produto_pela_ficha(text) to authenticated;

-- Policy de criação: antes (20260811090000) só a gestão.
drop policy if exists "produtos_insert_gestao" on public.produtos;
create policy "produtos_insert_gestao" on public.produtos
  for insert to authenticated
  with check (
    public.usuario_tem_acesso_unidade(unidade_id, array['gestao'])
    or public.usuario_pode_criar_produto_pela_ficha(unidade_id)
  );

-- Gatilho de criação: o caminho de sempre (gestão com "editar" em Cadastros) passa como antes.
-- Fora dele, só a regra da ficha, e só com os campos do cadastro rápido.
create or replace function public.exigir_permissao_criar_produto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if public.usuario_tem_acesso_unidade(new.unidade_id, array['gestao'])
     and public.pode_modulo('cadastros', 'editar', new.unidade_id) then
    return new;
  end if;
  if not public.usuario_pode_criar_produto_pela_ficha(new.unidade_id) then
    raise exception 'Seu acesso a Cadastros é só para ver. Peça a quem administra a equipe para liberar a edição.'
      using errcode = '42501';
  end if;
  if new.ativo is distinct from true
     or new.revenda is distinct from false
     or new.ficha_revenda_id is not null
     or new.pre_preparo is distinct from false
     or new.ficha_pre_preparo_id is not null
     or coalesce(new.fornecedor_1, '') <> '' or coalesce(new.fornecedor_2, '') <> ''
     or coalesce(new.fornecedor_3, '') <> '' or coalesce(new.fornecedor_4, '') <> ''
     or coalesce(new.unidade_embalagem_fornecedor, '') <> ''
     or new.qtd_unidade_base_por_embalagem is not null
     or new.preco_fornecedor is not null
     or new.ultimo_preco_pago is not null
     or new.ultimo_preco_pago_em is not null then
    raise exception 'Pela ficha técnica o insumo nasce só com o cadastro rápido. Fornecedor, embalagem, revenda e pré-preparo ficam em Cadastros.'
      using errcode = '42501';
  end if;
  -- Decisão de Vinícius (30/10/2026): pela ficha só insumo de grupo que entra em ficha (fora LIM
  -- e OPE, `GRUPOS_FORA_DE_FICHA` no app) e sem estoque mínimo nem estoque necessário da semana.
  -- Lista dos grupos que entram em ficha (`GRUPO_NOMES` menos LIM e OPE), não lista negra.
  if coalesce(new.grupo, '') not in ('PRO', 'HOR', 'LAT', 'MER', 'CON', 'BEB', 'BAL', 'EMB', 'DES', 'PRE') then
    raise exception 'Pela ficha técnica só se cadastra insumo de grupo que entra em ficha. Limpeza e Operacional ficam em Cadastros.'
      using errcode = '42501';
  end if;
  if new.estoque_minimo is not null or new.estoque_necessario_semana is not null then
    raise exception 'Pela ficha técnica o insumo nasce sem estoque mínimo e sem estoque necessário da semana. Esses ficam em Cadastros.'
      using errcode = '42501';
  end if;
  -- Data de criação vem do banco (o extrato e o pré-preparo comparam criado_em).
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end;
$$;

revoke all on function public.exigir_permissao_criar_produto() from public, anon, authenticated;

-- Antes: `permissao_modulo_editar before insert or delete` exigindo "editar" em Cadastros.
-- Excluir segue igual; criar passa para o gatilho novo.
drop trigger if exists permissao_modulo_editar on public.produtos;
create trigger permissao_modulo_editar
  before delete on public.produtos
  for each row execute function public.exigir_permissao_modulo(
    'cadastros', 'Seu acesso a Cadastros é só para ver. Peça a quem administra a equipe para liberar a edição.');

drop trigger if exists permissao_criar_produto on public.produtos;
create trigger permissao_criar_produto
  before insert on public.produtos
  for each row execute function public.exigir_permissao_criar_produto();

-- Default privileges de 20261019180000 dão EXECUTE em toda função nova ao vini_operador.
revoke execute on function public.usuario_pode_criar_produto_pela_ficha(text) from vini_operador;
revoke execute on function public.exigir_permissao_criar_produto() from vini_operador;

commit;
