"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  CaptchaTurnstile,
  turnstileHabilitado,
} from "@/components/captcha-turnstile";

export function EsqueciSenhaForm() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">("idle");
  const [erro, setErro] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro("");

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
      captchaToken: captchaToken || undefined,
    });

    if (error) {
      setEstado("erro");
      setCaptchaReset((valor) => valor + 1);
      setErro("Nao foi possivel enviar o link agora. Aguarde um pouco e tente novamente.");
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
      <CaptchaTurnstile onTokenChange={setCaptchaToken} resetSignal={captchaReset} />
      {estado === "erro" && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={estado === "enviando" || (turnstileHabilitado && !captchaToken)}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {estado === "enviando" ? "Enviando..." : "Enviar link"}
      </button>
    </form>
  );
}
