-- Ajustes no plano de contas padrão pedidos por Vinícius em 25/09/2026.
-- Aditiva: nenhuma linha de `fin_categorias` é apagada, nenhum lançamento
-- muda de conta. Custos de Venda Fixos não mudam (decisão pendente dele).
--
-- Regra das contas divididas (Vendas no salão, Delivery próprio, Delivery
-- marketplace, Eventos/encomendas/catering, Manutenção e reparos, Limpeza/
-- dedetização/segurança, Contabilidade): numa unidade em que a conta antiga
-- NÃO tem lançamento nem recorrência, ela é renomeada para a primeira conta
-- nova (nome + codigo_sistema novos) e o seed cria as demais. Onde ela TEM
-- lançamento/recorrência, ela fica ativa com o nome antigo (o histórico não
-- é reclassificado sem decisão de Vinícius) e o seed cria todas as novas ao
-- lado. `codigo_sistema` dessas contas não é usado por nenhuma regra do app
-- (cálculo usa `papel_dre`; provisões usam só cmo_folha_salarial/cmo_fgts/
-- cmo_inss_folha; DFC usa só sno_equipamentos_investimentos).
--
-- Decisões de Vinícius sobre as pendências (25/09, mesma data):
-- - "Outras receitas operacionais" vira "Outras receitas" (continua receita
--   operacional, dentro do subgrupo Outras Receitas) e nasce "Receitas
--   financeiras" ao lado.
-- - "Compras de embalagens" fica, última linha do CMC.
-- - "Marketing de marketplace não vinculado diretamente à venda" (Custos de
--   Venda Fixos) é unificada em "Marketing de marketplace" (Custos de Venda
--   Variáveis): lançamentos e recorrências dela passam para a conta variável
--   e ela é arquivada, sem apagar.
-- - Grupo CMO no singular: "CMO - Custo de Mão de Obra".
-- - "Descontos em entregas e frete grátis".
begin;

-- ── 1) Seed padrão (unidades novas nascem com o plano novo) ─────────────
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
  v_receitas_loja uuid;
  v_receitas_delivery uuid;
  v_outras_receitas uuid;
