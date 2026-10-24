import { redirect } from "next/navigation";
import { BlocosModulo } from "@/components/navegacao-v2/blocos-modulo";
import { getAcessoAtual } from "@/lib/acesso";
import { CATALOGO_RELATORIOS, filtrarCatalogo } from "@/lib/navegacao/catalogos";
import { contextoMenuRestaurante, montarMenuRestaurantePiloto } from "@/lib/navegacao/menu-restaurante";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";

/** Relatórios (Navegação V2, 24/10/2026): catálogo com um bloco por relatório
 * que a pessoa já abre hoje pelo menu (papel e flags). Cada relatório continua
 * na rota e com a barreira de sempre. Fora do piloto, ou sem nenhum relatório,
 * volta para o Painel geral. */
export default async function RelatoriosPage() {
  const acesso = await getAcessoAtual();
  if (!usaNavegacaoV2(acesso)) redirect("/painel");
  // Conciliação não muda nenhum relatório: o catálogo não precisa ler a flag dela.
  const menu = montarMenuRestaurantePiloto(contextoMenuRestaurante(acesso, false));
  const relatorios = filtrarCatalogo(CATALOGO_RELATORIOS, menu);
  if (relatorios.length === 0) redirect("/painel");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Relatórios</h1>
      <BlocosModulo blocos={relatorios} rotulo="Relatórios disponíveis" />
    </div>
  );
}
