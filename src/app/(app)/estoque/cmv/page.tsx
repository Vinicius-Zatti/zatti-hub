import { requireGestao } from "@/lib/acesso";
import { listInventario } from "@/lib/sheets/inventario";
import { listPedidosFeitos } from "@/lib/pedidos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { CalculadoraCmv } from "@/components/calculadora-cmv";
import { listarAndamentoBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";

export const dynamic = "force-dynamic";

export default async function CmvPage() {
  const acesso = await requireGestao();

  let itensInventario;
  try {
    itensInventario = await listInventario(acesso.spreadsheetId);
  } catch {
    return <ConectarPlanilha erro="Nao foi possivel carregar os dados do estoque." />;
  }

  const pedidos = await listPedidosFeitos(acesso.unidadeId);
  // Unidade na planilha não tem setor: mapa vazio mantém o comportamento antigo.
  const andamentoPorData =
    CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco"
      ? await listarAndamentoBanco(acesso.unidadeId)
      : new Map();

  return (
    <CalculadoraCmv
      itensInventario={itensInventario}
      pedidos={pedidos}
      andamentoPorData={andamentoPorData}
    />
  );
}
