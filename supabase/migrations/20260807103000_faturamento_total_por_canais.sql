update consolidados_vendas
set faturamento_total = total_canais + ifood + food99
where faturamento_total is distinct from total_canais + ifood + food99;
