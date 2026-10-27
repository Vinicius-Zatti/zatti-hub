import { listFornecedores } from "@/lib/sheets/fornecedores";
import { fornecedorIncompleto } from "@/lib/fornecedor";
import { StatCard } from "@/components/stat-card";
import { TabelaFornecedores } from "@/components/tabela-fornecedores";
import { getAcessoAtual } from "@/lib/acesso";
import Link from "next/link";
import { LinkVideoAjuda } from "@/components/videos-ajuda";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const acesso = await getAcessoAtual();
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const fornecedores = await listFornecedores(acesso.spreadsheetId);

  const incompletos = fornecedores.filter(fornecedorIncompleto);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-azul-noite">Fornecedores</h1>
          <p className="text-sm text-cinza-medio">
            Contato, condição de pagamento e prazo de entrega de cada fornecedor.
          </p>
          {/* Vídeo desta tela (27/10/2026), mesmo link discreto da Contagem. */}
          <div className="-ml-2">
            <LinkVideoAjuda id="estoque-fornecedores" pergunta="Como usar o cadastro de fornecedores?" />
          </div>
        </div>
        <Link
          href="/estoque/fornecedores/novo"
          className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo"
        >
          + Novo fornecedor
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatCard label="Fornecedores cadastrados" value={String(fornecedores.length)} />
        <StatCard
          label="Cadastro incompleto"
          value={String(incompletos.length)}
          tone={incompletos.length > 0 ? "alerta" : "neutral"}
        />
      </div>

      <TabelaFornecedores fornecedores={fornecedores} />
    </div>
  );
}
