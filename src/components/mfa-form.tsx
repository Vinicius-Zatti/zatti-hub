"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type Estado =
  | { fase: "carregando" }
  | { fase: "inscrever"; factorId: string; qrCode: string; secret: string }
  | { fase: "confirmar"; factorId: string }
  | { fase: "erro"; mensagem: string };

/** Cadastro/confirmação de MFA (TOTP) via `supabase.auth.mfa`. Usa o
 * client do navegador (mesmo padrão de `LoginForm`/`EsqueciSenhaForm`) -
 * o fluxo é interativo (mostrar QR code, esperar o código do app
 * autenticador) e roda inteiro no lado do cliente. `challengeAndVerify`
 * serve tanto pra confirmar um fator recém-criado quanto pra desafiar um
 * já verificado em sessão nova - mesmo caminho de código pros dois casos. */
export function MfaForm() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState("");

  useEffect(() => {
    async function preparar() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setEstado({
          fase: "erro",
          mensagem: "Não deu pra carregar a configuração de segurança. Recarrega a página.",
        });
        return;
      }

      const totpVerificado = data.all.find((f) => f.factor_type === "totp" && f.status === "verified");
      if (totpVerificado) {
        setEstado({ fase: "confirmar", factorId: totpVerificado.id });
        return;
      }

      // Fator que ficou sem terminar de verificar numa tentativa anterior:
      // o segredo/QR só é devolvido uma vez, na hora do enroll - sem como
      // recuperar depois, então descarta e cria um fator novo do zero.
      const totpPendente = data.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
      if (totpPendente) {
        await supabase.auth.mfa.unenroll({ factorId: totpPendente.id });
      }

      const { data: novo, error: erroEnroll } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (erroEnroll || !novo) {
        setEstado({
          fase: "erro",
          mensagem: "Não deu pra iniciar o cadastro de segurança. Recarrega a página.",
        });
        return;
      }
      setEstado({
        fase: "inscrever",
        factorId: novo.id,
        qrCode: novo.totp.qr_code,
        secret: novo.totp.secret,
      });
    }
    preparar();
  }, []);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (estado.fase !== "inscrever" && estado.fase !== "confirmar") return;
    setEnviando(true);
    setErroCodigo("");

    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: estado.factorId,
      code: codigo.trim(),
    });

    if (error) {
      setEnviando(false);
      setErroCodigo("Código inválido ou expirado. Confere no aplicativo autenticador e tenta de novo.");
      return;
    }

    // Recarga completa (não router.push) pra garantir que o servidor já
    // enxerga o AAL2 novo na primeira renderização - mesmo motivo do
    // LoginForm.
    window.location.href = "/";
  }

  if (estado.fase === "carregando") {
    return <p className="text-sm text-cinza-medio">Carregando...</p>;
  }

  if (estado.fase === "erro") {
    return <p className="text-sm text-vermelho">{estado.mensagem}</p>;
  }

  return (
    <form onSubmit={confirmar} className="flex flex-col gap-3">
      {estado.fase === "inscrever" && (
        <>
          <p className="text-sm text-cinza-medio">
            Escaneia esse QR code com um aplicativo autenticador (Google Authenticator, Authy, 1Password...).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG data URI vindo do Supabase, não um asset estático */}
          <img src={estado.qrCode} alt="QR code de configuração do MFA" className="mx-auto h-40 w-40" />
          <p className="break-all text-center text-xs text-cinza-medio">
            Não consegue escanear? Cadastra manualmente: <span className="font-mono">{estado.secret}</span>
          </p>
        </>
      )}
      {estado.fase === "confirmar" && (
        <p className="text-sm text-cinza-medio">Digite o código do seu aplicativo autenticador.</p>
      )}
      <label className="text-sm font-medium text-cinza">
        Código de 6 dígitos
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          placeholder="000000"
        />
      </label>
      {erroCodigo && <p className="text-sm text-vermelho">{erroCodigo}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {enviando ? "Confirmando..." : "Confirmar"}
      </button>
    </form>
  );
}
