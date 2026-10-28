// Leitura da Contagem para a sugestão de estoque final da DRE (Financeiro V2, Fase 3, item 2).
// Só lê: mesma carga da Calculadora de CMV (`estoque/cmv/page.tsx`), nada é gravado.
import type { AcessoAtual } from "@/lib/acesso";
import { listarAndamentoBanco, listarModalidadesBanco } from "@/lib/banco/setores";
import { contagemPorSetorVale } from "@/lib/contagem/ativacao";
import { sugestoesEstoqueDoAno, type SugestaoEstoqueContagem } from "@/lib/financeiro-gerencial/sugestao-estoque-contagem";
import { listInventario } from "@/lib/sheets/inventario";

/** `null` = a Contagem não pôde ser lida agora (a DRE abre igual, só sem a
 * sugestão). Nunca derruba a DRE. */
export async function carregarSugestoesEstoqueContagem(
  acesso: Pick<AcessoAtual, "unidadeId" | "spreadsheetId" | "fonteDadosEstoque" | "contagemPorSetorHabilitada">,
  ano: number,
): Promise<(SugestaoEstoqueContagem | null)[] | null> {
  try {
    const itens = await listInventario(acesso.spreadsheetId);
    // Unidade na planilha não tem setor: mapa vazio mantém a regra legada (igual à Calculadora).
    const comSetor = contagemPorSetorVale(acesso);
    const [andamentoPorData, modalidadePorData] = comSetor
      ? await Promise.all([listarAndamentoBanco(acesso.unidadeId), listarModalidadesBanco(acesso.unidadeId)])
      : [new Map(), new Map()];
    return sugestoesEstoqueDoAno({ ano, itens, andamentoPorData, modalidadePorData });
  } catch {
    return null;
  }
}
