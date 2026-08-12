# Baseline de produção - procedimento seguro

Produção já tem `organizacoes`/`unidades`/`perfis`/`vinculos`/etc criadas
manualmente (SQL Editor, 22/07) e - aparentemente - as 4 migrations de
20260807 também já aplicadas (não confirmado - é exatamente o que o
passo 1 abaixo existe pra provar, lendo `supabase_migrations.schema_migrations`
de produção). `20260722_schema_base.sql` (criada nesta revisão, 12/08)
usa `create table if not exists` - **idempotente por design, mas
idempotente não é sinônimo de seguro**: se production divergir de
qualquer forma da estrutura esperada, `if not exists` mascara isso
silenciosamente (a tabela já existe, o `create table` não faz nada, e
ninguém percebe que uma coluna está com tipo diferente, falta uma
constraint, etc). Este procedimento existe pra nunca deixar isso
acontecer sem alguém decidir de olhos abertos.

## Por que não é só rodar `supabase db push`

`supabase db push` (ou deixar o histórico remoto vazio e rodar as
migrations direto) tentaria **executar** `20260722_schema_base.sql`
contra produção. Mesmo sendo `if not exists`, isso:
- Roda como uma migration nova (version `20260722`) - se
  `supabase_migrations.schema_migrations` de produção já tiver alguma
  outra versão registrada que não bate com o histórico deste repositório
  (branch local nova, nunca sincronizada com produção antes), o `push`
  pode tentar aplicar migrations fora de ordem ou falhar de um jeito
  difícil de diagnosticar.
- Não prova nada sobre se a estrutura já existente bate com o esperado -
  só tenta criar o que falta, calado sobre o que já existe mas diverge.

## Procedimento (nenhum passo aqui foi executado - preparado, não rodado)

### Passo 1 - Pré-validação somente leitura (obrigatório, primeiro)

Rodar `pre-validacao-producao.sh` com uma connection string **read-only**
de produção (nunca a `service_role`, nunca a senha de admin do Postgres
direto se puder evitar - um usuário Postgres com só `SELECT` em
`information_schema`/`pg_catalog`/`public` já basta pra isso).

O script:
1. Lê `supabase_migrations.schema_migrations` de produção (histórico real
   de que versões já foram marcadas como aplicadas lá).
2. Tira um `pg_dump --schema-only` de produção (nunca inclui linha de
   dado - a flag `--schema-only` garante isso no nível do próprio
   `pg_dump`, não é uma promessa do script).
3. Compara contra `referencia-schema-pre-p0.sql` (dump gerado localmente
   nesta revisão, comprovadamente idêntico ao estado que
   `20260722_schema_base.sql` + as 4 migrations de 20260807 produzem -
   ver relatório de testes de rollback/reaplicação).
4. **Sai com erro se houver qualquer divergência.** Não tenta adivinhar
   se a divergência é "inofensiva" - qualquer diferença precisa de leitura
   humana antes do próximo passo.

Resultado esperado, se produção bate: `producao-schema-atual.sql` e
`producao-historico-migrations.txt` ficam salvos em
`supabase/rollback/` (gitignored - contêm topologia real de produção,
não deveriam ir pro repositório) pra registro da validação.

### Passo 2 - Se e só se o passo 1 passar limpo

Marcar o histórico de migrations de produção como já satisfeito pras
versões que já existem de fato lá, **sem executá-las**:

```
supabase migration repair --status applied 20260722
supabase migration repair --status applied 20260807090000
supabase migration repair --status applied 20260807093000
supabase migration repair --status applied 20260807100000
supabase migration repair --status applied 20260807103000
```

`migration repair` só grava uma linha em
`supabase_migrations.schema_migrations` dizendo "essa versão já rodou" -
não executa SQL nenhum da migration. É o comando correto pra "adotar"
um banco que já tem a estrutura por fora do fluxo de migrations, sem
tentar recriar nada.

### Passo 3 - Só depois do passo 2

Com o histórico corrigido, `supabase db push` (ou o fluxo de deploy que
Vinícius preferir) aplicaria só as migrations REALMENTE novas
(`20260811090000_p0_rls_hardening.sql` em diante) - essas sim, criadas
por este pacote, nunca aplicadas em produção antes.

## O que este documento NÃO autoriza

Nenhum dos três passos acima foi executado nesta revisão. Passo 1 exige
uma connection string read-only de produção que não está disponível
nesta sessão. Passos 2 e 3 exigem autorização explícita nova, separada,
depois que o passo 1 tiver rodado e o resultado (limpo ou com
divergência) tiver sido mostrado a Vinícius primeiro.