begin
  insert into public.fin_categorias (unidade_id, parent_id, nivel, nome, codigo_sistema, padrao, ordem)
  values
    (p_unidade_id, null, 'grupo_principal', 'Receita Operacional Bruta', 'receita', true, 1),
    (p_unidade_id, null, 'grupo_principal', 'Deduções', 'deducoes', true, 2),
    (p_unidade_id, null, 'grupo_principal', 'CMV - Custo da Mercadoria Vendida', 'cmv', true, 3),
    (p_unidade_id, null, 'grupo_principal', 'CMO - Custo de Mão de Obra', 'cmo', true, 4),
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
    (p_unidade_id, v_receita, 'subgrupo', 'Receitas da Loja', 'receitas_loja', true, 1),
    (p_unidade_id, v_receita, 'subgrupo', 'Receitas de Delivery', 'receitas_delivery', true, 2),
    (p_unidade_id, v_receita, 'subgrupo', 'Outras Receitas', 'outras_receitas', true, 3),
    (p_unidade_id, v_deducoes, 'subgrupo', 'Deduções da Receita', 'deducoes_da_receita', true, 1),
    (p_unidade_id, v_deducoes, 'subgrupo', 'Custos de Venda Variáveis', 'custos_venda_variaveis', true, 2),
    (p_unidade_id, v_cmv, 'subgrupo', 'CMC - Custo da Mercadoria Comprada', 'cmc', true, 1),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos de Ocupação', 'custos_ocupacao', true, 1),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos Administrativos', 'custos_administrativos', true, 2),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos Comerciais', 'custos_comerciais', true, 3),
    (p_unidade_id, v_custos_operacionais, 'subgrupo', 'Custos de Venda Fixos', 'custos_venda_fixos', true, 4)
  on conflict (unidade_id, codigo_sistema) do nothing;

  select id into v_receitas_loja from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'receitas_loja';
  select id into v_receitas_delivery from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'receitas_delivery';
  select id into v_outras_receitas from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'outras_receitas';
  select id into v_deducoes_da_receita from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'deducoes_da_receita';
  select id into v_custos_venda_variaveis from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_venda_variaveis';
  select id into v_cmc from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'cmc';
  select id into v_custos_ocupacao from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_ocupacao';
  select id into v_custos_administrativos from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_administrativos';
  select id into v_custos_comerciais from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_comerciais';
  select id into v_custos_venda_fixos from public.fin_categorias where unidade_id = p_unidade_id and codigo_sistema = 'custos_venda_fixos';

  insert into public.fin_categorias (unidade_id, parent_id, nivel, papel_dre, nome, codigo_sistema, padrao, ordem)
  values
    (p_unidade_id, v_receitas_loja, 'conta', 'receita', 'Venda cartão de crédito', 'receita_loja_credito', true, 1),
    (p_unidade_id, v_receitas_loja, 'conta', 'receita', 'Venda cartão de débito', 'receita_loja_debito', true, 2),
    (p_unidade_id, v_receitas_loja, 'conta', 'receita', 'Venda dinheiro', 'receita_loja_dinheiro', true, 3),
    (p_unidade_id, v_receitas_loja, 'conta', 'receita', 'Venda Pix', 'receita_loja_pix', true, 4),
    (p_unidade_id, v_receitas_loja, 'conta', 'receita', 'Venda ticket alimentação', 'receita_loja_ticket', true, 5),
    (p_unidade_id, v_receitas_delivery, 'conta', 'receita', 'Venda iFood', 'receita_ifood_venda', true, 1),
    (p_unidade_id, v_receitas_delivery, 'conta', 'receita', 'Entrega iFood', 'receita_ifood_entrega', true, 2),
    (p_unidade_id, v_receitas_delivery, 'conta', 'receita', 'Venda 99', 'receita_99_venda', true, 3),
    (p_unidade_id, v_receitas_delivery, 'conta', 'receita', 'Entrega 99', 'receita_99_entrega', true, 4),
    (p_unidade_id, v_receitas_delivery, 'conta', 'receita', 'Venda app próprio', 'receita_app_proprio_venda', true, 5),
    (p_unidade_id, v_receitas_delivery, 'conta', 'receita', 'Entrega app próprio', 'receita_app_proprio_entrega', true, 6),
    (p_unidade_id, v_outras_receitas, 'conta', 'receita', 'Eventos', 'receita_outras_eventos', true, 1),
    (p_unidade_id, v_outras_receitas, 'conta', 'receita', 'Encomendas', 'receita_outras_encomendas', true, 2),
    (p_unidade_id, v_outras_receitas, 'conta', 'receita', 'Catering', 'receita_outras_catering', true, 3),
    (p_unidade_id, v_outras_receitas, 'conta', 'receita', 'Receitas financeiras', 'receita_outras_financeiras', true, 4),
    (p_unidade_id, v_outras_receitas, 'conta', 'receita', 'Outras receitas', 'receita_outras', true, 5),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Impostos sobre vendas', 'deducao_impostos', true, 1),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Descontos concedidos', 'deducao_descontos', true, 2),
    (p_unidade_id, v_deducoes_da_receita, 'conta', 'deducao_receita', 'Devoluções e cancelamentos', 'deducao_devolucoes', true, 3),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Taxas de adquirência e meios de pagamento', 'cvv_adquirencia', true, 1),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Comissões e taxas variáveis de marketplace', 'cvv_comissoes_marketplace', true, 2),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Descontos em entregas e frete grátis', 'cvv_entregas_fretes', true, 3),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Marketing de marketplace', 'cvv_marketing_marketplace', true, 4),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Tráfego pago vinculado diretamente à venda', 'cvv_trafego_pago_venda', true, 5),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Comissões de venda', 'cvv_comissoes_venda', true, 6),
    (p_unidade_id, v_custos_venda_variaveis, 'conta', 'custo_venda_variavel', 'Outros custos variáveis de venda', 'cvv_outros', true, 7),
    (p_unidade_id, v_cmc, 'conta', 'cmc_mercadorias', 'Custo com bebidas', 'cmc_bebidas', true, 1),
    (p_unidade_id, v_cmc, 'conta', 'cmc_mercadorias', 'Custo com mercadorias', 'cmc_compras_mercadorias', true, 2),
    (p_unidade_id, v_cmc, 'conta', 'cmc_mercadorias', 'Custo com proteínas', 'cmc_proteinas', true, 3),
    (p_unidade_id, v_cmc, 'conta', 'cmc_embalagens', 'Compras de embalagens', 'cmc_compras_embalagens', true, 4),
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
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Manutenção elétrica', 'co_manutencao_eletrica', true, 7),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Manutenção predial', 'co_manutencao_predial', true, 8),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Limpeza', 'co_limpeza', true, 9),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Dedetização', 'co_dedetizacao', true, 10),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Segurança', 'co_seguranca', true, 11),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Softwares operacionais', 'co_softwares', true, 12),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Assessoria e consultorias recorrentes', 'co_assessoria', true, 13),
    (p_unidade_id, v_custos_ocupacao, 'conta', 'custo_ocupacao', 'Outros custos de ocupação', 'co_outros', true, 14),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Tarifas bancárias', 'ca_tarifas_bancarias', true, 1),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Aluguel e manutenção de maquininhas', 'ca_maquininhas', true, 2),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Licenças e taxas administrativas', 'ca_licencas_taxas', true, 3),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Material de escritório', 'ca_material_escritorio', true, 4),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Assessoria contábil', 'ca_assessoria_contabil', true, 5),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Assessoria de gestão', 'ca_assessoria_gestao', true, 6),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Seguros', 'ca_seguros', true, 7),
    (p_unidade_id, v_custos_administrativos, 'conta', 'custo_administrativo', 'Outros custos administrativos', 'ca_outros', true, 8),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Marketing institucional', 'cc_marketing_institucional', true, 1),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Tráfego pago não vinculado diretamente à venda', 'cc_trafego_pago_geral', true, 2),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Produção de conteúdo e criativos', 'cc_producao_conteudo', true, 3),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Agência e assessoria de marketing', 'cc_agencia_marketing', true, 4),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Promoções e ações comerciais', 'cc_promocoes', true, 5),
    (p_unidade_id, v_custos_comerciais, 'conta', 'custo_comercial', 'Outros custos comerciais', 'cc_outros', true, 6),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Logística fixa', 'cvf_logistica_fixa', true, 1),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Diárias de motoboy', 'cvf_diarias_motoboy', true, 2),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Mensalidades de plataformas de venda', 'cvf_mensalidades_plataformas', true, 3),
    (p_unidade_id, v_custos_venda_fixos, 'conta', 'custo_venda_fixo', 'Outros custos de venda fixos', 'cvf_outros', true, 4),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Retiradas de sócios', 'sno_retiradas_socios', true, 1),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Pagamento de principal de empréstimos', 'sno_pagamento_principal_emprestimos', true, 2),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Compra de equipamentos e investimentos', 'sno_equipamentos_investimentos', true, 3),
    (p_unidade_id, v_saidas_nao_operacionais, 'conta', 'saida_nao_operacional', 'Outras saídas não operacionais', 'sno_outras', true, 4)
  on conflict (unidade_id, codigo_sistema) do nothing;
