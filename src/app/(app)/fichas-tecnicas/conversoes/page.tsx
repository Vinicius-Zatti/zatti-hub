import { requireGestaoFichasTecnicas } from "@/lib/acesso";
import { listarConversoesProduto } from "@/lib/banco/fichas-tecnicas";
import { listarProdutosBanco } from "@/lib/banco/estoque";
import { GRUPOS_FORA_DE_FICHA } from "@/lib/fichas-tecnicas";
import { ConversoesProdutoTabela } from "@/components/conversoes-produto-tabela";

export const dynamic = "force-dynamic";

export default async function ConversoesProdutoPage() {
  const acesso = await requireGestaoFichasTecnicas();
  const [produtos, conversoes] = await Promise.all([
    listarProdutosBanco(acesso.unidadeId),
    listarConversoesProduto(acesso.unidadeId),
  ]);
  const conversaoPorSku = new Map(conversoes.map((c) => [c.produtoSku, c]));
  const linhas = produtos
    .filter((p) => p.ativo && !GRUPOS_FORA_DE_FICHA.has(p.grupo))
    .map((p) => ({
      sku: p.sku,
      nome: p.nome,
      unidadeBase: p.unidadeBase,
      precoUnitario: p.precoUnitario,
      conversao: conversaoPorSku.get(p.sku) ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Conversões de Unidade</h1>
        <p className="text-sm text-cinza-medio">
          Pra quando o produto é usado numa unidade diferente na receita, ou tem perda de preparo (fator
          de correção). Sem conversão cadastrada, a ficha usa a mesma unidade e o mesmo preço do Estoque
          direto.
        </p>
      </div>
      <ConversoesProdutoTabela linhas={linhas} />
    </div>
  );
}
