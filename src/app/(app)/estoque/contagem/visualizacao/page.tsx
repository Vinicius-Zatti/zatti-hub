import { listInventario } from "@/lib/sheets/inventario";
import { VisualizacaoContagens } from "@/components/visualizacao-contagens";
import { getAcessoAtual } from "@/lib/acesso";
import {
  listarAndamentoBanco,
  listarEscopoBanco,
  listarModalidadesBanco,
} from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";

export const dynamic = "force-dynamic";

export default async function VisualizacaoContagensPage() {
  const acesso = await getAcessoAtual();
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  // Inventário, andamento de todas as datas (barato) e modalidades saem
  // juntos; o snapshot só da última data (a que a conferência corrige)
  // depende do inventário e vem depois.
  const comSetor = CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
  const [itens, dadosSetor] = await Promise.all([
    listInventario(acesso.spreadsheetId),
    comSetor
      ? Promise.all([listarAndamentoBanco(acesso.unidadeId), listarModalidadesBanco(acesso.unidadeId)])
      : null,
  ]);
  const [andamentoPorData, modalidadePorData] = dadosSetor ?? [new Map(), new Map()];

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
      modalidadePorData={modalidadePorData}
      escopoUltimaData={escopoUltimaData}
    />
  );
}
