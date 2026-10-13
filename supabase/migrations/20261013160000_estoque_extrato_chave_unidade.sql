-- Extrato do estoque: chave por unidade "Usar extrato do estoque" (decisão 7 de
-- Vinícius, 13/10/2026). Desligada por padrão, inclusive nas unidades que já
-- existem, até o extrato ser testado e validado: com pedidos recebidos fora do
-- Zatti Hub o saldo sairia descompensado com cara de certo.
--
--   unidades.extrato_estoque_habilitado   false = telas Movimentações e Perdas
--                                         mostram só o aviso, sem número.
--
-- O que NÃO muda: o recebimento (registrar_recebimento_pedido) continua gravando
-- as compras no extrato em segundo plano, com a chave desligada, e as travas de
-- edição de pedido recebido continuam valendo. Assim, quando a chave ligar, o
-- histórico já está lá e nada se perde. Perda manual, cancelamento e CSV ficam
-- bloqueados no app enquanto a chave estiver desligada (as telas não existem).
--
-- Quem liga: só master (Zatti), em Acessos > Unidades ou por SQL do dono. A
-- tabela unidades não tem policy de escrita (mesmo padrão de garante_habilitado).
--
-- A chave é do APP, não do banco: a leitura direta das views do extrato e as RPCs
-- registrar_perda_estoque e cancelar_movimentacao_estoque continuam disponíveis
-- para quem já tinha permissão (a RLS do extrato não muda). Não concede escrita
-- em unidades nem desliga os gatilhos do recebimento.
--
-- Idempotente. O app em produção continua funcionando com isto aplicado antes
-- da publicação (coluna nova com padrão; o app antigo não a lê).

begin;

alter table public.unidades
  add column if not exists extrato_estoque_habilitado boolean not null default false;

comment on column public.unidades.extrato_estoque_habilitado is
  'Chave "Usar extrato do estoque" (13/10/2026). false = Movimentações e Perdas mostram só o aviso; '
  'o recebimento continua gravando as compras em segundo plano. Só master liga.';

commit;
