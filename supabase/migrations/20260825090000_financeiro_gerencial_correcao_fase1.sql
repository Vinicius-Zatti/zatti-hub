-- Correção consolidada da Fase 1 do Financeiro gerencial, pedida por
-- Vinícius em 25/08 antes de qualquer lançamento real nas unidades piloto
-- (Zatti Teste, Zatti Burger). Aditiva - não edita nem reaplica a migração
-- `20260824090000_financeiro_gerencial_fundamentos.sql`, só redefine funções
-- (`create or replace`) e acrescenta coluna/tabela nova.
begin;

-- ── 1) Renomear a conta padrão "Vendas por marketplace" ──────────────────
-- `proteger_categoria_financeira` bloqueia qualquer UPDATE em linha
-- `padrao = true` incondicionalmente (sem o bypass `auth.uid() is null` que
-- as outras 2 triggers de integridade do módulo já têm) - correto pra
-- escrita de app, mas também bloqueava esta migração. Redefine a função
-- com o mesmo bypass de `proteger_parcela_financeira`/`proteger_baixa_financeira`:
-- sessão sem `auth.uid()` (SQL editor, service role, migração) sempre passou
-- batido nas outras duas, só esta ficou divergente por descuido.
create or replace function public.proteger_categoria_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  new.nome := trim(new.nome);
  if tg_op = 'UPDATE' then
    if old.padrao = true then
      raise exception 'Categoria padrao do plano de contas nao pode ser alterada';
    end if;
    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.parent_id is distinct from old.parent_id
       or new.nivel is distinct from old.nivel
       or new.papel_dre is distinct from old.papel_dre
       or new.codigo_sistema is distinct from old.codigo_sistema
       or new.padrao is distinct from old.padrao
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Só nome e arquivamento podem mudar numa categoria própria';
    end if;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

do $$
declare
  v_linhas int;
begin
  update public.fin_categorias
    set nome = 'Vendas por delivery marketplace'
    where codigo_sistema = 'receita_marketplace'
      and unidade_id in ('zatti-teste', 'zatti-burger');
  get diagnostics v_linhas = row_count;
  if v_linhas <> 2 then
    raise exception 'Esperava atualizar 2 linhas (zatti-teste, zatti-burger), atualizou %', v_linhas;
  end if;
end;
$$;

