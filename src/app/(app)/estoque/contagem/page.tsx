import { listProdutos } from "@/lib/sheets/produtos";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { ContagemForm } from "@/components/contagem-form";
import { getAcessoAtual } from "@/lib/acesso";
import {
  listarAndamentoBanco,
  listarModalidadesBanco,
  listarSetoresBanco,
} from "@/lib/banco/setores";
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
  // com escopo por grupo de produto. Vão TODOS os setores, inclusive os
  // desativados: data já aberta precisa deixar o setor dela fechar.
  const comSetor = CONTAGEM_POR_SETOR_ATIVA && acesso.fonteDadosEstoque === "banco";
  const [setores, andamentoPorData, modalidadePorData] = comSetor
    ? await Promise.all([
        listarSetoresBanco(acesso.unidadeId),
        listarAndamentoBanco(acesso.unidadeId),
        listarModalidadesBanco(acesso.unidadeId),
      ])
    : [[], new Map(), new Map()];

  return (
    <ContagemForm
      produtos={produtos}
      setores={setores}
      andamentoPorData={andamentoPorData}
      modalidadePorData={modalidadePorData}
    />
  );
}
