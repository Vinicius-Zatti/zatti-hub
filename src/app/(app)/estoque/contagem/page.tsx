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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">
          Contagem de Estoque
        </h1>
        <p className="text-sm text-cinza-medio">
          Preenche a quantidade de hoje. Deixa em branco o que não for contar agora.
        </p>
      </div>
      <ContagemForm produtos={produtos} />
    </div>
  );
}
