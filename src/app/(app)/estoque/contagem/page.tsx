import { listProdutos } from "@/lib/sheets/produtos";
import { ContagemForm } from "@/components/contagem-form";
import { getAcessoAtual, redirecionarSemEdicao } from "@/lib/acesso";
import {
  listarAndamentoBanco,
  listarModalidadesBanco,
  listarSetoresBanco,
} from "@/lib/banco/setores";
import { contagemPorSetorVale } from "@/lib/contagem/ativacao";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";

export const dynamic = "force-dynamic";

export default async function ContagemPage() {
  const acesso = await getAcessoAtual();
  redirecionarSemEdicao(acesso, "/estoque/contagem");
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  // Unidade com a chave "Contagem por setor" desligada (ou ainda na planilha)
  // segue no fluxo antigo, com escopo por grupo de produto, mesmo com setores
  // cadastrados (`contagemPorSetorVale`, 28/10/2026). Vão TODOS os setores, inclusive os
  // desativados: data já aberta precisa deixar o setor dela fechar.
  // Produtos e dados de setor não dependem um do outro: saem juntos.
  const comSetor = contagemPorSetorVale(acesso);
  const [produtos, dadosSetor] = await Promise.all([
    listProdutos(acesso.spreadsheetId),
    comSetor
      ? Promise.all([
          listarSetoresBanco(acesso.unidadeId),
          listarAndamentoBanco(acesso.unidadeId),
          listarModalidadesBanco(acesso.unidadeId),
        ])
      : null,
  ]);
  const [setores, andamentoPorData, modalidadePorData] = dadosSetor ?? [[], new Map(), new Map()];

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
      compacta={usaNavegacaoV2(acesso)}
    />
  );
}
