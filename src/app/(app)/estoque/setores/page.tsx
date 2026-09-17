import { requireGestao } from "@/lib/acesso";
import { listProdutos } from "@/lib/sheets/produtos";
import { listarDesignacoesBanco, listarSetoresBanco } from "@/lib/banco/setores";
import { PainelSetores } from "@/components/painel-setores";

export const dynamic = "force-dynamic";

export default async function SetoresPage() {
  const acesso = await requireGestao();

  if (acesso.fonteDadosEstoque !== "banco") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-bold text-azul-noite">Setores</h1>
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-sm text-cinza-medio">
          Esta unidade ainda lê o estoque da planilha. Setor só existe com o estoque no banco -
          a contagem segue funcionando por grupo de produto.
        </div>
      </div>
    );
  }

  const [setores, produtos, designacoes] = await Promise.all([
    listarSetoresBanco(acesso.unidadeId),
    listProdutos(acesso.spreadsheetId),
    listarDesignacoesBanco(acesso.unidadeId),
  ]);

  return (
    <PainelSetores
      setores={setores}
      produtos={produtos.filter((produto) => produto.ativo)}
      designacoes={Object.fromEntries(designacoes)}
    />
  );
}