end;
$$;

revoke all on function public.semear_categorias_financeiras(text) from public, anon, authenticated;

-- ── 2) Unidades que já têm plano de contas ──────────────────────────────
do $$
declare
  v_unidade text;
  v_divisao record;
  v_id uuid;
begin
  for v_unidade in
    select distinct unidade_id from public.fin_categorias where codigo_sistema = 'receita'
  loop
    -- 2a) Conta dividida sem nenhum uso vira a primeira conta nova.
    for v_divisao in
      select * from (values
        ('receita_salao', 'receita_loja_credito', 'Venda cartão de crédito'),
        ('receita_delivery_proprio', 'receita_app_proprio_venda', 'Venda app próprio'),
        ('receita_marketplace', 'receita_ifood_venda', 'Venda iFood'),
        ('receita_eventos', 'receita_outras_eventos', 'Eventos'),
        ('co_manutencao_reparos', 'co_manutencao_eletrica', 'Manutenção elétrica'),
        ('co_limpeza_seguranca', 'co_limpeza', 'Limpeza'),
        ('ca_contabilidade', 'ca_assessoria_contabil', 'Assessoria contábil')
      ) as d(codigo_antigo, codigo_novo, nome_novo)
    loop
      select id into v_id
        from public.fin_categorias
        where unidade_id = v_unidade and codigo_sistema = v_divisao.codigo_antigo;
      if v_id is null then
        continue;
      end if;

      if exists (select 1 from public.fin_lancamentos where unidade_id = v_unidade and categoria_id = v_id)
         or exists (select 1 from public.fin_recorrencias where unidade_id = v_unidade and categoria_id = v_id) then
        raise notice 'Unidade %: conta % mantida ativa com o nome antigo (tem lancamento ou recorrencia)', v_unidade, v_divisao.codigo_antigo;
        continue;
      end if;

      if exists (select 1 from public.fin_categorias where unidade_id = v_unidade and codigo_sistema = v_divisao.codigo_novo) then
        continue;
      end if;

      update public.fin_categorias
        set codigo_sistema = v_divisao.codigo_novo, nome = v_divisao.nome_novo, atualizado_em = now()
        where id = v_id;
    end loop;

    -- 2b) Subgrupos e contas novas (idempotente, não mexe no que já existe).
    perform public.semear_categorias_financeiras(v_unidade);
  end loop;
end;
$$;

-- 2c) Renomeações 1:1 (mesma conta, mesmo histórico, só o texto muda).
update public.fin_categorias as c
  set nome = r.nome, atualizado_em = now()
  from (values
    ('cmv', 'CMV - Custo da Mercadoria Vendida'),
    ('cmc', 'CMC - Custo da Mercadoria Comprada'),
    ('cmo', 'CMO - Custo de Mão de Obra'),
    ('receita_outras', 'Outras receitas'),
    ('deducao_devolucoes', 'Devoluções e cancelamentos'),
    ('cvv_entregas_fretes', 'Descontos em entregas e frete grátis'),
    ('cmc_compras_mercadorias', 'Custo com mercadorias')
  ) as r(codigo, nome)
  where c.padrao = true and c.codigo_sistema = r.codigo and c.nome is distinct from r.nome;

