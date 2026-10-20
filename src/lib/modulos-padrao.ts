/**
 * Módulos que todo acesso novo recebe, desde 15/10/2026 (decisão de Vinícius: "todos os acessos a
 * partir de hoje têm todos os módulos, só Marketing ainda vai ficar pra em breve"). Vale para a
 * compra automática (`provisionamento`) e para o cadastro manual em /acessos. Unidades que já
 * existiam não mudam: as flags delas continuam sendo ligadas uma a uma.
 *
 * - Estoque e Compras: sempre ligados (não têm flag).
 * - Desempenho: `consolidado_vendas_habilitado`.
 * - Financeiro: `financeiro_gerencial_habilitado` + `financeiro_liberado_equipe` (sem a liberação,
 *   só o titular financeiro enxerga o módulo, e o cliente ficaria sem ele).
 * - Conciliação com leitura de PDF: `conciliacao_habilitada` + `conciliacao_ia_documentos` (Vinícius,
 *   20/10/2026: "todo mundo pode conciliar"). Classificação por IA continua desligada.
 * - Precificação: `fichas_tecnicas_habilitado`.
 * - Checklist Garante: `garante_habilitado`.
 * - Extrato do estoque: só com estoque no banco (a action de /acessos recusa ligar em planilha).
 * - Equipe: flag da organização (`ORGANIZACAO_NOVA`).
 */
export function modulosUnidadeNova(fonteDadosEstoque: "banco" | "planilha") {
  return {
    fonte_dados_estoque: fonteDadosEstoque,
    consolidado_vendas_habilitado: true,
    financeiro_gerencial_habilitado: true,
    financeiro_liberado_equipe: true,
    conciliacao_habilitada: true,
    conciliacao_ia_documentos: true,
    fichas_tecnicas_habilitado: true,
    garante_habilitado: true,
    extrato_estoque_habilitado: fonteDadosEstoque === "banco",
  } as const;
}

/** Flags da organização nova: Equipe ligada (a gestão cadastra a própria equipe). */
export const ORGANIZACAO_NOVA = { equipe_habilitado: true } as const;
