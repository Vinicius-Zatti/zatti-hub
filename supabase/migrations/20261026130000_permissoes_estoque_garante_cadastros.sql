-- Permissões por módulo: barreira do banco para Estoque, Garante e Cadastros (26/10/2026).
--
-- Mesmo desenho de 20261025090000_permissoes_por_modulo.sql: a tabela `permissoes_modulo` só
-- guarda exceções. Sem linha, nada muda para ninguém (contagem e checklist do dia a dia seguem
-- iguais). As linhas só restringem.
--
--   * estoque: as policies de leitura de contagens, extrato, movimentações e pedidos passam a
--     tirar as unidades com Estoque "sem acesso" (os itens, setores, envios e escopo da contagem
--     e os itens do pedido seguem a linha-mãe pela própria policy). Gatilho de escrita exige
--     "editar" nessas tabelas, inclusive dentro das RPCs (contagem por setor, recebimento,
--     perdas).
--   * garante: `usuario_pode_usar_garante` exige "ver" (tira leitura e as RPCs de quem está sem
--     acesso). Gatilho de escrita exige "editar" em modelos, itens, publicações, regras, dias
--     sem operação, quem recebe os avisos, execuções e respostas (cumprir o checklist) e na
--     mudança de plano de ação (resolver ou descartar). Plano gerado sozinho (checklist vencido)
--     e a fila de avisos não passam pelo gatilho: são do sistema.
--   * cadastros: produtos, setores, fornecedores e setores do produto são lidos pelo Estoque e
--     pelo Cardápio, então a leitura não muda (sem acesso some com as telas de Cadastros). O
--     gatilho exige "editar" para criar, apagar ou mudar o cadastro do produto (nome, SKU,
--     grupo, unidade, embalagem, mínimos, observações, ativo, revenda, ordem). Preço, último
--     preço pago, fornecedor e o vínculo com a ficha continuam com quem já grava hoje (cotação,
--     recebimento e Cardápio).
--
-- Lock: troca 4 policies e cria gatilhos nas tabelas do Estoque, do Garante e dos Cadastros
-- (inclusive contagem). Rodar fora do horário dos restaurantes.
--
-- Desfazer: `select permissao_chave_liberada(...)` volta a recusar com a função de
-- 20261025090000; os gatilhos novos saem com `drop trigger permissao_modulo_editar on ...`.

begin;

-- ── Chaves liberadas ─────────────────────────────────────────────────────

