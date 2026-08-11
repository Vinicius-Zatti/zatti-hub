"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { CaptchaTurnstile } from "@/components/captcha-turnstile";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<"idle" | "entrando" | "erro">("idle");
  const [erro, setErro] = useState("");

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("entrando");
    setErro("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
      options: captchaToken ? { captchaToken } : undefined,
    });

    if (error) {
      setEstado("erro");
      setErro(
        error.message === "Invalid login credentials"
          ? "Email ou senha incorretos."
          : error.message,
      );
      // Token do Turnstile é de uso único - força o widget a renderizar de
      // novo (gerando um token novo) antes da próxima tentativa.
      setCaptchaToken(null);
      setTentativa((n) => n + 1);
      return;
    }

    // Recarga completa (não router.push) pra garantir que o servidor já
    // enxerga o cookie de sessão novo na primeira renderização.
    window.location.href = "/";
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-cinza">
        Email
        <input
          type="email"
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
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          placeholder="••••••••"
        />
      </label>
      <CaptchaTurnstile key={tentativa} onToken={setCaptchaToken} />
      {estado === "erro" && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={estado === "entrando"}
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
