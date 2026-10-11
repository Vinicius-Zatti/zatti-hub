"use client";

import { useState, useTransition } from "react";
import { concluirPrimeiroAcessoAction } from "@/app/primeiro-acesso/actions";

export function PrimeiroAcessoForm() {
  const [provisoria, setProvisoria] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, startTransition] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    startTransition(async () => {
      const r = await concluirPrimeiroAcessoAction(provisoria, senha, confirmacao);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      window.location.replace(new URL("/login?senha_redefinida=1", window.location.origin).toString());
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-cinza">
        Senha provisória (a do WhatsApp)
        <input
          type="password"
          required
          autoComplete="current-password"
          value={provisoria}
          onChange={(e) => setProvisoria(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm font-medium text-cinza">
        Sua senha nova (mínimo 12 caracteres)
        <input
          type="password"
          required
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        />
      </label>
      <label className="text-sm font-medium text-cinza">
        Repita a senha nova
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={pendente}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {pendente ? "Salvando..." : "Criar senha e entrar"}
      </button>
      <p className="text-xs text-cinza-medio">Depois de salvar, entre de novo com o seu e-mail e a senha nova.</p>
    </form>
  );
}
