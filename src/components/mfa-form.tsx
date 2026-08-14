"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Estado = "carregando" | "cadastrar" | "desafiar" | "verificado" | "erro";

export function MfaForm() {
  const iniciou = useRef(false);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;

    async function preparar() {
      const supabase = createClient();
      const nivel = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (nivel.data?.currentLevel === "aal2") {
        setEstado("verificado");
        return;
      }

      const fatores = await supabase.auth.mfa.listFactors();
      if (fatores.error) {
        setErro("Nao foi possivel verificar o segundo fator.");
        setEstado("erro");
        return;
      }

      const fatorVerificado = fatores.data?.totp[0];
      if (fatorVerificado) {
        setFactorId(fatorVerificado.id);
        setEstado("desafiar");
        return;
      }

      // Remove cadastros abandonados para nao acumular fatores nao verificados.
      const pendentes = fatores.data?.all.filter(
        (fator) => fator.factor_type === "totp" && fator.status === "unverified",
      ) ?? [];
      for (const pendente of pendentes) {
        await supabase.auth.mfa.unenroll({ factorId: pendente.id });
      }

      const cadastro = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Zatti HUB",
      });
      if (cadastro.error || !cadastro.data) {
        setErro("Nao foi possivel iniciar o cadastro do autenticador.");
        setEstado("erro");
        return;
      }

      setFactorId(cadastro.data.id);
      setQrCode(cadastro.data.totp.qr_code);
      setSecret(cadastro.data.totp.secret);
      setEstado("cadastrar");
    }

    void preparar();
  }, []);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigo)) {
      setErro("Digite o codigo de 6 numeros do aplicativo autenticador.");
      return;
    }

    setVerificando(true);
    setErro("");
    const supabase = createClient();
    const resultado = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo });
    if (resultado.error) {
      setVerificando(false);
      setCodigo("");
      setErro("Codigo invalido ou expirado. Tente novamente.");
      return;
    }

    window.location.replace(new URL("/", window.location.origin).toString());
  }

  if (estado === "carregando") {
    return <p className="text-sm text-cinza-medio">Preparando a verificacao...</p>;
  }

  if (estado === "verificado") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-cinza-medio">Segundo fator confirmado nesta sessao.</p>
        <Link className="rounded-md bg-azul-noite px-4 py-2 text-center text-sm font-semibold text-branco" href="/">
          Continuar
        </Link>
      </div>
    );
  }

  if (estado === "erro" && !factorId) {
    return <p className="text-sm text-vermelho">{erro}</p>;
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      {estado === "cadastrar" && (
        <div className="flex flex-col gap-3 text-sm text-cinza-medio">
          <p>Escaneie o QR code no Google Authenticator, Microsoft Authenticator ou 1Password.</p>
          <Image
            src={qrCode}
            alt="QR code do segundo fator"
            width={220}
            height={220}
            unoptimized
            className="mx-auto rounded-md border border-cinza-claro"
          />
          <details>
            <summary className="cursor-pointer">Nao consegue escanear?</summary>
            <code className="mt-2 block break-all rounded bg-cinza-claro p-2 text-xs text-cinza">{secret}</code>
          </details>
        </div>
      )}
      {estado === "desafiar" && (
        <p className="text-sm text-cinza-medio">Digite o codigo atual do seu aplicativo autenticador.</p>
      )}
      <label className="text-sm font-medium text-cinza">
        Codigo de 6 numeros
        <input
          type="text"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm tracking-[0.35em]"
        />
      </label>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <button
        type="submit"
        disabled={verificando || !factorId}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {verificando ? "Verificando..." : "Confirmar codigo"}
      </button>
    </form>
  );
}
