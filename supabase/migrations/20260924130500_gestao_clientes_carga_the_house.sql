-- Carga inicial do piloto da Gestão de Clientes: The House Food & Fun.
--
-- Só fatos registrados em `_execucao/the-house/the-house.md` (Cérebro do
-- Gestor) e no pedido de Vinícius de 24/09/2026. O que não está lá fica em
-- branco ou "pendente" - meta principal, cadência de reuniões e saúde não
-- foram definidas e não são inventadas aqui.
--
-- Idempotente e segura em qualquer ambiente: sem exatamente uma organização
-- "The House..." ativa, ou com acompanhamento já existente, não grava nada.
-- Se a organização estiver como `saas`, passa a `hybrid`: ela usa o Zatti Hub
-- desde 17/09 e contratou BPO + consultoria em 22/09 (o tipo é só rótulo do
-- Painel de Acessos, não liga função nenhuma).
begin;

do $$
declare
  v_org text;
  v_qtd integer;
  v_id uuid;
  v_reuniao uuid;
begin
  select count(*), min(o.id) into v_qtd, v_org
  from public.organizacoes o
  where o.ativo and lower(o.nome) like 'the house%';

  if v_qtd <> 1 then
    raise notice 'Carga The House ignorada: % organizações "The House" ativas encontradas.', v_qtd;
    return;
  end if;

  if exists (select 1 from public.zh_clientes_acompanhamentos a where a.organizacao_id = v_org) then
    raise notice 'Carga The House ignorada: acompanhamento já existe.';
    return;
  end if;

  update public.organizacoes set tipo_cliente = 'hybrid'
  where id = v_org and tipo_cliente = 'saas';

  v_id := public.iniciar_acompanhamento_cliente(v_org);

  update public.zh_clientes_acompanhamentos set
    objetivo_contratado = 'BPO Financeiro + Consultoria M.E.G.A., 12 meses (fechado em 22/09/2026).',
    etapa_atual = 'ativacao',
    pessoas = '[{"nome": "Scheila", "papel": "Dona"}, {"nome": "Ingrid", "papel": "Gerente"}]'::jsonb,
    prioridades = array[
      'Concluir e assinar o contrato',
      'Fazer os três onboardings: empresas e CNPJs, financeiro e operacional'],
    proximo_marco = 'Contrato assinado e onboardings realizados',
    termo_calendario = 'The House'
  where id = v_id;

  -- Jornada: Venda concluída, Ativação em andamento.
  update public.zh_clientes_etapas set
    situacao = 'concluida',
    evidencia = 'Fechamento em 22/09/2026: _decisoes/2026-09-22-the-house-fechamento-bpo-consultoria.md',
    checklist = '[{"texto": "Proposta apresentada", "feito": true},
                  {"texto": "Escopo e valores aceitos pelo cliente", "feito": true}]'::jsonb
  where acompanhamento_id = v_id and etapa = 'venda';

  update public.zh_clientes_etapas set
    situacao = 'em_andamento',
    pendencia = 'Contrato em conclusão (dados da contratante pedidos em 23/09) e três onboardings sem data.',
    evidencia = 'Grupo "The House & Zatti Consultoria" criado em 22/09; 345 produtos e 37 fornecedores no Zatti Hub.',
    checklist = '[{"texto": "Contrato assinado", "feito": false},
                  {"texto": "Dados da contratante recebidos", "feito": false},
                  {"texto": "Grupo do cliente criado", "feito": true},
                  {"texto": "Cliente cadastrado no Zatti Hub", "feito": true},
                  {"texto": "Onboardings agendados", "feito": false}]'::jsonb
  where acompanhamento_id = v_id and etapa = 'ativacao';

  -- Onboarding: só o que já está registrado sai de "pendente".
  update public.zh_clientes_onboarding set situacao = 'informado',
    resposta = 'Scheila (dona) e Ingrid (gerente).'
  where acompanhamento_id = v_id and item = 'Responsáveis e papéis no projeto';

  update public.zh_clientes_onboarding set situacao = 'informado',
    resposta = '37 fornecedores cadastrados; parte deduzida pelo agente, falta revisar.'
  where acompanhamento_id = v_id and item = 'Fornecedores principais';

  update public.zh_clientes_onboarding set
    resposta = 'Setor de 297 insumos e dos 45 pré-preparos a designar pela Ingrid.'
  where acompanhamento_id = v_id and item = 'Setores e locais de estoque';

  update public.zh_clientes_onboarding set
    resposta = 'Falta a lista de contagem do bar.'
  where acompanhamento_id = v_id and item = 'Listas de contagem';

  update public.zh_clientes_onboarding set
    resposta = 'Nova maquininha e X Menu: Vinícius precisa entender antes do onboarding financeiro.'
  where acompanhamento_id = v_id and item = 'Maquininhas e sistema de vendas';

  -- Reunião já realizada.
  insert into public.zh_clientes_reunioes (acompanhamento_id, data, titulo, situacao, resumo, fechada_em)
  values (v_id, '2026-09-22', 'Alinhamento e fechamento', 'fechada',
    'Escopo apresentado, dúvidas sobre CNPJs e bancos, fechamento com cláusula de saída. Ata: _reunioes/2026-09/2026-09-22-the-house-alinhamento-fechamento.md',
    '2026-09-22 23:59:00-03')
  returning id into v_reuniao;

  insert into public.zh_clientes_itens (acompanhamento_id, reuniao_id, tipo, texto, responsavel, situacao)
  values
    (v_id, v_reuniao, 'decisao', 'Fechado BPO Financeiro + Consultoria M.E.G.A. por 12 meses, com cláusula de saída.', null, 'aberta'),
    (v_id, null, 'tarefa', 'Enviar os dados da contratante para o contrato', 'cliente', 'aberta'),
    (v_id, null, 'tarefa', 'Informar a estrutura dos CNPJs', 'cliente', 'aberta'),
    (v_id, null, 'tarefa', 'Enviar os extratos bancários de todos os CNPJs', 'cliente', 'aberta'),
    (v_id, null, 'tarefa', 'Marcar a reunião com a contabilidade', 'cliente', 'aberta'),
    (v_id, null, 'tarefa', 'Enviar a lista de contagem do bar', 'cliente', 'aberta'),
    (v_id, null, 'tarefa', 'Concluir o contrato', 'vinicius', 'aberta'),
    (v_id, null, 'tarefa', 'Entender o X Menu e a nova maquininha', 'vinicius', 'aberta'),
    (v_id, null, 'tarefa', 'Revisar os fornecedores deduzidos', 'vinicius', 'aberta'),
    (v_id, null, 'tarefa', 'Validar os itens que existem como comprado e como produzido', 'vinicius', 'aberta'),
    (v_id, null, 'tarefa', 'Definir a cadência das reuniões', 'vinicius', 'aberta'),
    (v_id, null, 'risco', 'Caixa no limite', null, 'aberta'),
    (v_id, null, 'risco', 'Possível bloqueio bancário', null, 'aberta'),
    (v_id, null, 'risco', 'Dados do estoque parcialmente assumidos pelo agente', null, 'aberta'),
    (v_id, null, 'fato', 'Documento Mestre ainda não existe; nasce do primeiro onboarding.', null, 'aberta');
end $$;

commit;