-- 2d) Contas de receita dentro dos subgrupos novos. As contas antigas que
-- ficaram ativas (tinham lançamento) vão para o subgrupo correspondente,
-- sem mudar papel_dre nem valor.
update public.fin_categorias as c
  set parent_id = sg.id, atualizado_em = now()
  from (values
    ('receita_loja_credito', 'receitas_loja'),
    ('receita_loja_debito', 'receitas_loja'),
    ('receita_loja_dinheiro', 'receitas_loja'),
    ('receita_loja_pix', 'receitas_loja'),
    ('receita_loja_ticket', 'receitas_loja'),
    ('receita_salao', 'receitas_loja'),
    ('receita_ifood_venda', 'receitas_delivery'),
    ('receita_ifood_entrega', 'receitas_delivery'),
    ('receita_99_venda', 'receitas_delivery'),
    ('receita_99_entrega', 'receitas_delivery'),
    ('receita_app_proprio_venda', 'receitas_delivery'),
    ('receita_app_proprio_entrega', 'receitas_delivery'),
    ('receita_delivery_proprio', 'receitas_delivery'),
    ('receita_marketplace', 'receitas_delivery'),
    ('receita_outras_eventos', 'outras_receitas'),
    ('receita_outras_encomendas', 'outras_receitas'),
    ('receita_outras_catering', 'outras_receitas'),
    ('receita_outras_financeiras', 'outras_receitas'),
    ('receita_outras', 'outras_receitas'),
    ('receita_eventos', 'outras_receitas')
  ) as m(codigo_conta, codigo_subgrupo)
  join public.fin_categorias as sg on sg.codigo_sistema = m.codigo_subgrupo
  where c.padrao = true
    and c.codigo_sistema = m.codigo_conta
    and sg.unidade_id = c.unidade_id
    and c.parent_id is distinct from sg.id;

-- 2e) Ordem nova (contas antigas mantidas vão para o fim do subgrupo).
update public.fin_categorias as c
  set ordem = o.ordem, atualizado_em = now()
  from (values
    ('receita_outras_financeiras', 4),
    ('receita_outras', 5),
    ('cvf_outros', 4),
    ('receita_salao', 99),
    ('receita_delivery_proprio', 98),
    ('receita_marketplace', 99),
    ('receita_eventos', 99),
    ('cmc_bebidas', 1),
    ('cmc_compras_mercadorias', 2),
    ('cmc_proteinas', 3),
    ('cmc_compras_embalagens', 4),
    ('co_manutencao_eletrica', 7),
    ('co_manutencao_predial', 8),
    ('co_limpeza', 9),
    ('co_dedetizacao', 10),
    ('co_seguranca', 11),
    ('co_softwares', 12),
    ('co_assessoria', 13),
    ('co_outros', 14),
    ('co_manutencao_reparos', 98),
    ('co_limpeza_seguranca', 99),
    ('ca_assessoria_contabil', 5),
    ('ca_assessoria_gestao', 6),
    ('ca_seguros', 7),
    ('ca_outros', 8),
    ('ca_contabilidade', 99)
  ) as o(codigo, ordem)
  where c.padrao = true and c.codigo_sistema = o.codigo and c.ordem is distinct from o.ordem;

-- 2f) Marketing de marketplace unificado na conta variável. Lançamentos e
-- recorrências trocam de conta (mesmo valor, mesma data); a conta fixa fica
-- arquivada, nunca apagada.
update public.fin_lancamentos as l
  set categoria_id = var.id
  from public.fin_categorias as fixa
  join public.fin_categorias as var
    on var.unidade_id = fixa.unidade_id and var.codigo_sistema = 'cvv_marketing_marketplace'
  where fixa.codigo_sistema = 'cvf_marketing_marketplace_geral'
    and l.unidade_id = fixa.unidade_id
    and l.categoria_id = fixa.id;

update public.fin_recorrencias as r
  set categoria_id = var.id
  from public.fin_categorias as fixa
  join public.fin_categorias as var
    on var.unidade_id = fixa.unidade_id and var.codigo_sistema = 'cvv_marketing_marketplace'
  where fixa.codigo_sistema = 'cvf_marketing_marketplace_geral'
    and r.unidade_id = fixa.unidade_id
    and r.categoria_id = fixa.id;

update public.fin_categorias
  set arquivado = true, atualizado_em = now()
  where codigo_sistema = 'cvf_marketing_marketplace_geral'
    and arquivado = false;

commit;
