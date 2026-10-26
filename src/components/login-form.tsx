"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { conferirProvisoriaAction } from "@/app/primeiro-acesso/actions";
import { PrimeiroAcessoForm } from "@/components/equipe/primeiro-acesso-form";
import {
  CaptchaTurnstile,
  turnstileHabilitado,
} from "@/components/captcha-turnstile";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [estado, setEstado] = useState<"idle" | "entrando" | "erro">("idle");
  const [erro, setErro] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  // Senha que não entrou pode ser a provisória do WhatsApp (primeiro acesso).
  const [primeiroAcesso, setPrimeiroAcesso] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("entrando");
    setErro("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (error) {
      if (error.message === "Invalid login credentials") {
        const conferida = await conferirProvisoriaAction(email.trim(), senha);
        if (conferida.primeiroAcesso) {
          setPrimeiroAcesso(true);
          setEstado("idle");
          return;
        }
      }
      setEstado("erro");
      setCaptchaReset((valor) => valor + 1);
      setErro(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos. Se sua senha foi redefinida, use a senha provisória que você recebeu."
          : "Não foi possível entrar. Confira os dados e tente novamente.",
      );
      return;
    }

    // Recarga completa (não router.push) pra garantir que o servidor já
    // enxerga o cookie de sessão novo na primeira renderização.
    window.location.replace(new URL("/", window.location.origin).toString());
  }

  if (primeiroAcesso) return <PrimeiroAcessoForm emailInicial={email.trim()} provisoriaInicial={senha} />;

  return (
    <form onSubmit={entrar} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-cinza">
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          placeholder="voce@exemplo.com"
        />
      </label>
      <label className="text-sm font-medium text-cinza">
        Senha
        <input
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          placeholder="••••••••"
        />
      </label>
      <CaptchaTurnstile onTokenChange={setCaptchaToken} resetSignal={captchaReset} />
      {estado === "erro" && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={estado === "entrando" || (turnstileHabilitado && !captchaToken)}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {estado === "entrando" ? "Entrando..." : "Entrar"}
      </button>
      <Link href="/esqueci-senha" className="text-center text-sm text-azul-petroleo underline">
        Esqueci minha senha
      </Link>
    </form>
  );
}
