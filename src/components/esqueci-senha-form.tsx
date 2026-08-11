"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { CaptchaTurnstile } from "@/components/captcha-turnstile";

export function EsqueciSenhaForm() {
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">("idle");
  const [erro, setErro] = useState("");

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
      ...(captchaToken ? { captchaToken } : {}),
    });

    // Token do Turnstile é de uso único - força o widget a renderizar de
    // novo antes da próxima tentativa, sucesso ou erro.
    setCaptchaToken(null);
    setTentativa((n) => n + 1);

    if (error) {
      setEstado("erro");
      setErro(error.message);
      return;
    }
    setEstado("enviado");
  }

  if (estado === "enviado") {
    return (
      <p className="text-sm text-cinza-medio">
        Se <strong>{email}</strong> tiver uma conta, mandamos um link pra criar uma senha nova.
        Abre o email nesse mesmo aparelho e clica no link.
      </p>
    );
  }

  return (
    <form onSubmit={enviarLink} className="flex flex-col gap-3">
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
      <CaptchaTurnstile key={tentativa} onToken={setCaptchaToken} />
      {estado === "erro" && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={estado === "enviando"}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {estado === "enviando" ? "Enviando..." : "Enviar link"}
      </button>
    </form>
  );
}
