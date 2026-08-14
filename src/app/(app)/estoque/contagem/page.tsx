import { listProdutos } from "@/lib/sheets/produtos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { ContagemForm } from "@/components/contagem-form";
import { getAcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  const acesso = await getAcessoAtual();
  let produtos;
  try {
    produtos = await listProdutos(acesso.spreadsheetId);
  } catch {
    return <ConectarPlanilha erro="Nao foi possivel carregar os produtos." />;
  }

  return <ContagemForm produtos={produtos} />;
}
