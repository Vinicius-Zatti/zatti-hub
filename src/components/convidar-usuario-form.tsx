"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convidarEVincularAction } from "@/app/(app)/acessos/actions";

type Organizacao = { id: string; nome: string };
type Unidade = { id: string; organizacaoId: string; nome: string };

export function ConvidarUsuarioForm({
  organizacoes,
  unidades,
}: {
  organizacoes: Organizacao[];
  unidades: Unidade[];
}) {
  const router = useRouter();
  const [organizacaoId, setOrganizacaoId] = useState(organizacoes[0]?.id ?? "");
  const [role, setRole] = useState<"gestao" | "operacional">("gestao");
  const [unidadeId, setUnidadeId] = useState("");
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const unidadesDaOrganizacao = useMemo(
    () => unidades.filter((u) => u.organizacaoId === organizacaoId),
    [unidades, organizacaoId]
  );

  function enviar(formData: FormData) {
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const r = await convidarEVincularAction(formData);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSucesso(
        r.jaExistia
          ? "Usuário já tinha conta - vínculo criado, sem novo email de convite."
          : "Convite enviado. A pessoa cria a própria senha pelo link do email."
      );
      router.refresh();
    });
  }

  if (organizacoes.length === 0) {
    return (
      <p className="mt-4 text-sm text-cinza-medio">
        Cadastre um cliente primeiro em{" "}
        <a href="/acessos/novo-cliente" className="font-semibold text-azul-petroleo underline">
          Novo cliente
        </a>
        .
      </p>
    );
  }

  return (
    <form action={enviar} className="mt-4 flex max-w-lg flex-col gap-3">
      <div>
        <label className="text-xs font-semibold text-cinza-medio">Email</label>
        <input
          type="email"
          name="email"
          required
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
          placeholder="pessoa@cliente.com"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-cinza-medio">Nome (opcional)</label>
        <input
          name="nome"
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-cinza-medio">Organização</label>
        <select
          name="organizacaoId"
          required
          value={organizacaoId}
          onChange={(e) => {
            setOrganizacaoId(e.target.value);
            setUnidadeId("");
          }}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        >
          {organizacoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-cinza-medio">Papel</label>
        <select
          name="role"
          required
          value={role}
          onChange={(e) => setRole(e.target.value as "gestao" | "operacional")}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        >
          <option value="gestao">Gestão</option>
          <option value="operacional">Operacional</option>
        </select>
        <p className="mt-1 text-xs text-cinza-medio">
          O painel nunca cria vínculo com papel master.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-cinza-medio">
          Unidade {role === "gestao" && "(opcional - vazio = todas as unidades da organização)"}
        </label>
        <select
          name="unidadeId"
          required={role === "operacional"}
          value={unidadeId}
          onChange={(e) => setUnidadeId(e.target.value)}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        >
          <option value="">{role === "gestao" ? "Todas as unidades" : "Escolha a unidade"}</option>
          {unidadesDaOrganizacao.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      {sucesso && <p className="text-sm text-verde">{sucesso}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="mt-2 rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {pendente ? "Enviando..." : "Convidar e vincular"}
      </button>
    </form>
  );
}
