-- Módulo Financeiro gerencial (DRE/DFC/Caixa) - fundamentos.
-- Não confundir com o módulo "Financeiro" antigo (Consolidado de Vendas, em
-- /financeiro/consolidado) nem com `configuracao_financeira` (parâmetros da
-- calculadora de margem de Fichas Técnicas) - três coisas sem relação entre
-- si. Este módulo nasce desligado (`financeiro_gerencial_habilitado = false`)
-- e usa o prefixo `fin_` em toda tabela nova pra não colidir com nenhum dos
-- dois. Rota nova: /financeiro-gerencial (o /financeiro antigo continua
-- intacto, só o rótulo do menu muda pra "Desempenho").
begin;

alter table public.unidades
  add column if not exists financeiro_gerencial_habilitado boolean not null default false;

create or replace function public.usuario_pode_usar_financeiro_gerencial(
  p_unidade_id text,
  p_papeis text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.usuario_tem_acesso_unidade(p_unidade_id, p_papeis)
    and exists (
      select 1 from public.unidades u
      where u.id = p_unidade_id
        and u.financeiro_gerencial_habilitado = true
    );
$$;

revoke all on function public.usuario_pode_usar_financeiro_gerencial(text, text[]) from public, anon;
grant execute on function public.usuario_pode_usar_financeiro_gerencial(text, text[]) to authenticated;

-- ── Contas financeiras (banco / caixa físico / carteira digital) ─────────

create table if not exists public.fin_contas_financeiras (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  tipo text not null check (tipo in ('banco', 'caixa', 'carteira_digital')),
  saldo_inicial numeric(14,2) not null default 0,
  data_saldo_inicial date not null default current_date,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, id)
);

-- ── Plano de contas (árvore grupo principal → grupo/subgrupo → conta) ────
-- `papel_dre` só existe em folha ("conta") e diz a qual bucket de cálculo da
-- DRE/CMV/provisões aquela conta pertence - o motor de cálculo nunca decide
-- isso por nome de texto. Estoque inicial/final de Mercadorias e Embalagens
-- (linhas do CMV) não entram aqui: vêm de `fin_estoque_mensal`, não são
-- categoria que recebe lançamento.
create table if not exists public.fin_categorias (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  parent_id uuid,
  nivel text not null check (nivel in ('grupo_principal', 'grupo', 'subgrupo', 'conta')),
  papel_dre text check (papel_dre in (
    'receita', 'deducao_receita', 'custo_venda_variavel',
    'cmc_mercadorias', 'cmc_embalagens',
    'cmo', 'cmo_ferias', 'cmo_decimo_terceiro', 'cmo_multa_fgts',
    'custo_ocupacao', 'custo_administrativo', 'custo_comercial', 'custo_venda_fixo',
    'saida_nao_operacional'
  )),
  nome text not null check (char_length(trim(nome)) between 1 and 160),
  -- Slug estável só em linha padrão (semeada pelo sistema) - identifica a
  -- conta pro motor de cálculo e sustenta o upsert idempotente do seed,
  -- independente de renomeação futura do texto exibido.
  codigo_sistema text,
  padrao boolean not null default false,
  ordem integer not null default 0,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, id),
  unique (unidade_id, codigo_sistema),
  check ((nivel = 'conta') = (papel_dre is not null)),
  check ((nivel = 'grupo_principal') = (parent_id is null)),
  -- FK composta (não só `id`) - impede uma categoria filha apontar pra pai
  -- de outra unidade. Achado na revisão de segurança de 24/08, mesma causa
  -- raiz das FKs de `categoria_id`/`conta_financeira_id` já corrigidas
  -- abaixo em `fin_lancamentos`/`fin_parcelas`/`fin_baixas`.
  foreign key (unidade_id, parent_id) references public.fin_categorias(unidade_id, id)
);

create index if not exists fin_categorias_unidade_idx
  on public.fin_categorias (unidade_id, arquivado);
create index if not exists fin_categorias_parent_idx
  on public.fin_categorias (parent_id);

-- Categoria padrão é imutável de vez (nem Gestão edita) - só nome/arquivado
-- de categoria própria pode mudar. Bloquear aqui é defesa em profundidade:
-- a policy de update já filtra `padrao = false`, este trigger garante que
-- nenhum outro caminho (nem um bug de policy futuro) altere estrutura.
create or replace function public.proteger_categoria_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
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

