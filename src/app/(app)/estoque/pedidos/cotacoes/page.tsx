import { gerarPedido } from "@/lib/sheets/sugestao-compra";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { CotacoesSemana } from "@/components/cotacoes-semana";
import { getAcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function CotacoesSemanaPage() {
  const acesso = await getAcessoAtual();
  let resultado;
  try {
    resultado = await gerarPedido({}, acesso.spreadsheetId);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return <CotacoesSemana itens={resultado.itens} organizacaoNome={acesso.organizacaoNome} />;
}
