-- Comercial: leads atuais da prospecção fria saem de 'outra' (16/11/2026).
-- Rodar depois da 20261116230000 (que cria a origem 'prospeccao_fria').
--
-- Como identificar com segurança: o SDR do Vini só manda origem 'outra' para as
-- lojas da prospecção (os outros contatos dele vão como 'site' ou 'instagram').
-- Então é da prospecção fria o lead em 'outra' cujo PRIMEIRO evento da linha do
-- tempo é uma etapa enviada pelo SDR (autor 'sdr', tipo 'etapa'). Lead criado
-- pelo formulário do site (autor 'site') ou na tela (autor 'vinicius') fica como
-- está. Conferido em produção em 16/11: 27 leads em 'outra', 26 da prospecção
-- (todos @ de hamburgueria e pizzaria abordados pelo SDR) e 1 do formulário do
-- site, que não muda.
--
-- Trava: se o número de convertidos não for exatamente 26 (conferido em produção em
-- 16/11/2026 às 23h), a transação inteira é desfeita com erro e nada muda. Se der
-- erro, algum lead entrou ou mudou depois da conferência: conferir antes de ajustar.
-- Zero convertidos passa (banco vazio do CI ou SQL já rodado). Rodar logo depois do
-- 1_ e antes de o Vini mandar a origem nova, que já converteria parte deles sozinho.
--
-- Cada lead convertido ganha uma nota na linha do tempo. Nada é apagado.
begin;

do $$
declare
  v_convertidos integer;
begin
  with primeiro as (
    select distinct on (e.lead_id) e.lead_id, e.autor, e.tipo
    from public.zh_leads_eventos e
    join public.zh_leads l on l.id = e.lead_id
    where l.origem = 'outra'
    order by e.lead_id, e.em, e.id
  ),
  convertidos as (
    update public.zh_leads l set origem = 'prospeccao_fria'
    from primeiro p
    where l.id = p.lead_id and l.origem = 'outra' and p.autor = 'sdr' and p.tipo = 'etapa'
    returning l.id
  ),
  notas as (
    insert into public.zh_leads_eventos (lead_id, tipo, texto, autor)
    select c.id, 'nota', 'Origem corrigida: Outra -> Prospecção fria (16/11)', 'vinicius'
    from convertidos c
    returning 1
  )
  select count(*) into v_convertidos from notas;

  -- 0 = banco sem esses leads (CI do GitHub, que aplica as migrações do zero) ou já convertido.
  if v_convertidos not in (0, 26) then
    raise exception 'Conversao abortada: % leads convertidos, esperado 26 (conferido em 16/11 as 23h)', v_convertidos;
  end if;
end $$;

commit;
