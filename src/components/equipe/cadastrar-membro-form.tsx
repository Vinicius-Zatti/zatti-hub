"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cadastrarMembroAction } from "@/app/(app)/equipe/actions";
import { textoEnvio } from "./textos";

type Unidade = { id: string; nome: string };

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";

export function CadastrarMembroForm({
  unidades,
  unidadeFixa,
  organizacaoNome,
}: {
  unidades: Unidade[];
  unidadeFixa: string | null;
  organizacaoNome: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState<"operacional" | "gestao">("operacional");
  const [pendente, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "aviso" | "erro"; texto: string } | null>(null);

  // Gestão de unidade só concede a própria unidade; operacional sempre precisa
  // de uma. Só gestão da organização inteira pode dar "Todas as unidades".
  const podeTodas = role === "gestao" && !unidadeFixa;

  function enviar(formData: FormData) {
    setMensagem(null);
    startTransition(async () => {
      const r = await cadastrarMembroAction(formData);
      if ("erro" in r) {
        setMensagem({ tipo: "erro", texto: r.erro });
        return;
      }
      if (r.situacao === "pendente_de_outro_cliente") {
        setMensagem({
          tipo: "aviso",
          texto:
            "Essa pessoa já tem conta e ainda não fez o primeiro acesso. O acesso a este cliente libera quando ela trocar a senha que já recebeu.",
        });
      } else {
        const t = textoEnvio(r.envio, r.situacao === "conta_existente");
        setMensagem({ tipo: t.tom, texto: t.texto });
      }
      formRef.current?.reset();
      setRole("operacional");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={enviar} className="mt-3 grid gap-3 md:grid-cols-2">
      <label className={ROTULO}>
        Nome
        <input name="nome" required maxLength={160} className={CAMPO} placeholder="Nome e sobrenome" />
      </label>
      <label className={ROTULO}>
        E-mail (vira o login)
        <input name="email" type="email" required maxLength={254} className={CAMPO} placeholder="pessoa@email.com" />
      </label>
      <label className={ROTULO}>
        WhatsApp
        <input name="whatsapp" type="tel" required inputMode="tel" className={CAMPO} placeholder="31 99999-8888" />
      </label>
      <label className={ROTULO}>
        Função
        <select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as "operacional" | "gestao")}
          className={CAMPO}
        >
          <option value="operacional">Operacional (contagem e rotinas)</option>
          <option value="gestao">Gestão (vê tudo e cadastra a equipe)</option>
        </select>
      </label>
      <label className={`${ROTULO} md:col-span-2`}>
        Unidade
        <select name="unidadeId" required={!podeTodas} defaultValue={unidadeFixa ?? ""} key={`${role}`} className={CAMPO}>
          {podeTodas && <option value="">Todas as unidades de {organizacaoNome}</option>}
          {!podeTodas && !unidadeFixa && (
            <option value="" disabled>
              Escolha a unidade
            </option>
          )}
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2 md:col-span-2">
        <button
          type="submit"
          disabled={pendente}
          className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
        >
          {pendente ? "Cadastrando..." : "Cadastrar e enviar acesso"}
        </button>
        {mensagem && (
          <p
            className={`text-sm ${
              mensagem.tipo === "erro" ? "text-vermelho" : mensagem.tipo === "aviso" ? "text-ambar" : "text-verde"
            }`}
          >
            {mensagem.texto}
          </p>
        )}
      </div>
    </form>
  );
}
