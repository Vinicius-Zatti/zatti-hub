import { listProdutos } from "@/lib/sheets/produtos";
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
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const produtos = await listProdutos(acesso.spreadsheetId);

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
      userId={acesso.userId}
      unidadeId={acesso.unidadeId}
      unidadeNome={
        // "The House Food & Fun Belo Horizonte"; quando unidade e organização
        // têm o mesmo nome (Dom Quixote), não repete.
        acesso.organizacaoNome === acesso.unidadeNome
          ? acesso.unidadeNome
          : `${acesso.organizacaoNome} ${acesso.unidadeNome}`
      }
      produtos={produtos}
      setores={setores}
      andamentoPorData={andamentoPorData}
      modalidadePorData={modalidadePorData}
    />
  );
}
