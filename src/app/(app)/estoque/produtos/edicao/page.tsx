import { listProdutos } from "@/lib/sheets/produtos";
import { listItensPendentes } from "@/lib/sheets/inventario";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { EdicaoGrid } from "@/components/edicao-grid";
import { AreaRestrita } from "@/components/area-restrita";
import { getAcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function EdicaoDadosPage() {
  const acesso = await getAcessoAtual();
  if (acesso.role === "operacional") return <AreaRestrita />;
  let produtos;
  try {
    produtos = await listProdutos(acesso.spreadsheetId);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }
  const [pendentes, fornecedores] = await Promise.all([
    listItensPendentes(acesso.spreadsheetId),
    listFornecedores(acesso.spreadsheetId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Edição de Dados</h1>
        <p className="text-sm text-cinza-medio">
          O cadastro inteiro, como na planilha. Células destacadas estão vazias ou incompletas —
          edita direto aqui e salva linha por linha ou tudo de uma vez.
        </p>
      </div>
      <EdicaoGrid produtos={produtos} pendentes={pendentes} fornecedores={fornecedores} />
    </div>
  );
}
