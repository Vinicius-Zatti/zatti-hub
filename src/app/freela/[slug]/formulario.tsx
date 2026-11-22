"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { registrarCheckinAction, type EstadoCheckinPublico } from "../acoes";
import { corTextoSobre } from "@/lib/avaliacoes/marca";
import { FUNCOES_SUGERIDAS } from "@/lib/freelancers/regras";

// Check-in do freelancer: WhatsApp, nome e função, um toque. O celular lembra o que a pessoa
// digitou da última vez (só neste aparelho), para o check-in dos dias seguintes ser imediato.

const CHAVE_APARELHO = "zh_freela_aparelho";
const CHAVE_DADOS = "zh_freela_dados";

function idDoAparelho(): string {
  const novo = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-zh`);
  try {
    const guardado = window.localStorage.getItem(CHAVE_APARELHO);
    if (guardado && /^[A-Za-z0-9-]{16,64}$/.test(guardado)) return guardado;
    const id = novo();
    window.localStorage.setItem(CHAVE_APARELHO, id);
    return id;
  } catch {
    return novo();
  }
}

type Dados = { whatsapp: string; nome: string; funcao: string };

function lerDados(): Dados | null {
  try {
    const bruto = window.localStorage.getItem(CHAVE_DADOS);
    if (!bruto) return null;
    const d = JSON.parse(bruto) as Partial<Dados>;
    return { whatsapp: String(d.whatsapp ?? "").slice(0, 40), nome: String(d.nome ?? "").slice(0, 80), funcao: String(d.funcao ?? "").slice(0, 40) };
  } catch {
    return null;
  }
}

export function FormularioCheckin(p: { slug: string; nome: string; logoUrl: string | null; corPrincipal: string; corFundo: string }) {
  const [estado, enviar, pendente] = useActionState<EstadoCheckinPublico, FormData>(registrarCheckinAction, {});
  // Campos sem estado: o que o celular lembra entra direto no campo (sincronizar com o
  // armazenamento do aparelho), e o enviado fica guardado para salvar depois do sucesso.
  const [enviado, setEnviado] = useState<Dados>({ whatsapp: "", nome: "", funcao: "" });
  const refWhatsapp = useRef<HTMLInputElement>(null);
  const refNome = useRef<HTMLInputElement>(null);
  const refFuncao = useRef<HTMLInputElement>(null);
  const inicio = useRef(0);
  const textoBotao = corTextoSobre(p.corPrincipal);
  const texto = corTextoSobre(p.corFundo);

  useEffect(() => {
    inicio.current = Date.now();
    const guardados = lerDados();
    if (!guardados) return;
    if (refWhatsapp.current && !refWhatsapp.current.value) refWhatsapp.current.value = guardados.whatsapp;
    if (refNome.current && !refNome.current.value) refNome.current.value = guardados.nome;
    if (refFuncao.current && !refFuncao.current.value) refFuncao.current.value = guardados.funcao;
  }, []);

  useEffect(() => {
    if (!estado.ok) return;
    try {
      window.localStorage.setItem(CHAVE_DADOS, JSON.stringify(enviado));
    } catch {
      // Sem armazenamento: na próxima vez a pessoa digita de novo.
    }
  }, [estado.ok, enviado]);

  const primeiroNome = enviado.nome.trim().split(/\s+/)[0] ?? "";

  if (estado.ok) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center" style={{ backgroundColor: p.corFundo, color: texto }}>
        {p.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logoUrl} alt={p.nome} className="max-h-24 max-w-[220px] object-contain" />
        ) : (
          <p className="text-2xl font-bold">{p.nome}</p>
        )}
        <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: p.corPrincipal, color: textoBotao }} aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <p className="text-2xl font-bold">{estado.jaFeito ? "Você já fez o check-in hoje" : `Check-in feito, ${primeiroNome}!`}</p>
        <p className="text-lg">Registrado às {estado.hora}. Bom trabalho!</p>
        <p className="text-sm opacity-75">O gerente confere a sua diária no fim do dia.</p>
      </main>
    );
  }

  const campo = "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-lg text-[#111111] focus:outline-none focus:ring-2";

  return (
    <main className="flex min-h-dvh flex-col items-center px-6 py-10" style={{ backgroundColor: p.corFundo, color: texto }}>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {p.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logoUrl} alt={p.nome} className="max-h-24 max-w-[220px] object-contain" />
          ) : (
            <p className="text-2xl font-bold">{p.nome}</p>
          )}
          <h1 className="text-2xl font-bold">Check-in do freelancer</h1>
          <p className="text-base opacity-80">Chegou para trabalhar? Confirme seus dados e toque no botão.</p>
        </div>
        <form
          action={(fd) => {
            fd.set("decorrido", String(Date.now() - inicio.current));
            fd.set("dispositivo", idDoAparelho());
            setEnviado({ whatsapp: String(fd.get("whatsapp") ?? ""), nome: String(fd.get("nome") ?? ""), funcao: String(fd.get("funcao") ?? "") });
            enviar(fd);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="slug" value={p.slug} />
          {/* Armadilha para robô: invisível para gente. */}
          <input type="text" name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label className="flex flex-col gap-1 text-base font-semibold">
            Seu WhatsApp com DDD
            <input
              name="whatsapp"
              inputMode="tel"
              autoComplete="tel"
              required
              ref={refWhatsapp}
              placeholder="(16) 99999-0000"
              className={campo}
              aria-invalid={estado.campo === "whatsapp"}
            />
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Seu nome
            <input
              name="nome"
              autoComplete="name"
              required
              maxLength={80}
              ref={refNome}
              className={campo}
              aria-invalid={estado.campo === "nome"}
            />
          </label>
          <label className="flex flex-col gap-1 text-base font-semibold">
            Função hoje (opcional)
            <input
              name="funcao"
              list="funcoes"
              maxLength={40}
              ref={refFuncao}
              placeholder="Ex.: Garçom"
              className={campo}
              aria-invalid={estado.campo === "funcao"}
            />
            <datalist id="funcoes">
              {FUNCOES_SUGERIDAS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          {estado.erro && (
            <p role="alert" className="rounded-lg bg-white px-3 py-2 text-base font-semibold text-[#B42318]">
              {estado.erro}
            </p>
          )}
          <button
            type="submit"
            disabled={pendente}
            className="rounded-xl px-4 py-4 text-lg font-bold disabled:opacity-60"
            style={{ backgroundColor: p.corPrincipal, color: textoBotao }}
          >
            {pendente ? "Registrando..." : "Fazer meu check-in agora"}
          </button>
          <p className="text-center text-xs opacity-70">
            Seu WhatsApp serve só para o {p.nome} saber quem trabalhou hoje e lançar a sua diária.
          </p>
        </form>
      </div>
    </main>
  );
}