drop trigger if exists proteger_categoria_financeira on public.fin_categorias;
create trigger proteger_categoria_financeira
  before insert or update on public.fin_categorias
  for each row execute function public.proteger_categoria_financeira();

-- ── Semeadura do plano de contas padrão (idempotente por unidade) ────────
-- Chamar depois de ligar `financeiro_gerencial_habilitado` pra uma unidade:
--   update public.unidades set financeiro_gerencial_habilitado = true where id = 'ID_DA_UNIDADE';
--   select public.semear_categorias_financeiras('ID_DA_UNIDADE');
-- Reexecutar é seguro (on conflict do nothing) - útil se a unidade já tinha
-- sido semeada e uma migração futura só adicionar contas novas.
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
  -- Grupos principais (6) -------------------------------------------------
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

  -- Subgrupos (7) ----------------------------------------------------------
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

  -- Contas (68) --------------------------------------------------------------
  insert into public.fin_categorias (unidade_id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem)
  values
    -- Receita Operacional Bruta
    (p_unidade_id, v_receita, 'conta', 'receita', 'Vendas no salão', 'receita_salao', true, 1),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Vendas por delivery próprio', 'receita_delivery_proprio', true, 2),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Vendas por marketplace', 'receita_marketplace', true, 3),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Eventos, encomendas e catering', 'receita_eventos', true, 4),
    (p_unidade_id, v_receita, 'conta', 'receita', 'Outras receitas operacionais', 'receita_outras', true, 5),
    -- Deduções da Receita
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Impostos sobre vendas', 'deducao_impostos', true, 1),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Descontos concedidos', 'deducao_descontos', true, 2),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Devoluções, cancelamentos e estornos', 'deducao_devolucoes', true, 3),
    -- Custos de Venda Variáveis
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Taxas de adquirência e meios de pagamento', 'cvv_adquirencia', true, 1),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Comissões e taxas variáveis de marketplace', 'cvv_comissoes_marketplace', true, 2),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Entregas e fretes por pedido', 'cvv_entregas_fretes', true, 3),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Marketing de marketplace', 'cvv_marketing_marketplace', true, 4),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Tráfego pago vinculado diretamente à venda', 'cvv_trafego_pago_venda', true, 5),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Comissões de venda', 'cvv_comissoes_venda', true, 6),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Outros custos variáveis de venda', 'cvv_outros', true, 7),
    -- CMC - Custo de Mercadorias Compradas (única parte do CMV que recebe lançamento)
    (p_unidade_id, v_cmc, 'conta', 'cmc_mercadorias', 'Compras de mercadorias', 'cmc_compras_mercadorias', true, 1),
    (p_unidade_id, v_cmc, 'conta', 'cmc_embalagens', 'Compras de embalagens', 'cmc_compras_embalagens', true, 2),
    -- CMO - Custos com Mão de Obra (flat; 3 contas marcadas só alimentam da
    -- Provisão - ver src/lib/financeiro-gerencial/provisoes.ts na Fase 6;
    -- lançamento manual nessas 3 é bloqueado na validação de entrada)
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
    -- Custos de Ocupação
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
    -- Custos Administrativos
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Tarifas bancárias', 'ca_tarifas_bancarias', true, 1),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Aluguel e manutenção de maquininhas', 'ca_maquininhas', true, 2),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Licenças e taxas administrativas', 'ca_licencas_taxas', true, 3),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Material de escritório', 'ca_material_escritorio', true, 4),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Contabilidade e obrigações administrativas', 'ca_contabilidade', true, 5),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Seguros', 'ca_seguros', true, 6),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Outros custos administrativos', 'ca_outros', true, 7),
    -- Custos Comerciais
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Marketing institucional', 'cc_marketing_institucional', true, 1),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Tráfego pago não vinculado diretamente à venda', 'cc_trafego_pago_geral', true, 2),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Produção de conteúdo e criativos', 'cc_producao_conteudo', true, 3),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Agência e assessoria de marketing', 'cc_agencia_marketing', true, 4),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Promoções e ações comerciais', 'cc_promocoes', true, 5),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Outros custos comerciais', 'cc_outros', true, 6),
    -- Custos de Venda Fixos
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Logística fixa', 'cvf_logistica_fixa', true, 1),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Diárias de motoboy', 'cvf_diarias_motoboy', true, 2),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Mensalidades de plataformas de venda', 'cvf_mensalidades_plataformas', true, 3),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Marketing de marketplace não vinculado diretamente à venda', 'cvf_marketing_marketplace_geral', true, 4),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Outros custos de venda fixos', 'cvf_outros', true, 5),
    -- Saídas Não Operacionais
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Retiradas de sócios', 'sno_retiradas_socios', true, 1),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Pagamento de principal de empréstimos', 'sno_pagamento_principal_emprestimos', true, 2),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Compra de equipamentos e investimentos', 'sno_equipamentos_investimentos', true, 3),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Outras saídas não operacionais', 'sno_outras', true, 4)
  on conflict (unidade_id, codigo_sistema) do nothing;