create or replace function public.permissao_chave_liberada(p_chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_chave in (
    'estoque', 'vendas', 'financeiro', 'cardapio', 'garante', 'equipe', 'relatorios', 'cadastros',
    'configuracoes', 'financeiro.apagar_lancamento', 'financeiro.fechar_mes', 'vendas.editar_dia_lancado'
  );
$$;

-- ── Gatilho para tabela sem unidade_id (vai pela linha-mãe) ──────────────

-- tg_argv: [0] chave, [1] mensagem, [2] tabela-mãe ('contagens' ou 'pedidos'), [3] coluna que
-- aponta para ela. Sem nenhuma exceção da pessoa, sai na hora (sem consultar a linha-mãe).
create or replace function public.exigir_permissao_modulo_pela_mae()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text := tg_argv[0];
  v_mensagem text := tg_argv[1];
  v_mae text := tg_argv[2];
  v_coluna text := tg_argv[3];
  v_id text;
  v_unidade text;
begin
  if auth.uid() is null or v_mae not in ('contagens', 'pedidos') or not exists (
    select 1 from public.permissoes_modulo p
      join public.vinculos v on v.id = p.vinculo_id
     where v.user_id = auth.uid()
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_id := to_jsonb(old) ->> v_coluna;
    execute format('select unidade_id from public.%I where id = $1', v_mae) into v_unidade using v_id::uuid;
    if not public.pode_modulo(v_chave, 'editar', v_unidade) then
      raise exception '%', v_mensagem using errcode = '42501';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_id := to_jsonb(new) ->> v_coluna;
    execute format('select unidade_id from public.%I where id = $1', v_mae) into v_unidade using v_id::uuid;
    if not public.pode_modulo(v_chave, 'editar', v_unidade) then
      raise exception '%', v_mensagem using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.exigir_permissao_modulo_pela_mae() from public, anon, authenticated;

-- ── Estoque: leitura ─────────────────────────────────────────────────────

drop policy if exists contagens_select_por_vinculo on public.contagens;
create policy contagens_select_por_vinculo on public.contagens
  for select to authenticated
  using (
    unidade_id in (select public.unidades_acessiveis())
    and unidade_id not in (select public.unidades_modulo_negadas('estoque', 'ver'))
  );

drop policy if exists pedidos_select_por_vinculo on public.pedidos;
create policy pedidos_select_por_vinculo on public.pedidos
  for select to authenticated
  using (
    unidade_id in (select public.unidades_acessiveis())
    and unidade_id not in (select public.unidades_modulo_negadas('estoque', 'ver'))
  );

drop policy if exists estoque_mov_select_por_unidade on public.estoque_movimentacoes;
create policy estoque_mov_select_por_unidade on public.estoque_movimentacoes
  for select to authenticated
  using (
    public.usuario_tem_acesso_unidade(unidade_id, null)
    and unidade_id not in (select public.unidades_modulo_negadas('estoque', 'ver'))
  );

drop policy if exists estoque_inicio_select_por_unidade on public.estoque_extrato_inicio;
create policy estoque_inicio_select_por_unidade on public.estoque_extrato_inicio
  for select to authenticated
  using (
    public.usuario_tem_acesso_unidade(unidade_id, null)
    and unidade_id not in (select public.unidades_modulo_negadas('estoque', 'ver'))
  );

-- ── Garante: leitura (e toda RPC que confere o helper) ───────────────────

-- antes (20261011140000_checklist_garante.sql): sem a última linha.
create or replace function public.usuario_pode_usar_garante(p_unidade_id text, p_papeis text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (select 1 from public.unidades u where u.id = p_unidade_id and u.garante_habilitado)
    and public.pode_modulo('garante', 'ver', p_unidade_id);
$$;

-- ── Gatilhos de escrita ──────────────────────────────────────────────────

do $$
declare
  t text;
  v_msg_estoque constant text :=
    'Seu acesso ao Estoque é só para ver. Peça a quem administra a equipe para liberar a edição.';
  v_msg_garante constant text :=
    'Seu acesso ao Garante é só para ver. Peça a quem administra a equipe para liberar a edição.';
  v_msg_cadastros constant text :=
    'Seu acesso a Cadastros é só para ver. Peça a quem administra a equipe para liberar a edição.';
begin
  foreach t in array array['contagens', 'estoque_movimentacoes', 'estoque_extrato_inicio', 'pedidos'] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo(%L, %L)',
      t, 'estoque', v_msg_estoque
    );
  end loop;

  foreach t in array array['contagem_itens', 'contagem_envios', 'contagem_escopo', 'contagem_setores'] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo_pela_mae(%L, %L, %L, %L)',
      t, 'estoque', v_msg_estoque, 'contagens', 'contagem_id'
    );
  end loop;

  execute 'drop trigger if exists permissao_modulo_editar on public.pedido_itens';
  execute format(
    'create trigger permissao_modulo_editar before insert or update or delete on public.pedido_itens '
    'for each row execute function public.exigir_permissao_modulo_pela_mae(%L, %L, %L, %L)',
    'estoque', v_msg_estoque, 'pedidos', 'pedido_id'
  );

  foreach t in array array[
    'garante_modelos', 'garante_itens', 'garante_publicacoes', 'garante_regras_unidade',
    'garante_dias_sem_operacao', 'garante_avisos_destinatarios', 'garante_execucoes', 'garante_respostas'
  ] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo(%L, %L)',
      t, 'garante', v_msg_garante
    );
  end loop;

  -- Plano de ação: gerar é do sistema (ao abrir a tela); resolver e descartar são da pessoa.
  execute 'drop trigger if exists permissao_modulo_editar on public.garante_planos_acao';
  execute format(
    'create trigger permissao_modulo_editar before update or delete on public.garante_planos_acao '
    'for each row execute function public.exigir_permissao_modulo(%L, %L)',
    'garante', v_msg_garante
  );

  foreach t in array array['setores', 'fornecedores', 'produto_setores'] loop
    execute format('drop trigger if exists permissao_modulo_editar on public.%I', t);
    execute format(
      'create trigger permissao_modulo_editar before insert or update or delete on public.%I '
      'for each row execute function public.exigir_permissao_modulo(%L, %L)',
      t, 'cadastros', v_msg_cadastros
    );
  end loop;

  execute 'drop trigger if exists permissao_modulo_editar on public.produtos';
  execute format(
    'create trigger permissao_modulo_editar before insert or delete on public.produtos '
    'for each row execute function public.exigir_permissao_modulo(%L, %L)',
    'cadastros', v_msg_cadastros
  );
  execute 'drop trigger if exists permissao_modulo_editar_cadastro on public.produtos';
  execute format(
    'create trigger permissao_modulo_editar_cadastro before update on public.produtos '
    'for each row when ('
    '  old.sku is distinct from new.sku or old.grupo is distinct from new.grupo'
    '  or old.nome is distinct from new.nome or old.unidade_base is distinct from new.unidade_base'
    '  or old.estoque_necessario_semana is distinct from new.estoque_necessario_semana'
    '  or old.estoque_minimo is distinct from new.estoque_minimo'
    '  or old.nome_compra is distinct from new.nome_compra'
    '  or old.unidade_embalagem_fornecedor is distinct from new.unidade_embalagem_fornecedor'
    '  or old.qtd_unidade_base_por_embalagem is distinct from new.qtd_unidade_base_por_embalagem'
    '  or old.observacoes is distinct from new.observacoes or old.ativo is distinct from new.ativo'
    '  or old.revenda is distinct from new.revenda or old.ordem is distinct from new.ordem'
    '  or old.posicao is distinct from new.posicao or old.unidade_id is distinct from new.unidade_id'
    ') execute function public.exigir_permissao_modulo(%L, %L)',
    'cadastros', v_msg_cadastros
  );
end;
$$;

-- Default privileges de 20261019180000 dão EXECUTE em toda função nova ao vini_operador.
revoke execute on function public.exigir_permissao_modulo_pela_mae() from vini_operador;

commit;
