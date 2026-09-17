import { listInventario } from "@/lib/sheets/inventario";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { VisualizacaoContagens } from "@/components/visualizacao-contagens";
import { getAcessoAtual } from "@/lib/acesso";
import { listarAndamentoBanco, listarEscopoBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";

export const dynamic = "force-dynamic";

export default async function VisualizacaoContagensPage() {
  const acesso = await getAcessoAtual();
  let itens;
  try {
    itens = await listInventario(acesso.spreadsheetId);
  } catch {
    return <ConectarPlanilha erro="Nao foi possivel carregar as contagens." />;
  }

  // Andamento de todas as datas (barato) e snapshot só da última, que é a
  // data que a conferência corrige.
  const andamentoPorData =
    CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco"
      ? await listarAndamentoBanco(acesso.unidadeId)
      : new Map();

  const ultimaData = itens.reduce((maior, item) => {
    const ts = (d: string) => {
      const [dia, mes, ano] = d.split("/").map(Number);
      return dia && mes && ano ? new Date(ano, mes - 1, dia).getTime() : 0;
    };
    return ts(item.data) > ts(maior) ? item.data : maior;
  }, "");

  const escopoUltimaData =
    CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco" && ultimaData
      ? await listarEscopoBanco(acesso.unidadeId, ultimaData)
      : [];

  return (
    <VisualizacaoContagens
      itens={itens}
      andamentoPorData={andamentoPorData}
      escopoUltimaData={escopoUltimaData}
    />
  );
}
