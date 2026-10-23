import { listProdutos } from "@/lib/sheets/produtos";
import { listItensPendentes } from "@/lib/sheets/inventario";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { EdicaoGrid } from "@/components/edicao-grid";
import { AreaRestrita } from "@/components/area-restrita";
import { getAcessoAtual } from "@/lib/acesso";
import { dadosPrePreparoDaGrade } from "@/lib/banco/pre-preparo";

export const dynamic = "force-dynamic";

export default async function EdicaoDadosPage() {
  const acesso = await getAcessoAtual();
  if (acesso.role === "operacional") return <AreaRestrita />;
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const produtosCadastro = await listProdutos(acesso.spreadsheetId);
  const [pendentes, fornecedores, prePreparo] = await Promise.all([
    listItensPendentes(acesso.spreadsheetId),
    listFornecedores(acesso.spreadsheetId),
    acesso.fichasTecnicasHabilitado ? dadosPrePreparoDaGrade(acesso.unidadeId) : Promise.resolve(null),
  ]);
  // Piloto do pré-preparo com ficha: a chave vai em todas as linhas (marcada
  // ou não) só na unidade habilitada; nas outras o produto segue sem o campo.
  const produtos = prePreparo
    ? produtosCadastro.map((p) => ({ ...p, prePreparo: prePreparo.marcados.has(p.sku) }))
    : produtosCadastro;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Edição de Dados</h1>
        <p className="text-sm text-cinza-medio">
          O cadastro inteiro, como na planilha. Células destacadas estão vazias ou incompletas —
          edita direto aqui e salva linha por linha ou tudo de uma vez.
        </p>
      </div>
      <EdicaoGrid
        produtos={produtos}
        pendentes={pendentes}
        fornecedores={fornecedores}
        mostrarRevenda={acesso.fichasTecnicasHabilitado}
        mostrarPrePreparo={prePreparo !== null}
        skusPrecoDaFicha={prePreparo?.skusPrecoDaFicha ?? []}
      />
    </div>
  );
}
