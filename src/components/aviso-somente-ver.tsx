import type { AcessoAtual } from "@/lib/acesso";
import { nivelPadrao, nomeChave, rank, type ChaveModulo } from "@/lib/permissoes/modulos";

/** Faixa no topo do módulo quando a pessoa só vê porque quem administra a equipe tirou a edição
 * (permissões por módulo, 25/10/2026). Quem só vê pelo próprio papel (ex.: operacional no
 * Cardápio) não vê a faixa: nada mudou para ela. */
export function AvisoSomenteVer({ acesso, modulo }: { acesso: AcessoAtual; modulo: ChaveModulo }) {
  if (acesso.role === "master" || acesso.permissoes[modulo] !== "ver") return null;
  const papel = acesso.role === "gestao" ? "gestao" : "operacional";
  if (rank(nivelPadrao(papel, acesso.ehDono, modulo)) <= rank("ver")) return null;
  return (
    <p className="rounded-md border border-ambar/40 bg-ambar/10 px-3 py-2 text-xs text-azul-noite">
      Seu acesso a {nomeChave(modulo)} é só para ver. Para lançar ou alterar, peça a quem administra a equipe.
    </p>
  );
}