-- Função de semeadura recriada por inteiro (create or replace substitui o
-- corpo todo) só com o texto da conta corrigido - todo o resto idêntico à
-- migração anterior. `on conflict ... do nothing` já garantia idempotência;
-- unidade futura semeada a partir de agora nasce com o nome certo direto.
create or replace function public.semear_categorias_financeiras(p_unidade_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receita uuid;
  v_deducoes uuid;
  v_deducoes_da_receita uuid;
  v_custos_venda_variaveis uuid;
  v_cmv uuid;
  v_cmc uuid;
  v_cmo uuid;
  v_custos_operacionais uuid;
  v_custos_ocupacao uuid;
  v_custos_administrativos uuid;
  v_custos_comerciais uuid;
  v_custos_venda_fixos uuid;
  v_saidas_nao_operacionais uuid;
begin
  insert into public.fin_categorias (unidade_id, parent_id, nivel, nome, codigo_sistema, padrao, ordem)
  values
    (p_unidade_id, null, 'grupo_principal', 'Receita Operacional Bruta', 'receita', true, 1),
    (p_unidade_id, null, 'grupo_principal', 'Deduções', 'deducoes', true, 2),
    (p_unidade_id, null, 'grupo_principal', 'CMV - Custo das Mercadorias Vendidas', 'cmv', true, 3),
    (p_unidade_id, null, 'grupo_principal', 'CMO - Custos com Mão de Obra', 'cmo', true, 4),
    (p_unidade_id, null, 'grupo_principal', 'Custos Operacionais', 'custos_operacionais', true, 5),
    (p_unidade_id, null, 'grupo_principal', 'Saídas Não Operacionais', 'saidas_nao_operacionais', true, 6)
  on conflict (unidade_id, codigo_sistema) do nothing;

  select id into v_receita from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'receita';
  select id into v_deducoes from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'deducoes';
  select id into v_cmv from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'cmv';
  select id into v_cmo from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'cmo';
  select id into v_custos_operacionais from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_operacionais';
  select id into v_saidas_nao_operacionais from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'saidas_nao_operacionais';

  insert into public.fin_categorias (unidade_id, parent_id, nivel, nome, codigo_sistema, padrao, ordem)
  values
    (p_unidade_id, v_deducoes, 'subgrupo', 'Deduções da Receita', 'deducoes_da_receita', true, 1),
    (p_unidade_id, v_deducoes, 'subgrupo', 'Custos de Venda Variáveis', 'custos_venda_variaveis', true, 2),
    (p_unidade_id, v_cmv, 'subgrupo', 'CMC - Custo de Mercadorias Compradas', 'cmc', true, 1),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos de Ocupação', 'custos_ocupacao', true, 1),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos Administrativos', 'custos_administrativos', true, 2),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos Comerciais', 'custos_comerciais', true, 3),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos de Venda Fixos', 'custos_venda_fixos', true, 4)
  on conflict (unidade_id, codigo_sistema) do nothing;

  select id into v_deducoes_da_receita from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'deducoes_da_receita';
  select id into v_custos_venda_variaveis from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_venda_variaveis';
  select id into v_cmc from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'cmc';
  select id into v_custos_ocupacao from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_ocupacao';
  select id into v_custos_administrativos from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_administrativos';
  select id into v_custos_comerciais from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_comerciais';
  select id into v_custos_venda_fixos from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_venda_fixos';

  insert into public.fin_categorias (unidade_id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem)
  values
    (p_unidade_id, v_receita, 'conta', 'receita', 'Vendas no salão', 'receita_salao', true, 1),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Vendas por delivery próprio', 'receita_delivery_proprio', true, 2),
    -- Único texto trocado nesta migração: era "Vendas por marketplace".
    (p_unidade_id, v_receita, 'conta', 'receita', 'Vendas por delivery marketplace', 'receita_marketplace', true, 3),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Eventos, encomendas e catering', 'receita_eventos', true, 4),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Outras receitas operacionais', 'receita_outras', true, 5),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Impostos sobre vendas', 'deducao_impostos', true, 1),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Descontos concedidos', 'deducao_descontos', true, 2),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Devoluções, cancelamentos e estornos', 'deducao_devolucoes', true, 3),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Taxas de adquirência e meios de pagamento', 'cvv_adquirencia', true, 1),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Comissões e taxas variáveis de marketplace', 'cvv_comissoes_marketplace', true, 2),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Entregas e fretes por pedido', 'cvv_entregas_fretes', true, 3),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Marketing de marketplace', 'cvv_marketing_marketplace', true, 4),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Tráfego pago vinculado diretamente à venda', 'cvv_trafego_pago_venda', true, 5),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Comissões de venda', 'cvv_comissoes_venda', true, 6),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Outros custos variáveis de venda', 'cvv_outros', true, 7),
    (p_unidade_id, v_cmc, 'conta', 'cmc_mercadorias', 'Compras de mercadorias', 'cmc_compras_mercadorias', true, 1),
    (p_unidade_id, v_cmc, 'conta', 'cmc_embalagens', 'Compras de embalagens', 'cmc_compras_embalagens', true, 2),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Capacitação', 'cmo_capacitacao', true, 1),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Exames médicos', 'cmo_exames_medicos', true, 2),
    (p_unidade_id, v_cmo, 'conta', 'cmo_ferias', 'Férias', 'cmo_ferias', true, 3),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'FGTS', 'cmo_fgts', true, 4),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Folha salarial contábil', 'cmo_folha_salarial', true, 5),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Freelancers', 'cmo_freelancers', true, 6),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'INSS folha', 'cmo_inss_folha', true, 7),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Multas e atrasos', 'cmo_multas_atrasos', true, 8),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Pagamento por fora da folha', 'cmo_pagamento_fora_folha', true, 9),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Plano de saúde/odontológico', 'cmo_plano_saude', true, 10),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Pró-labore', 'cmo_pro_labore', true, 11),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Refeições', 'cmo_refeicoes', true, 12),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Rescisões', 'cmo_rescisoes', true, 13),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Taxa sindical', 'cmo_taxa_sindical', true, 14),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Vale combustível', 'cmo_vale_combustivel', true, 15),
    (p_unidade_id, v_cmo, 'conta', 'cmo', 'Vale transporte', 'cmo_vale_transporte', true, 16),
    (p_unidade_id, v_cmo, 'conta', 'cmo_decimo_terceiro', '13º salário', 'cmo_decimo_terceiro', true, 17),
    (p_unidade_id, v_cmo, 'conta', 'cmo_multa_fgts', 'Provisão de multa do FGTS', 'cmo_multa_fgts', true, 18),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Aluguel', 'co_aluguel', true, 1),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Condomínio', 'co_condominio', true, 2),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Água', 'co_agua', true, 3),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Energia elétrica', 'co_energia_eletrica', true, 4),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Gás', 'co_gas', true, 5),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Internet e telefonia', 'co_internet_telefonia', true, 6),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Manutenção e reparos', 'co_manutencao_reparos', true, 7),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Limpeza, dedetização e segurança', 'co_limpeza_seguranca', true, 8),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Softwares operacionais', 'co_softwares', true, 9),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Assessoria e consultorias recorrentes', 'co_assessoria', true, 10),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Outros custos de ocupação', 'co_outros', true, 11),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Tarifas bancárias', 'ca_tarifas_bancarias', true, 1),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Aluguel e manutenção de maquininhas', 'ca_maquininhas', true, 2),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Licenças e taxas administrativas', 'ca_licencas_taxas', true, 3),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Material de escritório', 'ca_material_escritorio', true, 4),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Contabilidade e obrigações administrativas', 'ca_contabilidade', true, 5),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Seguros', 'ca_seguros', true, 6),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Outros custos administrativos', 'ca_outros', true, 7),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Marketing institucional', 'cc_marketing_institucional', true, 1),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Tráfego pago não vinculado diretamente à venda', 'cc_trafego_pago_geral', true, 2),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Produção de conteúdo e criativos', 'cc_producao_conteudo', true, 3),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Agência e assessoria de marketing', 'cc_agencia_marketing', true, 4),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Promoções e ações comerciais', 'cc_promocoes', true, 5),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Outros custos comerciais', 'cc_outros', true, 6),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Logística fixa', 'cvf_logistica_fixa', true, 1),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Diárias de motoboy', 'cvf_diarias_motoboy', true, 2),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Mensalidades de plataformas de venda', 'cvf_mensalidades_plataformas', true, 3),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Marketing de marketplace não vinculado diretamente à venda', 'cvf_marketing_marketplace_geral', true, 4),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Outros custos de venda fixos', 'cvf_outros', true, 5),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Retiradas de sócios', 'sno_retiradas_socios', true, 1),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Pagamento de principal de empréstimos', 'sno_pagamento_principal_emprestimos', true, 2),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Compra de equipamentos e investimentos', 'sno_equipamentos_investimentos', true, 3),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Outras saídas não operacionais', 'sno_outras', true, 4)
  on conflict (unidade_id, codigo_sistema) do nothing;
