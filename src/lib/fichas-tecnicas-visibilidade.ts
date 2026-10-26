import type { FichaTecnica, FichaTecnicaResumo } from "@/lib/types";

/** O que cada nível do Cardápio recebe no navegador (26/10/2026). A tela já escondia; aqui o
 * dado nem sai do servidor. "ver" (padrão da operação): sem custo, sem preço, sem gerencial.
 * "chef": custo e preço do Salão (para o CMV), sem preços de canal nem gerencial. Gestão: tudo.
 * Limite conhecido: a policy de leitura de `fichas_tecnicas` ainda devolve essas colunas a quem
 * consulta a API direto (ver o cabeçalho de 20261026120000_titular_e_chef.sql). */
export type VisaoFicha = "ver" | "chef" | "gestao";

export function visaoDaFicha(podeGerir: boolean, podeEditarFicha: boolean): VisaoFicha {
  return podeGerir ? "gestao" : podeEditarFicha ? "chef" : "ver";
}

const SEM_CUSTO = { custoTotal: null, custoPorUnidade: null, completo: true };

export function resumoParaVisao<T extends FichaTecnicaResumo>(ficha: T, visao: VisaoFicha): T {
  if (visao === "gestao") return ficha;
  const semCanais = {
    ...ficha,
    precoVendaDeliveryProprio: null,
    precoVendaIfood: null,
    precoVenda99Food: null,
  };
  if (visao === "chef") return semCanais;
  return {
    ...semCanais,
    precoVenda: null,
    precoVendaRascunho: null,
    custo: { ...ficha.custo, ...SEM_CUSTO },
    custoComEmbalagem: null,
  };
}

export function fichaParaVisao(ficha: FichaTecnica, visao: VisaoFicha): FichaTecnica {
  if (visao === "gestao") return ficha;
  const base = { ...resumoParaVisao(ficha, visao), observacoesGerenciais: "" };
  if (visao === "chef") return base;
  return {
    ...base,
    componentes: ficha.componentes.map((c) => ({ ...c, custo: undefined })),
    componentesDelivery: ficha.componentesDelivery.map((c) => ({ ...c, custo: undefined })),
  };
}
