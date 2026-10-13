/** Como cada dado calculado da DRE é obtido, em linguagem simples com a
 * fórmula - texto do ícone "i" (regra de interface de 25/09). Chave = id da
 * linha da DRE (`dre-linhas.ts` / `dre-anual.ts`) ou do quadro/tabela. */
export const EXPLICACAO_CALCULO: Record<string, string> = {
  coluna_total: "Total = soma só dos meses já realizados (até o mês atual). Os meses futuros em cinza são previsão e não entram no Total.",
  coluna_media: "Média = Total ÷ número de meses já realizados (até o mês atual). Os meses futuros em cinza não entram na Média.",
  receita_liquida: "Receita Operacional Líquida = Receita Operacional Bruta - Deduções.",
  cmc: "CMC (Custo da Mercadoria Comprada) = soma das compras lançadas nas contas do CMC no mês de competência (mercadorias, bebidas, proteínas e embalagens).",
  cmv:
    "CMV (Custo da Mercadoria Vendida) = Estoque inicial (mercadorias + embalagens) + CMC - Estoque final (mercadorias + embalagens). " +
    "O estoque inicial é o informado no mês (senão, o estoque final do mês anterior); o estoque final é o informado no mês (senão, o estoque inicial do mês seguinte). Sem estoque final de mercadorias por nenhuma das duas fontes, o CMV fica provisório: estoque inicial + CMC (estoque de embalagens zero é aceito).",
  cmv_percentual:
    "% CMV = CMV ÷ Venda de Produtos, quando o estoque final e a Venda de Produtos do mês estão informados. " +
    "Enquanto não estão, aparece o % CMC provisório = CMC ÷ (Receita Operacional Bruta - receitas de entrega).",
  margem: "Resultado Operacional Bruto = Receita Operacional Líquida - CMV. É a margem de contribuição em reais.",
  margem_percentual: "% Margem de Contribuição = Resultado Operacional Bruto ÷ Receita Operacional Bruta.",
  custos_fixos: "Custos Fixos = Custo com Mão de Obra (CMO) + Custos Operacionais.",
  custos_fixos_percentual: "% Custos Fixos = Custos Fixos ÷ Receita Operacional Bruta.",
  cmo: "CMO = soma das contas de mão de obra lançadas no mês + Provisionamento (Provisão 13º, Provisão Férias e Provisão Multa FGTS, calculadas sobre folha, FGTS e INSS).",
  cmo_percentual: "% CMO = CMO ÷ Receita Operacional Bruta.",
  custos_operacionais_percentual: "% Custos Operacionais = Custos Operacionais ÷ Receita Operacional Bruta.",
  resultado_liquido: "Resultado Líquido do Exercício = Resultado Operacional Bruto - Custos Fixos.",
  resultado_liquido_percentual: "% Resultado Líquido do Exercício = Resultado Líquido do Exercício ÷ Receita Operacional Bruta.",
  saidas_percentual: "% Saídas não Operacionais = Saídas não Operacionais ÷ Receita Operacional Bruta.",
  resultado_economico: "Resultado Econômico = Resultado Líquido do Exercício - Saídas não Operacionais (retiradas, empréstimos, investimentos).",
  resultado_economico_percentual: "% Resultado Econômico = Resultado Econômico ÷ Receita Operacional Bruta.",
  quadro_resultado_liquido:
    "Resultado Líquido do Exercício do mês de competência (Resultado Operacional Bruto - Custos Fixos). % = Resultado Líquido ÷ Receita Operacional Bruta do mês. " +
    "Abaixo: o mês anterior e a média dos três meses anteriores, com a diferença para o mês atual.",
  quadro_resultado_economico:
    "Resultado Econômico do mês de competência (Resultado Líquido do Exercício - Saídas não Operacionais). % = Resultado Econômico ÷ Receita Operacional Bruta do mês. " +
    "Abaixo: o mês anterior e a média dos três meses anteriores, com a diferença para o mês atual.",
  quadro_ponto_equilibrio:
    "Ponto de Equilíbrio do mês = Custos Fixos ÷ % Margem de Contribuição: a receita necessária para cobrir os custos fixos. " +
    "% = Receita Operacional Bruta do mês ÷ Ponto de Equilíbrio (100% = empatou; acima de 100% = passou do ponto). Com margem zero ou negativa não existe ponto de equilíbrio.",
  venda_produtos:
    "Venda de Produtos = valor dos produtos vendidos, produzidos ou entregues no mês, com ou sem entrada de dinheiro (inclui voucher, cortesia, bonificação e produção de conteúdo). Preenchido à mão; é só a base do % CMV (CMV ÷ Venda de Produtos) e não soma na receita.",
  sugestao_contagem_estoque:
    "Sugestão = valor da última contagem completa com data dentro do mês (contagem antiga, ou contagem por setor com todos os setores concluídos), a mais próxima do fim do mês. " +
    "Valor = soma de quantidade × preço de todos os itens da contagem, o mesmo da Contagem > Visualização e da Calculadora de CMV. Item sem preço ou sem quantidade vale R$ 0 e deixa o valor parcial. " +
    "Embalagens = itens do grupo EMB do padrão de SKU Zatti (as 3 primeiras letras do SKU; SKU fora do padrão usa o grupo do cadastro). Mercadorias = todos os outros itens; item sem grupo reconhecido também vai para Mercadorias e a tela avisa quantos. Usar o valor só preenche o campo: nada é salvo sem você.",
  painel_faturamento: "Faturamento = Receita Operacional Bruta da DRE no mês de competência (mesmo número da DRE).",
  painel_cmv_percentual:
    "% CMV da DRE no mês = CMV ÷ Venda de Produtos, quando o estoque final e a Venda de Produtos do mês estão informados. " +
    "Enquanto não estão, a DRE mostra o % CMC provisório = CMC ÷ (Receita Operacional Bruta - receitas de entrega), os indicadores da DRE ficam sem farol e o acompanhamento passa ao Ritmo do mês.",
  painel_margem:
    "Margem de Contribuição = Resultado Operacional Bruto da DRE (Receita Operacional Líquida - CMV). % = Resultado Operacional Bruto ÷ Receita Operacional Bruta.",
  painel_custo_fixo: "% Custos Fixos da DRE = (CMO + Custos Operacionais) ÷ Receita Operacional Bruta do mês.",
  painel_ponto_equilibrio:
    "Ponto de Equilíbrio da DRE = Custos Fixos ÷ % Margem de Contribuição do mês: a receita necessária para cobrir os custos fixos. " +
    "% = Receita Operacional Bruta ÷ Ponto de Equilíbrio. Com margem zero ou negativa não existe ponto de equilíbrio.",
  painel_resultado:
    "Resultado = Resultado Líquido do Exercício da DRE (Resultado Operacional Bruto - Custos Fixos). % = Resultado Líquido ÷ Receita Operacional Bruta.",
  painel_caixa_30:
    "Caixa projetado em 30 dias = saldo do Fluxo de Caixa projetado, todas as contas, no fim do dia de hoje + 30 dias: saldos iniciais das contas + todas as parcelas não canceladas (valor cheio) pela data prevista até essa data. Não depende do mês escolhido.",
  painel_farol:
    "Farol = número da DRE comparado com a meta da unidade vigente no mês (a meta cadastrada com início no próprio mês ou no mês anterior mais recente). " +
    "Faturamento e Resultado: verde quando o número é maior ou igual à meta. % CMV e % Custos Fixos: verde quando é menor ou igual à meta. Senão, vermelho. Sem meta cadastrada, o número fica sem cor. Mês com CMV provisório: nenhum indicador da DRE ganha cor até o mês fechar; nesse período vale o Ritmo do mês.",
  painel_ritmo_cmv_compras:
    "CMV de compras até hoje = compras lançadas nas contas do CMC (mercadorias e embalagens) com data de competência até hoje, no mês do painel. Parcela cancelada fica fora, igual à DRE; compra lançada com data depois de hoje ainda não conta. " +
    "Meta do mês em R$ = Faturamento mínimo × % CMV máximo das metas da unidade (precisa das duas). Esperado até hoje = meta do mês × dias decorridos ÷ dias do mês (ritmo diário; o dia de hoje conta). Mês anterior ainda sem inventário: esperado = meta do mês inteiro.",
  painel_ritmo_custos_variaveis:
    "Custos variáveis até hoje = contas do subgrupo Custos de Venda Variáveis + a conta Freelancers (que na DRE fica no CMO), com data de competência até hoje, no mês do painel. Parcela cancelada fica fora, igual à DRE. " +
    "Meta = Custos variáveis máximos no mês (R$), das metas da unidade. Esperado até hoje = meta × dias decorridos ÷ dias do mês. Folha fixa não entra: não se divide por dia.",
  painel_ritmo_farol:
    "Farol por ritmo (só enquanto o CMV do mês é provisório): verde = realizado até hoje menor ou igual ao esperado; amarelo = acima do esperado até 20% (realizado ≤ esperado × 1,2); vermelho = mais de 20% acima do esperado. " +
    "Sem meta cadastrada, sem cor. Mês ainda não começado não tem ritmo. Com o inventário do mês, o farol volta a ser o da DRE (verde/vermelho contra a meta do mês inteiro).",
  produtos_sem_receita:
    "Valor dos produtos que saíram sem entrada de dinheiro, preenchido à mão por grupo. Não gera receita, não vira despesa e não altera o CMV: só explica consumo sem venda. Total = soma dos 12 meses.",
};
