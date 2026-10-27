import { garantirCodigos } from "@/lib/sheets/fornecedores";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { EdicaoFornecedoresGrid } from "@/components/edicao-fornecedores-grid";
import { getAcessoAtual, redirecionarSemEdicao } from "@/lib/acesso";

export const dynamic = "force-dynamic";

export default async function EdicaoFornecedoresPage() {
  const acesso = await getAcessoAtual();
  redirecionarSemEdicao(acesso, "/estoque/fornecedores/edicao");
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const fornecedores = await garantirCodigos(acesso.spreadsheetId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Edição de Dados</h1>
        <p className="text-sm text-cinza-medio">
          O cadastro inteiro de fornecedores, como na planilha. Células destacadas estão vazias -
          edita direto aqui e salva linha por linha ou tudo de uma vez.
        </p>
        {/* Vídeo desta tela (27/10/2026), mesmo link discreto da Contagem. */}
        <div className="-ml-2">
          <LinkVideoAjuda id="estoque-editar-fornecedores" pergunta="Como editar os fornecedores?" />
        </div>
      </div>
      <EdicaoFornecedoresGrid fornecedores={fornecedores} />
    </div>
  );
}