end;
$$;

-- ── 2) Recorrências (adiantado da Fase 7 a pedido de Vinícius em 25/08) ──
-- Template que gera lançamento/parcela futuros de verdade (1 lançamento + 1
-- parcela por ocorrência, `origem = 'recorrencia'`) - nunca um mecanismo à
-- parte que a DRE precisa interpretar diferente. Sem baixa nenhuma aqui:
-- baixar uma dessas parcelas segue o fluxo comum de `fin_baixas`, e como
-- cada ocorrência já nasceu como lançamento próprio (sua própria
-- competência), a baixa nunca duplica nada na DRE - só move DFC/caixa,
-- igual qualquer outra parcela. Todas as ocorrências nascem de uma vez na
-- criação (sem job/cron nesta fase), por isso `data_fim`/`quantidade_ocorrencias`
-- é sempre obrigatório (nunca "pra sempre") - ver limite em
-- `MAXIMO_OCORRENCIAS_RECORRENCIA` no app (`src/lib/financeiro-gerencial/recorrencia.ts`).
create table if not exists public.fin_recorrencias (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria_id uuid not null,
  descricao text not null check (char_length(trim(descricao)) between 1 and 200),
  valor numeric(14,2) not null check (valor > 0),
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  data_inicio date not null,
  data_fim date,
  quantidade_ocorrencias integer check (quantidade_ocorrencias > 0),
  ativa boolean not null default true,
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  unique (unidade_id, id),
  foreign key (unidade_id, categoria_id) references public.fin_categorias(unidade_id, id),
  check (num_nonnulls(data_fim, quantidade_ocorrencias) = 1)
);

