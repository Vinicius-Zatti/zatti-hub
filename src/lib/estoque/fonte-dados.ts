import { getAcessoAtual } from "@/lib/acesso";

/** Confere a origem no servidor e amarra a chamada à unidade da sessão.
 * O identificador da planilha continua no argumento durante a transição,
 * mas nunca é aceito como autorização ou como escolha livre de unidade. */
export async function resolverFonteDadosEstoque(spreadsheetId: string | null) {
  const acesso = await getAcessoAtual();

  if (spreadsheetId !== acesso.spreadsheetId) {
    throw new Error("A origem de dados não pertence à unidade atual.");
  }
  if (acesso.fonteDadosEstoque === "planilha" && !spreadsheetId) {
    throw new Error("A planilha desta unidade ainda não foi conectada.");
  }

  return {
    fonte: acesso.fonteDadosEstoque,
    unidadeId: acesso.unidadeId,
    userId: acesso.userId,
    spreadsheetId,
  };
}
