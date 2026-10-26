import { redirect } from "next/navigation";
import { getAcessoAtual, type AcessoAtual } from "@/lib/acesso";
import { podeVerConfiguracoes } from "@/lib/navegacao/menu-restaurante";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";

/** Barreira de Configurações (Navegação V2, 24/10/2026): só no piloto e só
 * master, o dono (titular; sem titular marcado, gestão da organização inteira)
 * ou a gestão que recebeu "ver". Os outros voltam ao Início. Chamada no layout e
 * em cada página; a action de módulos ainda exige `requireMaster()`. */
export async function requireConfiguracoes(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (!usaNavegacaoV2(acesso) || !podeVerConfiguracoes(acesso)) redirect("/painel");
  if (acesso.permissoes.configuracoes === "sem_acesso") redirect("/painel");
  return acesso;
}
