# Seguranca do Zatti HUB

Este documento descreve as barreiras implementadas e a ordem de rollout. A
anon/publishable key do Supabase e publica por design; o isolamento real fica
em Auth, RLS, policies, triggers e validacao server-side. Nunca adicionar uma
`service_role` ao frontend ou a uma variavel `NEXT_PUBLIC_*`.

## Ordem de rollout

Use uma janela curta de manutencao. O rate limit falha fechado, portanto as
migracoes precisam existir antes de publicar o codigo que as chama.

1. Fazer backup do banco e testar primeiro em um projeto de staging.
2. Aplicar `supabase/migrations/20260811_seguranca_rls.sql`.
3. Aplicar `supabase/migrations/20260811_rate_limiting.sql`.
4. Publicar a aplicacao e confirmar que o build usa Next.js 16.3.0 ou superior.
5. Um usuario `master` deve entrar, cadastrar o TOTP em `/mfa` e confirmar que
   so recebe dados depois de chegar a `aal2`.
6. Cadastrar `NEXT_PUBLIC_TURNSTILE_SITE_KEY` na Vercel e fazer novo deploy.
7. Somente depois do widget aparecer em login e recuperacao, cadastrar a secret
   do Turnstile no Supabase Auth e habilitar CAPTCHA. A secret nunca vai para a
   Vercel nem para o repositorio.
8. Executar a matriz de testes abaixo antes de promover staging para producao.

Durante os passos 2 a 4, sessoes `master` em `aal1` ficam sem acesso a dados de
clientes. Isso e intencional e mais seguro que publicar o codigo antes das
funcoes de banco exigidas pelas Server Actions.

## Configuracao externa obrigatoria

### Supabase Auth

- Manter cadastro publico desabilitado; usuarios entram apenas por convite.
- Exigir senha minima de 12 caracteres e ativar protecao contra senhas vazadas,
  quando disponivel no plano.
- Manter confirmacao de email e URLs de redirecionamento restritas aos dominios
  oficiais de producao e staging.
- Ativar CAPTCHA para login por senha e recuperacao depois do passo 7.
- Revisar os rate limits nativos de login e recuperacao do Auth.
- Recomenda-se tempo maximo de sessao de 24 horas e inatividade de 8 horas,
  ajustando apenas se a operacao do cliente realmente exigir mais.
- Revisar usuarios e fatores MFA periodicamente; todo `master` deve ter TOTP.

### Vercel

- Definir segredos apenas no ambiente correto e limitar acesso ao projeto.
- Manter Preview separado de Production; nao copiar dados reais para Preview.
- Criar regra de WAF para volume anormal de POSTs e bots. O login chama o
  Supabase diretamente, entao CAPTCHA e limites do Supabase continuam sendo a
  defesa principal contra credential stuffing.
- Confirmar que os headers de `next.config.ts` aparecem tambem nas respostas de
  erro e redirecionamento.

### Google e Anthropic

- Restringir a service account do Google ao escopo de Sheets e compartilhar
  somente as planilhas necessarias.
- Rotacionar a chave da service account se ela tiver sido copiada para local
  inseguro; nao reutilizar a mesma conta em outros produtos.
- Definir limite de gasto/alerta na Anthropic. A chamada de SKU envia apenas o
  nome digitado; o catalogo completo nao sai mais do ambiente do cliente.

## Matriz minima de autorizacao

| Cenario | Resultado esperado |
| --- | --- |
| Sem sessao consulta qualquer tabela pela Data API | zero linhas/negado |
| Operacional da unidade A consulta dados da unidade B | zero linhas/negado |
| Gestao da unidade A altera `unidade_id` para B | negado |
| Operacional cria pedido ou altera preco/quantidade pedida | negado |
| Operacional atualiza somente recebimento de pedido da propria unidade | permitido |
| Operacional envia `pedidoId` de outra unidade | negado e nenhuma linha alterada |
| Operacional cria consolidado em unidade com modulo habilitado | permitido |
| Operacional edita consolidado existente | negado |
| Qualquer papel usa Financeiro com feature flag desligada | zero linhas/negado |
| Usuario tenta gravar `criado_por`/`atualizado_por` de outra pessoa | negado ou sobrescrito por `auth.uid()` |
| Master em `aal1` consulta qualquer dado de cliente | zero linhas/negado |
| Master em `aal2` consulta unidade ativa | permitido |
| Texto iniciado por `=`, `+`, `-` ou `@` vai ao Google Sheets | armazenado como texto, nunca formula |
| Mais requisicoes que o limite da acao | mensagem generica e nenhuma mutacao |

Crie ao menos duas organizacoes, duas unidades e contas separadas para executar
essa matriz. Teste tanto pela interface quanto por chamadas REST diretas usando
o access token de cada persona; alterar apenas o ID no frontend nao e um teste
suficiente de RLS.

## Verificacoes antes de cada release

```text
npm audit --omit=dev
npm run lint
npm run build
```

Tambem conferir:

- nenhuma `service_role`, chave privada ou token entrou no Git;
- migrations novas foram aplicadas antes do deploy dependente delas;
- source maps do navegador continuam desativados;
- CSP nao ganhou origens curingas desnecessarias;
- logs de auditoria continuam redigindo email, telefone, CPF/CNPJ e tokens;
- a anon key continua protegida por RLS em todas as tabelas expostas.

## Observacoes sobre recomendacoes comuns

- `NEXT_PUBLIC_SUPABASE_URL`, anon/publishable key e site key do Turnstile sao
  valores publicos. O erro seria colocar `service_role`, chave Google ou chave
  Anthropic no frontend.
- Cookies de Auth do Supabase SSR nao devem ser forçados para `HttpOnly`, pois o
  SDK do navegador precisa renovar a sessao. Eles usam `Secure` e `SameSite`, e
  a autorizacao nunca depende de esconder o token do usuario que ja esta logado.
- Esconder `.tsx` ou source maps dificulta leitura, mas nao impede abuso. Quem
  controla seguranca e custo e a combinacao de RLS, autorizacao server-side,
  validacao, rate limiting, CAPTCHA e monitoramento.
- CORS nao substitui autorizacao. Requisicoes podem ser feitas fora de um
  navegador; por isso toda operacao continua validada no banco e no servidor.
