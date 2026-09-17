import { listProdutos } from "@/lib/sheets/produtos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { ContagemForm } from "@/components/contagem-form";
import { getAcessoAtual } from "@/lib/acesso";
import { listarSetoresBanco } from "@/lib/banco/setores";
import { CONTAGEM_POR_SETOR_ATIVA } from "@/lib/contagem/ativacao";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  const acesso = await getAcessoAtual();
  let produtos;
  try {
    produtos = await listProdutos(acesso.spreadsheetId);
  } catch {
    return <ConectarPlanilha erro="Nao foi possivel carregar os produtos." />;
  }

  // Unidade sem setor cadastrado (ou ainda na planilha) segue no fluxo antigo,
  // com escopo por grupo de produto.
  const setores =
    CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco"
      ? (await listarSetoresBanco(acesso.unidadeId)).filter((setor) => setor.ativo)
      : [];

  return <ContagemForm produtos={produtos} setores={setores} />;
}
