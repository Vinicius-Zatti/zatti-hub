import { garantirCodigos } from "@/lib/sheets/fornecedores";
import { ConectarPlanilha } from "@/components/conectar-planilha";
import { EdicaoFornecedoresGrid } from "@/components/edicao-fornecedores-grid";
import { getAcessoAtual } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function EdicaoFornecedoresPage() {
  const acesso = await getAcessoAtual();
  let fornecedores;
  try {
    fornecedores = await garantirCodigos(acesso.spreadsheetId);
  } catch (err) {
    return <ConectarPlanilha erro={(err as Error).message} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Edição de Dados</h1>
        <p className="text-sm text-cinza-medio">
          O cadastro inteiro de fornecedores, como na planilha. Células destacadas estão vazias -
          edita direto aqui e salva linha por linha ou tudo de uma vez.
        </p>
      </div>
      <EdicaoFornecedoresGrid fornecedores={fornecedores} />
    </div>
  );
}
