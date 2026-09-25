/** Como cada dado calculado da DRE é obtido, em linguagem simples com a
 * fórmula - texto do ícone "i" (regra de interface de 25/09). Chave = id da
 * linha da DRE (`dre-linhas.ts` / `dre-anual.ts`) ou do quadro/tabela. */
export const EXPLICACAO_CALCULO: Record<string, string> = {
  receita_liquida: "Receita Operacional Líquida = Receita Operacional Bruta - Deduções.",
  cmc: "CMC (Custo da Mercadoria Comprada) = soma das compras lançadas nas contas do CMC no mês de competência (mercadorias, bebidas, proteínas e embalagens).",
  cmv:
    "CMV (Custo da Mercadoria Vendida) = Estoque inicial (mercadorias + embalagens) + CMC - Estoque final (mercadorias + embalagens). " +
    "O estoque inicial é o informado no mês; se não houver, o estoque final do mês anterior. Sem o estoque final de mercadorias do mês, o CMV fica provisório: estoque inicial + CMC (estoque de embalagens zero é aceito).",
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
  produtos_sem_receita:
    "Valor dos produtos que saíram sem entrada de dinheiro, preenchido à mão por grupo. Não gera receita, não vira despesa e não altera o CMV: só explica consumo sem venda. Total = soma dos 12 meses.",
};
