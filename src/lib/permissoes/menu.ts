import type { ItemNavegacao } from "@/lib/navegacao/tipos";
import { ENTRADA_RELATORIOS } from "@/lib/navegacao/menu-restaurante";
import { rank, type ChaveModulo, type NiveisCompletos } from "./modulos";

// Menu do piloto com as permissões por módulo (fase 6, 25/10/2026). Esconder é só UX: a
// barreira é o banco (exceções em `permissoes_modulo`) e os guardas de rota e de Server Action.
// "Sem acesso" tira o módulo; "ver" tira as telas de trabalho, que só servem para gravar.

/** Telas que só fazem sentido para quem edita o módulo (quem só vê é levado para fora). */
export const TELAS_DE_EDICAO: Readonly<Record<string, ChaveModulo>> = {
  "/financeiro/consolidado/novo": "vendas",
  "/financeiro-gerencial/caixa-entrada": "financeiro",
  "/financeiro-gerencial/conciliacao": "financeiro",
  "/financeiro-gerencial/fechamento": "financeiro",
  "/financeiro-gerencial/provisoes": "financeiro",
  "/financeiro-gerencial/contas": "financeiro",
  "/financeiro-gerencial/categorias": "financeiro",
  "/fichas-tecnicas/categorias": "cardapio",
  "/fichas-tecnicas/conversoes": "cardapio",
  "/fichas-tecnicas/calculadora": "cardapio",
  "/fichas-tecnicas/precificacao": "cardapio",
};

/** Módulo do menu do piloto pelo rótulo (Início não entra: sempre visível). */
const MODULO_DO_ITEM: Readonly<Record<string, ChaveModulo>> = {
  Estoque: "estoque",
  Vendas: "vendas",
  Financeiro: "financeiro",
  Cardápio: "cardapio",
  Garante: "garante",
  Equipe: "equipe",
  Relatórios: "relatorios",
  Cadastros: "cadastros",
  Configurações: "configuracoes",
};

function telaLiberada(href: string, permissoes: NiveisCompletos): boolean {
  const modulo = TELAS_DE_EDICAO[href];
  return !modulo || rank(permissoes[modulo]) >= rank("editar");
}

/** Aplica as permissões ao menu do piloto (e, por consequência, às abas e aos atalhos). */
export function aplicarPermissoesMenu(items: ItemNavegacao[], permissoes: NiveisCompletos): ItemNavegacao[] {
  const saida: ItemNavegacao[] = [];
  for (const item of items) {
    const modulo = MODULO_DO_ITEM[item.label];
    if (modulo && permissoes[modulo] === "sem_acesso") continue;
    if (!item.sections) {
      saida.push(item);
      continue;
    }
    const sections = item.sections
      .map((s) => ({ ...s, items: s.items.filter((i) => telaLiberada(i.href, permissoes)) }))
      .filter((s) => s.items.length > 0);
    // Relatórios só com a página de catálogo não tem relatório nenhum.
    const soCatalogo = item.href === ENTRADA_RELATORIOS && sections.every((s) => s.items.every((i) => i.href === ENTRADA_RELATORIOS));
    if (sections.length === 0 || soCatalogo) continue;
    const primeiro = sections[0].items[0].href;
    const hrefLiberado = telaLiberada(item.href, permissoes) ? item.href : primeiro;
    saida.push({ ...item, href: hrefLiberado, sections });
  }
  return saida;
}

/** Destino da rota de edição quando a pessoa só vê o módulo (ou `null` = pode abrir). */
export function destinoSemEdicao(caminho: string, permissoes: NiveisCompletos): string | null {
  const modulo = TELAS_DE_EDICAO[caminho];
  if (!modulo || rank(permissoes[modulo]) >= rank("editar")) return null;
  if (modulo === "vendas") return "/financeiro/consolidado";
  if (modulo === "cardapio") return "/fichas-tecnicas";
  return "/financeiro-gerencial/visao-geral";
}