end;
$$;

revoke all on function public.semear_categorias_financeiras(text) from public, anon, authenticated;

-- Sem unidade habilitada ainda no momento desta migração - nenhuma linha
-- semeada agora. Backfill de unidade futura é 1 chamada manual da função
-- acima (ver comentário dela), sem precisar de nova migração.

-- ── Lançamentos, parcelas e baixas ────────────────────────────────────────

create table if not exists public.fin_lancamentos (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria_id uuid not null,
  descricao text not null check (char_length(trim(descricao)) between 1 and 200),
  data_competencia date not null,
  conta_financeira_id uuid,
  observacao text not null default '',
  -- 'recorrencia' passa a ser aceito na Fase 7 (junto com a coluna
  -- recorrencia_id) - por ora só lançamento comum.
  origem text not null default 'comum' check (origem in ('comum')),
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (unidade_id, id),
  -- FK composta (não só `id`) - impede vincular categoria ou conta
  -- financeira de outra unidade. Achado na revisão de segurança de 24/08:
  -- a primeira versão desta migração referenciava só `fin_categorias(id)`
  -- e `fin_contas_financeiras(id)`, sem checar a unidade.
  foreign key (unidade_id, categoria_id) references public.fin_categorias(unidade_id, id),
  foreign key (unidade_id, conta_financeira_id) references public.fin_contas_financeiras(unidade_id, id)
);

-- Espelha `PAPEIS_DRE_SOMENTE_PROVISAO` de
-- src/lib/financeiro-gerencial/tipos.ts - as 3 contas de CMO que só o
-- motor de Provisões (Fase 6) pode alimentar. Mudar a lista precisa mudar
-- nos dois lugares.
create or replace function public.papel_dre_somente_provisao(p_papel_dre text)
returns boolean
language sql
immutable
as $$
  select p_papel_dre in ('cmo_ferias', 'cmo_decimo_terceiro', 'cmo_multa_fgts');
$$;

-- BEFORE INSERT OR UPDATE em fin_lancamentos: a FK composta acima já
-- garante que `categoria_id` existe na mesma unidade, mas não garante que
-- é uma conta-folha usável em lançamento manual - isso só a regra de
-- negócio abaixo confere. Sem isso, um INSERT direto podia lançar contra
-- um grupo/subgrupo, uma categoria arquivada, uma conta só-de-provisão, ou
-- receita numa categoria de despesa (e vice-versa) - a mesma checagem que
-- `criarLancamento` já fazia em `src/lib/banco/financeiro-gerencial.ts`,
-- repetida aqui porque a Server Action não é a única porta de escrita.
create or replace function public.proteger_lancamento_financeiro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_categoria record;
begin
  if auth.uid() is null then
    return new;
  end if;

  select nivel, papel_dre, arquivado
    into v_categoria
    from public.fin_categorias
    where unidade_id = new.unidade_id and id = new.categoria_id;

  if not found then
    raise exception 'Categoria invalida para lancamento' using errcode = '23514';
  end if;
  if v_categoria.nivel <> 'conta' then
    raise exception 'Categoria precisa ser uma conta-folha, nao grupo ou subgrupo' using errcode = '23514';
  end if;
  if v_categoria.arquivado then
    raise exception 'Categoria arquivada nao pode receber lancamento' using errcode = '23514';
  end if;
  if public.papel_dre_somente_provisao(v_categoria.papel_dre) then
    raise exception 'Categoria alimentada so pelo motor de Provisoes, sem lancamento manual' using errcode = '23514';
  end if;
  if new.tipo = 'receita' and v_categoria.papel_dre is distinct from 'receita' then
    raise exception 'Lancamento de receita so pode usar categoria com papel_dre = receita' using errcode = '23514';
  end if;
  if new.tipo = 'despesa' and v_categoria.papel_dre = 'receita' then
    raise exception 'Lancamento de despesa nao pode usar categoria de receita' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_lancamento_financeiro on public.fin_lancamentos;
