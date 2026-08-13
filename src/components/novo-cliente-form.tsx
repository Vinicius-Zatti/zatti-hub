"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { criarClienteAction } from "@/app/(app)/acessos/actions";

export function NovoClienteForm() {
  const router = useRouter();
  const [fonteDadosEstoque, setFonteDadosEstoque] = useState<"banco" | "planilha">("banco");
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<{ organizacaoId: string; unidadeId: string } | null>(null);

  function enviar(formData: FormData) {
    setErro(null);
    setSucesso(null);
    startTransition(async () => {
      const r = await criarClienteAction(formData);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setSucesso({ organizacaoId: r.organizacaoId, unidadeId: r.unidadeId });
      router.refresh();
    });
  }

  if (sucesso) {
    return (
      <div className="rounded-lg border border-verde/30 bg-verde/10 p-4">
        <p className="font-semibold text-verde">Cliente criado.</p>
        <p className="mt-1 text-sm text-cinza">
          Organização <code className="font-mono">{sucesso.organizacaoId}</code>, unidade{" "}
          <code className="font-mono">{sucesso.unidadeId}</code>.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setSucesso(null)}
            className="rounded-md border border-azul-noite px-3 py-1.5 text-sm font-semibold text-azul-noite hover:bg-azul-noite/5"
          >
            Cadastrar outro cliente
          </button>
          <a
            href="/acessos/usuarios"
            className="rounded-md bg-azul-noite px-3 py-1.5 text-sm font-semibold text-branco hover:bg-azul-petroleo"
          >
            Convidar usuário pra esse cliente
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={enviar} className="mt-4 flex max-w-lg flex-col gap-3">
      <Campo label="Nome do cliente" name="nomeCliente" required placeholder="Ex: Restaurante Modelo" />

      <div>
        <label className="text-xs font-semibold text-cinza-medio">Tipo de cliente</label>
        <select
          name="tipoCliente"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Escolha
          </option>
          <option value="consultoria">Consultoria</option>
          <option value="saas">SaaS</option>
          <option value="hybrid">Híbrido</option>
        </select>
      </div>

      <div className="my-1 border-t border-cinza-claro" />
      <p className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">Primeira unidade</p>

      <Campo label="Nome da unidade" name="nomeUnidade" required placeholder="Ex: Matriz, Centro..." />

      <div>
        <label className="text-xs font-semibold text-cinza-medio">Fonte de dados do estoque</label>
        <select
          name="fonteDadosEstoque"
          required
          value={fonteDadosEstoque}
          onChange={(e) => setFonteDadosEstoque(e.target.value as "banco" | "planilha")}
          className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
        >
          <option value="banco">Banco (Postgres)</option>
          <option value="planilha">Planilha (Google Sheets)</option>
        </select>
      </div>

      {fonteDadosEstoque === "planilha" && (
        <Campo
          label="ID da planilha (spreadsheet_id)"
          name="spreadsheetId"
          required
          placeholder="Obrigatório com fonte planilha"
        />
      )}

      <label className="mt-1 flex items-center gap-2 text-sm text-cinza">
        <input type="checkbox" name="consolidadoVendasHabilitado" className="h-4 w-4" />
        Habilitar Consolidado de Vendas pra essa unidade
      </label>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}

      <button
        type="submit"
        disabled={pendente}
        className="mt-2 rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-60"
      >
        {pendente ? "Criando..." : "Criar cliente"}
      </button>
    </form>
  );
}

function Campo({
  label,
  name,
  ...rest
}: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-xs font-semibold text-cinza-medio">{label}</label>
      <input
        name={name}
        {...rest}
        className="mt-1 w-full rounded-md border border-cinza-claro px-3 py-2 text-sm focus:border-ambar focus:outline-none"
      />
    </div>
  );
}
