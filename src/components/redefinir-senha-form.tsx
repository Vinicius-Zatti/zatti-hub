"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function RedefinirSenhaForm() {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [estado, setEstado] = useState<"idle" | "salvando" | "erro">("idle");
  const [erro, setErro] = useState("");

  async function salvar(e: React.FormEvent) {
    e.preventDefault();

    if (senha.length < 8) {
      setEstado("erro");
      setErro("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setEstado("erro");
      setErro("As senhas não são iguais.");
      return;
    }

    setEstado("salvando");
    setErro("");

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setEstado("erro");
      setErro(error.message);
      return;
    }

    window.location.href = "/";
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-cinza">
        Nova senha
        <input
          type="password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          placeholder="••••••••"
        />
      </label>
      <label className="text-sm font-medium text-cinza">
        Confirmar senha
        <input
          type="password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          placeholder="••••••••"
        />
      </label>
      {estado === "erro" && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={estado === "salvando"}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {estado === "salvando" ? "Salvando..." : "Salvar senha"}
      </button>
    </form>
  );
}
