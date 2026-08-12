-- Distingue o último preço carregado automaticamente de uma cotação que a
-- pessoa confirmou, inclusive quando o fornecedor repetiu o preço antigo.
alter table pedido_itens
add column if not exists preco_confirmado boolean not null default false;

-- Valores diferentes são cotações inequivocamente editadas. Vencedores já
-- escolhidos também ficam confirmados para preservar o histórico existente.
update pedido_itens
set preco_confirmado = true
where preco_atualizado is not null
  and (vencedor_confirmado = true or preco_antigo is distinct from preco_atualizado);
