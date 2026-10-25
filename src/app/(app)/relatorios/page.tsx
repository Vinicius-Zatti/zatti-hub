import { redirect } from "next/navigation";
import { CatalogoRelatorios } from "@/components/navegacao-v2/catalogo-relatorios";
import { getAcessoAtual } from "@/lib/acesso";
import { CATALOGO_RELATORIOS, filtrarCatalogo } from "@/lib/navegacao/catalogos";
import { contextoMenuRestaurante, montarMenuRestaurantePiloto } from "@/lib/navegacao/menu-restaurante";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { aplicarPermissoesMenu } from "@/lib/permissoes/menu";

/** Relatórios (Navegação V2, 24/10/2026): catálogo agrupado por área
 * (Financeiro, Estoque, Garante, Vendas) com busca pelo nome. Só entra o que a
 * pessoa já abre hoje pelo menu (papel e flags) e, em Perdas e Movimentações,
 * com o extrato do estoque ligado. Cada relatório continua na rota e com a
 * barreira de sempre. Fora do piloto, ou sem nenhum relatório, volta ao Painel. */
export default async function RelatoriosPage() {
  const acesso = await getAcessoAtual();
  if (!usaNavegacaoV2(acesso)) redirect("/painel");
  // Conciliação não muda nenhum relatório: o catálogo não precisa ler a flag dela.
  const menu = aplicarPermissoesMenu(montarMenuRestaurantePiloto(contextoMenuRestaurante(acesso, false)), acesso.permissoes);
  const relatorios = filtrarCatalogo(CATALOGO_RELATORIOS, menu, {
    extratoEstoqueHabilitado: acesso.extratoEstoqueHabilitado,
  });
  if (relatorios.length === 0) redirect("/painel");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Relatórios</h1>
      <CatalogoRelatorios relatorios={relatorios} />
    </div>
  );
}
