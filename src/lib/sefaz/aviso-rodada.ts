import type { RodadaResumo } from "./painel";

// Decisão de Vinícius (04/11/2026): recusa da SEFAZ por consulta recente não é falha. É espera, as notas
// continuam na fila e o robô tenta de novo sozinho. O registro no banco segue "erro" porque é ele que
// libera a nova tentativa; só muda o que a equipe lê. "Provavelmente": a SEFAZ não diz quem consultou.
const CODIGOS_DE_ESPERA = new Set(["sefaz_656_consumo_indevido", "sefaz_evento_lote_656"]);

export const AVISO_ESPERA_SEFAZ =
  "a SEFAZ pediu para esperar, provavelmente alguém buscou notas deste CNPJ mais cedo. Vamos tentar de novo mais tarde, as notas continuam na fila";

export function textoUltimaBusca(r: RodadaResumo): string {
  if (r.situacao === "ok") return `${r.notasNovas} nota(s) nova(s)${r.filaZerou ? "" : ", fila continua na próxima busca"}`;
  if (r.erroCodigo && CODIGOS_DE_ESPERA.has(r.erroCodigo)) return AVISO_ESPERA_SEFAZ;
  return `falhou (${r.erroCodigo ?? "erro"})`;
}
