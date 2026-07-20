import { listProdutos } from "@/lib/sheets/produtos";
import { listItensPendentes } from "@/lib/sheets/inventario";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { EdicaoGrid } from "@/components/edicao-grid";

export const dynamic = "force-dynamic";

export default async function EdicaoDadosPage() {
  let produtos;
  try {
    produtos = await listProdutos();
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }
  const pendentes = await listItensPendentes();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Edição de Dados</h1>
        <p className="text-sm text-cinza-medio">
          O cadastro inteiro, como na planilha. Células destacadas estão vazias ou incompletas —
          edita direto aqui e salva linha por linha.
        </p>
      </div>
      <EdicaoGrid produtos={produtos} pendentes={pendentes} />
    </div>
  );
}