create trigger proteger_lancamento_financeiro
  before insert or update on public.fin_lancamentos
  for each row execute function public.proteger_lancamento_financeiro();

create table if not exists public.fin_parcelas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  lancamento_id uuid not null,
  numero integer not null check (numero > 0),
  total_parcelas integer not null check (total_parcelas > 0),
  valor numeric(14,2) not null check (valor > 0),
  data_prevista date not null,
  conta_financeira_id uuid,
  -- Nunca escrito direto por formulário nem aceito de UPDATE algum: o
  -- gatilho `proteger_parcela_financeira` (ver seção de integridade abaixo)
  -- recalcula este campo sozinho a partir de `fin_baixas` toda vez que a
  -- linha é tocada, e ignora por completo qualquer valor de `status` que
  -- vier no UPDATE (mesmo princípio de `consolidados_vendas.status`, que
  -- também nunca confia em valor vindo do cliente).
  status text not null default 'aberto' check (status in ('aberto', 'parcial', 'quitado', 'cancelado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (lancamento_id, numero),
  unique (unidade_id, id),
  foreign key (unidade_id, lancamento_id) references public.fin_lancamentos(unidade_id, id) on delete cascade,
  foreign key (unidade_id, conta_financeira_id) references public.fin_contas_financeiras(unidade_id, id)
);

create index if not exists fin_parcelas_lancamento_idx on public.fin_parcelas (lancamento_id);
create index if not exists fin_parcelas_prevista_idx on public.fin_parcelas (unidade_id, data_prevista) where status <> 'cancelado';

create table if not exists public.fin_baixas (
  id uuid primary key default gen_random_uuid(),
  unidade_id text not null references public.unidades(id),
  -- Nulo só passa a ser possível na Fase 6 (baixa de liquidação de provisão,
  -- que referencia `fin_provisoes_liquidacoes` em vez de uma parcela). Até
  -- lá toda baixa é sempre contra uma parcela.
  parcela_id uuid not null,
  -- 'estorno' reverte uma baixa anterior por completo - nunca edita nem
  -- apaga a baixa original (`fin_baixas` não tem policy de UPDATE/DELETE
  -- nenhuma), correção é sempre uma linha nova referenciando a que está
  -- sendo corrigida. Entra com sinal invertido no cálculo de saldo (ver
  -- `saldo_baixado_parcela`).
  tipo text not null default 'baixa' check (tipo in ('baixa', 'estorno')),
  estorno_de_baixa_id uuid references public.fin_baixas(id),
  conta_financeira_id uuid not null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null,
  observacao text not null default '',
  criado_por uuid not null references auth.users(id),
  criado_em timestamptz not null default now(),
  check ((tipo = 'estorno') = (estorno_de_baixa_id is not null)),
  foreign key (unidade_id, parcela_id) references public.fin_parcelas(unidade_id, id) on delete cascade,
  foreign key (unidade_id, conta_financeira_id) references public.fin_contas_financeiras(unidade_id, id)
);

create index if not exists fin_baixas_parcela_idx on public.fin_baixas (parcela_id);
create index if not exists fin_baixas_data_idx on public.fin_baixas (unidade_id, data);
-- Cada baixa só pode ser estornada uma vez - sem isso, dois estornos
-- seguidos contra a mesma baixa original deixariam `saldo_baixado_parcela`
-- negativo (reabrindo capacidade de baixa acima do que a parcela deveria
-- aceitar). Achado escrevendo o teste de estorno da revisão de 24/08.
create unique index if not exists fin_baixas_estorno_unico
  on public.fin_baixas (estorno_de_baixa_id) where tipo = 'estorno';

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists tocar_atualizado_em on public.fin_contas_financeiras;
create trigger tocar_atualizado_em
  before update on public.fin_contas_financeiras
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists tocar_atualizado_em on public.fin_lancamentos;
create trigger tocar_atualizado_em
  before update on public.fin_lancamentos
  for each row execute function public.tocar_atualizado_em();

-- ── Integridade de parcelas e baixas ──────────────────────────────────────
-- Achado na revisão de segurança de 24/08: a policy de UPDATE de
-- `fin_parcelas` sozinha permitia qualquer vínculo da unidade reescrever
-- valor, número, parcela total ou vínculo com o lançamento via API direta,
-- ignorando as Server Actions - a "edição de campos abertos só Gestão"
-- citada no comentário antigo da policy nunca foi de fato aplicada em
-- lugar nenhum. As funções abaixo fecham isso: valor/número/total de
-- parcelas/vínculo com o lançamento nascem imutáveis, e o status nunca é
-- aceito do cliente - é sempre recalculado a partir da soma real de
-- `fin_baixas`. Correção de baixa é sempre por estorno (linha nova),
-- nunca por editar a antiga.

create or replace function public.saldo_baixado_parcela(p_parcela_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(case when tipo = 'estorno' then -valor else valor end), 0)
  from public.fin_baixas
  where parcela_id = p_parcela_id;
$$;

create or replace function public.status_por_saldo_parcela(p_valor numeric, p_saldo_baixado numeric)
returns text
language sql
immutable
as $$
  select case
    when p_saldo_baixado <= 0 then 'aberto'
    when p_saldo_baixado >= p_valor then 'quitado'
    else 'parcial'
  end;
$$;

-- BEFORE INSERT OR UPDATE em fin_parcelas: no UPDATE, bloqueia qualquer
-- mudança nos campos que definem a parcela (mesmo princípio de
-- `proteger_escrita_pedidos` - campos imutáveis nunca mudam por UPDATE).
-- Em ambos os casos, ignora por completo o `status` vindo do cliente -
-- sempre recalculado aqui a partir da soma real de `fin_baixas`. Sem isso
-- no INSERT (achado na revisão de segurança de 24/08), um INSERT direto
-- podia criar a parcela já como 'quitado' ou 'cancelado' sem baixa
-- nenhuma - numa linha nova a soma de baixas é sempre zero, então a
-- fórmula já devolve 'aberto' sozinha, sem precisar de caso especial.
-- `auth.uid() is null` mantém o comportamento administrativo de SQL
-- editor/service role, mesma convenção de `proteger_escrita_pedidos`.
create or replace function public.proteger_parcela_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.unidade_id is distinct from old.unidade_id
       or new.lancamento_id is distinct from old.lancamento_id
       or new.numero is distinct from old.numero
       or new.total_parcelas is distinct from old.total_parcelas
       or new.valor is distinct from old.valor
       or new.data_prevista is distinct from old.data_prevista
       or new.conta_financeira_id is distinct from old.conta_financeira_id
       or new.criado_em is distinct from old.criado_em then
      raise exception 'Parcela nao pode ser alterada diretamente - correcao e por estorno/contralancamento' using errcode = '42501';
    end if;

    if old.status = 'cancelado' then
      raise exception 'Parcela cancelada nao pode ser reaberta' using errcode = '42501';
    end if;

    new.atualizado_em := now();
  end if;

  new.status := public.status_por_saldo_parcela(new.valor, public.saldo_baixado_parcela(new.id));
  return new;
end;
$$;

drop trigger if exists proteger_parcela_financeira on public.fin_parcelas;
create trigger proteger_parcela_financeira
  before insert or update on public.fin_parcelas
  for each row execute function public.proteger_parcela_financeira();

-- BEFORE INSERT em fin_baixas: trava a linha da parcela (`for update`,
-- evita corrida entre duas baixas simultâneas que passariam a checagem de
-- saldo em paralelo), rejeita baixa contra parcela cancelada e rejeita
-- valor que ultrapasse o saldo em aberto. Estorno (`tipo = 'estorno'`) é
-- restrito a Gestão/master e só pode referenciar uma baixa de verdade da
-- mesma parcela - mesma barreira de papel de
-- `usuario_pode_usar_financeiro_gerencial`, aplicada aqui porque RLS
-- sozinha não diferencia `tipo` linha a linha com a granularidade certa.
create or replace function public.proteger_baixa_financeira()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_parcela record;
  v_original record;
begin
  if auth.uid() is null then
    return new;
  end if;

  select id, unidade_id, valor, status
    into v_parcela
    from public.fin_parcelas
    where id = new.parcela_id
    for update;

  if not found or v_parcela.unidade_id is distinct from new.unidade_id then
    raise exception 'Parcela invalida para baixa' using errcode = '42501';
  end if;
  if v_parcela.status = 'cancelado' then
    raise exception 'Parcela cancelada nao aceita baixa' using errcode = '42501';
  end if;

  if new.tipo = 'baixa' then
    if new.valor + public.saldo_baixado_parcela(new.parcela_id) > v_parcela.valor then
      raise exception 'Valor maior que o saldo em aberto da parcela' using errcode = '23514';
    end if;
  else
    if not public.usuario_pode_usar_financeiro_gerencial(new.unidade_id, array['gestao']) then
      raise exception 'Estorno de baixa e restrito a Gestao/master' using errcode = '42501';
    end if;
    select id, parcela_id, tipo into v_original from public.fin_baixas where id = new.estorno_de_baixa_id;
    if not found or v_original.parcela_id is distinct from new.parcela_id or v_original.tipo <> 'baixa' then
      raise exception 'Estorno so pode referenciar uma baixa da mesma parcela' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_baixa_financeira on public.fin_baixas;
create trigger proteger_baixa_financeira
  before insert on public.fin_baixas
  for each row execute function public.proteger_baixa_financeira();

-- AFTER INSERT em fin_baixas: "toca" a parcela pra disparar o recálculo
-- feito por `proteger_parcela_financeira` (UPDATE aparentemente vazio - só
-- `atualizado_em` muda de propósito aqui, o gatilho da parcela recalcula o
-- `status` sozinho a partir da soma real de baixas, incluindo a que acabou
-- de ser inserida).
create or replace function public.recalcular_parcela_apos_baixa()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.fin_parcelas set atualizado_em = now() where id = new.parcela_id;
  return new;
end;
$$;

drop trigger if exists recalcular_parcela_apos_baixa on public.fin_baixas;
create trigger recalcular_parcela_apos_baixa
  after insert on public.fin_baixas
  for each row execute function public.recalcular_parcela_apos_baixa();

-- ── Auditoria automática (garantida pelo banco) ───────────────────────────
-- Modelo escolhido: gatilho, não RPC. `registrarAuditoria()` nas Server
-- Actions grava um log com rótulo de ação amigável, mas cobre só esse
-- caminho - uma escrita direta na Data API (que a RLS abaixo permite,
-- Server Action é só um caminho a mais, não a única porta) não passava por
-- ali. Este gatilho garante que toda escrita nas 5 tabelas do módulo é
-- logada em `logs_auditoria`, não importa o caminho usado. Em troca, as
-- Server Actions deste módulo pararam de chamar `registrarAuditoria()` -
-- manter os dois duplicaria a linha de log a cada escrita.
create or replace function public.auditar_escrita_financeiro_gerencial()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unidade_id text;
  v_entidade_id text;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_unidade_id := coalesce(new.unidade_id, old.unidade_id);
  v_entidade_id := coalesce(new.id, old.id)::text;

  insert into public.logs_auditoria (unidade_id, user_id, acao, entidade, entidade_id, dados_antigos, dados_novos)
  values (
    v_unidade_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_entidade_id,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists auditar_escrita on public.fin_contas_financeiras;
create trigger auditar_escrita
  after insert or update or delete on public.fin_contas_financeiras
  for each row execute function public.auditar_escrita_financeiro_gerencial();

drop trigger if exists auditar_escrita on public.fin_categorias;
create trigger auditar_escrita
  after insert or update or delete on public.fin_categorias
  for each row execute function public.auditar_escrita_financeiro_gerencial();

drop trigger if exists auditar_escrita on public.fin_lancamentos;
create trigger auditar_escrita
  after insert or update or delete on public.fin_lancamentos
  for each row execute function public.auditar_escrita_financeiro_gerencial();

drop trigger if exists auditar_escrita on public.fin_parcelas;
create trigger auditar_escrita
  after insert or update or delete on public.fin_parcelas
  for each row execute function public.auditar_escrita_financeiro_gerencial();

drop trigger if exists auditar_escrita on public.fin_baixas;
create trigger auditar_escrita
  after insert or update or delete on public.fin_baixas
  for each row execute function public.auditar_escrita_financeiro_gerencial();

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.fin_contas_financeiras enable row level security;
alter table public.fin_categorias enable row level security;
alter table public.fin_lancamentos enable row level security;
alter table public.fin_parcelas enable row level security;
alter table public.fin_baixas enable row level security;

-- Contas financeiras: qualquer vínculo lê (precisa escolher a conta ao
-- lançar); só Gestão/master cria e edita (spec: "Gestão/Master: configura
-- contas financeiras").
create policy "fin_contas_financeiras_select" on public.fin_contas_financeiras
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_contas_financeiras_insert_gestao" on public.fin_contas_financeiras
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));
create policy "fin_contas_financeiras_update_gestao" on public.fin_contas_financeiras
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

-- Categorias: leitura liberada a qualquer vínculo; escrita só Gestão/master,
-- e só em linha não-padrão (categoria própria) - `padrao = false` no
-- próprio WITH CHECK/USING, o trigger acima é a segunda barreira.
create policy "fin_categorias_select" on public.fin_categorias
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_categorias_insert_gestao" on public.fin_categorias
  for insert to authenticated
  with check (
    padrao = false
    and public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
  );
create policy "fin_categorias_update_gestao" on public.fin_categorias
  for update to authenticated
  using (
    padrao = false
    and public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
  )
  with check (
    padrao = false
    and public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao'])
  );

-- Lançamentos: Operacional e Gestão criam; só Gestão/master edita depois de
-- salvo (mesmo padrão de `consolidados_vendas` - "só Gestão/master edita
-- lançamento já salvo"). `criado_por = auth.uid()` no INSERT (achado na
-- revisão de segurança de 24/08) impede criar lançamento em nome de outro
-- usuário via chamada direta à API.
create policy "fin_lancamentos_select" on public.fin_lancamentos
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_lancamentos_insert" on public.fin_lancamentos
  for insert to authenticated
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, null)
    and criado_por = auth.uid()
  );
