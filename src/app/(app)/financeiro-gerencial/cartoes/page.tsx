import { requireFinanceiroGerencial } from "@/lib/acesso";
import { listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import { listarFaturas } from "@/lib/banco/financeiro-cartao";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { CartoesFaturas } from "@/components/financeiro-gerencial/cartoes-faturas";

export const dynamic = "force-dynamic";

// Ver fatura e pagar é liberado pro Operacional (igual baixa); alterar vencimento só Gestão/master.
export default async function CartoesPage({ searchParams }: { searchParams: Promise<{ cartao?: string }> }) {
  const acesso = await requireFinanceiroGerencial();
  const busca = await searchParams;
  const contas = await listarContasFinanceiras(acesso.unidadeId);
  const cartoes = contas.filter((c) => c.tipo === "cartao_credito");
  // O id do cartão só vale se for um cartão desta unidade (nunca usado direto do endereço).
  const selecionado =
    cartoes.find((c) => c.id === busca.cartao) ?? cartoes.find((c) => c.ativo) ?? cartoes[0] ?? null;
  const faturas = selecionado ? await listarFaturas(acesso.unidadeId, selecionado.id) : [];

  return (
    <CartoesFaturas
      cartoes={cartoes}
      cartaoId={selecionado?.id ?? null}
      faturas={faturas}
      contasPagadoras={contas.filter((c) => c.tipo !== "cartao_credito" && c.ativo)}
      nomesContas={Object.fromEntries(contas.map((c) => [c.id, c.nome]))}
      hoje={hojeIsoBrasil()}
      podeGestao={acesso.role === "gestao" || acesso.role === "master"}
    />
  );
}
