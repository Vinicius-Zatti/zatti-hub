import { redirect } from "next/navigation";
import { BlocosModulo } from "@/components/navegacao-v2/blocos-modulo";
import { getAcessoAtual, requireGestao } from "@/lib/acesso";
import { CATALOGO_CADASTROS, filtrarCatalogo } from "@/lib/navegacao/catalogos";
import { contextoMenuRestaurante, montarMenuRestaurantePiloto } from "@/lib/navegacao/menu-restaurante";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { aplicarPermissoesMenu } from "@/lib/permissoes/menu";

/** Cadastros (Navegação V2, 24/10/2026): página de entrada com um bloco por
 * cadastro que a pessoa já abre hoje pelo menu. Todos os cadastros são de
 * gestão/master (`requireGestao`, como em cada tela); cada um segue a flag do
 * módulo de origem. Fora do piloto volta para a entrada atual do Estoque. */
export default async function CadastrosPage() {
  if (!usaNavegacaoV2(await getAcessoAtual())) redirect("/estoque/produtos");
  const acesso = await requireGestao();
  const menu = aplicarPermissoesMenu(montarMenuRestaurantePiloto(contextoMenuRestaurante(acesso, false)), acesso.permissoes);
  const cadastros = filtrarCatalogo(CATALOGO_CADASTROS, menu);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Cadastros</h1>
      <BlocosModulo blocos={cadastros} rotulo="Cadastros disponíveis" />
    </div>
  );
}