create policy "fin_lancamentos_update_gestao" on public.fin_lancamentos
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, array['gestao']));

-- Parcelas: leitura/criação seguem o lançamento. UPDATE fica aberto a
-- qualquer vínculo na policy porque quem precisa passar por aqui é o
-- gatilho `recalcular_parcela_apos_baixa` (disparado por Operacional ou
-- Gestão registrando baixa) - a proteção de verdade não é a RLS, é o
-- gatilho `proteger_parcela_financeira`: bloqueia qualquer mudança em
-- valor/número/total de parcelas/vínculo com o lançamento e ignora
-- qualquer `status` que vier do cliente, sempre recalculado a partir de
-- `fin_baixas`.
create policy "fin_parcelas_select" on public.fin_parcelas
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_parcelas_insert" on public.fin_parcelas
  for insert to authenticated
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_parcelas_update" on public.fin_parcelas
  for update to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null))
  with check (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));

-- Baixas: qualquer vínculo registra pagamento/recebimento (spec: Operacional
-- "marca pagamentos/recebimentos"). Sem policy de update/delete - baixa é
-- lançamento de razão imutável; corrigir um engano é registrar uma baixa
-- nova, nunca reescrever a anterior. `criado_por = auth.uid()` no INSERT
-- (achado na revisão de segurança de 24/08) impede registrar baixa em nome
-- de outro usuário via chamada direta à API.
create policy "fin_baixas_select" on public.fin_baixas
  for select to authenticated
  using (public.usuario_pode_usar_financeiro_gerencial(unidade_id, null));
create policy "fin_baixas_insert" on public.fin_baixas
  for insert to authenticated
  with check (
    public.usuario_pode_usar_financeiro_gerencial(unidade_id, null)
    and criado_por = auth.uid()
  );

commit;
