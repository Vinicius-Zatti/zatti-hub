import { listProdutos } from "@/lib/sheets/produtos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { ContagemForm } from "@/components/contagem-form";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  let produtos;
  try {
    produtos = await listProdutos();
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return <ContagemForm produtos={produtos} />;
}