create index if not exists fin_recorrencias_unidade_idx on public.fin_recorrencias (unidade_id);

alter table public.fin_recorrencias enable row level security;

-- Só select + insert por enquanto - sem tela de pausar/cancelar recorrência
-- nesta fase, então nenhuma policy de update/delete (mesmo raciocínio de
-- "não construir caminho de escrita que nada usa ainda" de `fin_baixas`,
-- que também não tem update/delete).
create policy "fin_recorrencias_select" on public.fin_recorrencias
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_recorrencias_insert" on public.fin_recorrencias
  for insert to authenticated
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, null)
    and criado_por = auth.uid()
  );

drop trigger if exists auditar_escrita on public.fin_recorrencias;
create trigger auditar_escrita
  after insert or update or delete on public.fin_recorrencias
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- `fin_lancamentos.origem` aceita 'recorrencia' a partir de agora, com o
-- vínculo à recorrência que gerou a linha (nulo pra lançamento comum).
alter table public.fin_lancamentos add column if not exists recorrencia_id uuid;
alter table public.fin_lancamentos drop constraint if exists fin_lancamentos_origem_check;
alter table public.fin_lancamentos add constraint fin_lancamentos_origem_check
  check (origem in ('comum', 'recorrencia'));
alter table public.fin_lancamentos add constraint fin_lancamentos_origem_recorrencia_check
  check ((origem = 'recorrencia') = (recorrencia_id is not null));
alter table public.fin_lancamentos
  add constraint fin_lancamentos_recorrencia_fkey
  foreign key (unidade_id, recorrencia_id) references public.fin_recorrencias(unidade_id, id);

-- Nova chave de rate limit (`fin_recorrencia_criar`) - função inteira
-- recriada com a lista acumulada, mesmo padrão de
-- `20260824093000_rate_limit_financeiro_gerencial.sql`.
create or replace function public.consumir_limite_requisicao(p_chave text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite integer;
  v_janela_segundos integer;
  v_contagem integer;
begin
  if auth.uid() is null then
    return false;
  end if;

  select configuracao.limite, configuracao.janela_segundos
    into v_limite, v_janela_segundos
  from (
    values
      ('sugerir_sku', 10, 3600),
      ('registrar_contagem', 30, 600),
      ('corrigir_contagem', 120, 600),
      ('salvar_produtos', 30, 600),
      ('salvar_fornecedores', 30, 600),
      ('pedidos_cotacao', 120, 600),
      ('recebimento', 60, 600),
      ('consolidado_criar', 30, 600),
      ('consolidado_editar', 60, 600),
      ('trocar_organizacao', 30, 600),
      ('ficha_salvar', 60, 600),
      ('ficha_excluir', 30, 600),
      ('categoria_ficha_criar', 30, 600),
      ('conversao_produto_salvar', 60, 600),
      ('configuracao_financeira_salvar', 30, 600),
      ('ficha_preco_venda_salvar', 120, 600),
      ('categoria_ficha_editar', 30, 600),
      ('categoria_ficha_excluir', 30, 600),
      ('excluir_produto', 30, 600),
      ('ficha_precos_canal_salvar', 120, 600),
      ('fin_conta_financeira_salvar', 30, 600),
      ('fin_categoria_criar', 30, 600),
      ('fin_categoria_editar', 30, 600),
      ('fin_lancamento_criar', 60, 600),
      ('fin_lancamento_editar', 60, 600),
      ('fin_baixa_registrar', 60, 600),
      ('fin_baixa_estornar', 30, 600),
      ('fin_recorrencia_criar', 20, 600)
  ) as configuracao(chave, limite, janela_segundos)
  where configuracao.chave = p_chave;

  if v_limite is null then
    raise exception 'Limite de requisicao desconhecido' using errcode = '22023';
  end if;

  insert into public.limites_requisicao as atual (
    user_id,
    chave,
    janela_inicio,
    contagem
  )
  values (auth.uid(), p_chave, now(), 1)
  on conflict (user_id, chave) do update
  set
    janela_inicio = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then excluded.janela_inicio
      else atual.janela_inicio
    end,
    contagem = case
      when excluded.janela_inicio - atual.janela_inicio
        >= make_interval(secs => v_janela_segundos)
      then 1
      else atual.contagem + 1
    end
  returning contagem into v_contagem;

  return v_contagem <= v_limite;
end;
$$;

commit;
