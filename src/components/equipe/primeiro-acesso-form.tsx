"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { concluirPrimeiroAcessoAction } from "@/app/primeiro-acesso/actions";

/** Primeiro acesso sem sessão: e-mail + senha provisória (a do WhatsApp) +
 * senha nova. Vindo do login, e-mail e provisória já chegam preenchidos. Ao
 * salvar, entra direto com a senha nova. */
export function PrimeiroAcessoForm({ emailInicial = "", provisoriaInicial = "" }: { emailInicial?: string; provisoriaInicial?: string }) {
  const [email, setEmail] = useState(emailInicial);
  const [provisoria, setProvisoria] = useState(provisoriaInicial);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, startTransition] = useTransition();
  const veioDoLogin = Boolean(emailInicial && provisoriaInicial);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    startTransition(async () => {
      const r = await concluirPrimeiroAcessoAction(email, provisoria, senha, confirmacao);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password: senha });
      const destino = error ? "/login?senha_redefinida=1" : "/";
      window.location.replace(new URL(destino, window.location.origin).toString());
    });
  }

  const campo = "mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm";
  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      {veioDoLogin ? (
        <p className="text-sm text-cinza">Primeiro acesso de {email}. Crie agora a sua senha; a provisória deixa de valer.</p>
      ) : (
        <>
          <label className="text-sm font-medium text-cinza">
            E-mail
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} />
          </label>
          <label className="text-sm font-medium text-cinza">
            Senha provisória (a do WhatsApp)
            <input type="password" required autoComplete="one-time-code" value={provisoria} onChange={(e) => setProvisoria(e.target.value)} className={campo} />
          </label>
        </>
      )}
      <label className="text-sm font-medium text-cinza">
        Sua senha nova (mínimo 12 caracteres)
        <input type="password" required autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} />
      </label>
      <label className="text-sm font-medium text-cinza">
        Repita a senha nova
        <input type="password" required autoComplete="new-password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} className={campo} />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={pendente}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {pendente ? "Salvando..." : "Criar senha e entrar"}
      </button>
    </form>
  );
}
