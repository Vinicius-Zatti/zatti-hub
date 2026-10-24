# Templates de email do Supabase (recuperação de senha e convite)

Onde trocar: painel do Supabase > Authentication > Emails > Templates.
Esta troca é manual e ainda NÃO foi feita. Enquanto não for, os emails seguem
usando o link antigo (`/auth/callback`, PKCE), que só funciona aberto no mesmo
navegador que pediu o link.

Por que trocar: o link novo aponta para `/auth/confirmar`, que confirma pelo
`token_hash` com `verifyOtp`. Não depende de cookie do navegador que pediu,
então funciona em outro aparelho, no app do Gmail e no "Reenviar acesso" da
tela Acessos (que hoje grava o cookie no navegador do master, não no da pessoa).

## Reset Password

Assunto: `Zatti Hub - criar senha nova`

```html
<h2>Criar senha nova</h2>
<p>Recebemos um pedido para trocar a senha da sua conta no Zatti Hub.</p>
<p><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha">Criar senha nova</a></p>
<p>O link vale uma vez só, por tempo limitado. Se não foi você que pediu, ignore este email.</p>
```

## Invite user

Assunto: `Zatti Hub - seu acesso`

```html
<h2>Seu acesso ao Zatti Hub</h2>
<p>Você foi convidado para o Zatti Hub. Clique no link para criar sua senha.</p>
<p><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite&next=/redefinir-senha">Criar minha senha</a></p>
<p>O link vale uma vez só, por tempo limitado.</p>
```

## Conferir antes de salvar

- Authentication > URL Configuration > Site URL precisa ser o endereço de
  produção do Zatti Hub (é o valor de `{{ .SiteURL }}`).
- Depois de salvar, testar: pedir "Esqueci minha senha" num navegador e abrir
  o link em outro aparelho. Deve cair em `/redefinir-senha`, não no login.
- Depois da troca, a frase "Abre o email nesse mesmo aparelho e clica no
  link." em `src/components/esqueci-senha-form.tsx` pode sair.
