import { requireGestao } from "@/lib/acesso";
import { listInventario } from "@/lib/sheets/inventario";
import { listPedidosFeitos } from "@/lib/pedidos";
import { CalculadoraCmv } from "@/components/calculadora-cmv";
import { listarAndamentoBanco, listarModalidadesBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";

export const dynamic = "force-dynamic";

export default async function CmvPage() {
  const acesso = await requireGestao();

  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const itensInventario = await listInventario(acesso.spreadsheetId);

  const pedidos = await listPedidosFeitos(acesso.unidadeId);
  // Unidade na planilha não tem setor: mapa vazio mantém o comportamento antigo.
  const comSetor = CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
  const [andamentoPorData, modalidadePorData] = comSetor
    ? await Promise.all([
        listarAndamentoBanco(acesso.unidadeId),
        listarModalidadesBanco(acesso.unidadeId),
      ])
    : [new Map(), new Map()];

  return (
    <CalculadoraCmv
      itensInventario={itensInventario}
      pedidos={pedidos}
      andamentoPorData={andamentoPorData}
      modalidadePorData={modalidadePorData}
    />
  );
}
