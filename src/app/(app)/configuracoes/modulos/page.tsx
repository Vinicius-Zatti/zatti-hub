import { PainelModulos } from "@/components/configuracoes/painel-modulos";
import { estadoDosModulos } from "@/lib/configuracoes/modulos";
import { requireConfiguracoes } from "../acesso";
import { carregarFlagsModulos } from "../dados";

export const dynamic = "force-dynamic";

/** Configurações > Módulos: todos os módulos com o estado na unidade e o que
 * cada um faz. Master liga e desliga (com confirmação antes de desligar); o
 * dono só vê, menos a Contagem por setor, que o dono e a gestão também trocam
 * (28/10/2026). A barreira de escrita é a action (e o banco, na contagem). */
export default async function ConfiguracoesModulosPage() {
  const acesso = await requireConfiguracoes();
  const ehMaster = acesso.role === "master";
  const modulos = estadoDosModulos(await carregarFlagsModulos(acesso), ehMaster, acesso.role === "gestao");
  return <PainelModulos modulos={modulos} ehMaster={ehMaster} unidadeNome={acesso.unidadeNome} />;
}
