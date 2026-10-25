import type { NomeIconeNavegacao } from "@/components/icones-navegacao";
import type { AcaoRapida } from "./acoes";
import { normalizarBusca } from "./filtro";
import type { ItemNavegacao } from "./tipos";

// Busca global do piloto (Navegação V2, fase 3, 24/10/2026): "Buscar menus e
// atalhos", aberta por Ctrl+K ou "/" no desktop e pela lupa no celular. Os
// resultados são as telas do menu já montado para a pessoa (papel e flags) e
// os atalhos de ação que ela pode usar (`acoesDisponiveis`). Função pura:
// o componente só mostra.

export type EntradaBusca = {
  tipo: "acao" | "menu";
  titulo: string;
  /** De onde vem: "Estoque > Contagem" (menu) ou o módulo (atalho). */
  caminho: string;
  descricao?: string;
  href: string;
  icone: NomeIconeNavegacao;
  /** Texto já normalizado em que a busca procura (título, caminho e sinônimos; a descrição não entra). */
  textoBusca: string;
  tituloBusca: string;
};

function entrada(dados: Omit<EntradaBusca, "textoBusca" | "tituloBusca">, sinonimos: string[] = []): EntradaBusca {
  return {
    ...dados,
    tituloBusca: normalizarBusca(dados.titulo),
    // A descrição fica fora: "a partir da contagem" fazia "conta" achar a cotação.
    textoBusca: normalizarBusca([dados.titulo, dados.caminho, ...sinonimos].join(" ")),
  };
}

/** Tudo que a busca pode achar. Atalho vem antes da tela de mesmo destino,
 * que então sai (o "Criar cotação" do menu e o atalho são a mesma coisa). */
export function montarEntradasBusca(menu: ItemNavegacao[], acoes: AcaoRapida[]): EntradaBusca[] {
  const lista: EntradaBusca[] = acoes.map((acao) =>
    entrada(
      {
        tipo: "acao",
        titulo: acao.titulo,
        caminho: acao.modulo,
        descricao: acao.descricao,
        href: acao.href,
        icone: acao.icone,
      },
      acao.sinonimos,
    ),
  );
  const vistos = new Set(lista.map((item) => item.href));
  const adicionar = (item: EntradaBusca) => {
    if (vistos.has(item.href)) return;
    vistos.add(item.href);
    lista.push(item);
  };

  for (const modulo of menu) {
    if (modulo.disabled) continue;
    if (!modulo.sections) {
      adicionar(entrada({ tipo: "menu", titulo: modulo.label, caminho: "", href: modulo.href, icone: modulo.icone }));
      continue;
    }
    for (const secao of modulo.sections) {
      for (const sub of secao.items) {
        // Seção com o mesmo nome da tela (ex.: Produtos > Produtos) não se repete no caminho.
        const caminho = secao.label === sub.label || secao.label === modulo.label
          ? modulo.label
          : `${modulo.label} > ${secao.label}`;
        adicionar(entrada({ tipo: "menu", titulo: sub.label, caminho, href: sub.href, icone: modulo.icone }));
      }
    }
  }
  return lista;
}

/** Pontos de uma entrada para o termo; null = não casa. Toda palavra digitada
 * precisa aparecer em algum lugar (título, caminho ou sinônimo); o título pesa
 * mais que o caminho, o começo de palavra mais que o meio, e o atalho ganha o
 * desempate da tela com a mesma pontuação. */
export function pontuar(item: EntradaBusca, termoNormalizado: string): number | null {
  const palavras = termoNormalizado.split(" ").filter(Boolean);
  if (palavras.length === 0) return 0;
  if (!palavras.every((palavra) => item.textoBusca.includes(palavra))) return null;

  const titulo = item.tituloBusca;
  const palavrasTitulo = titulo.split(" ");
  let pontos = 0;
  if (titulo === termoNormalizado) pontos += 1000;
  else if (titulo.startsWith(termoNormalizado)) pontos += 500;
  for (const palavra of palavras) {
    if (palavrasTitulo.some((p) => p.startsWith(palavra))) pontos += 40;
    else if (titulo.includes(palavra)) pontos += 20;
    else pontos += 5;
  }
  if (item.tipo === "acao") pontos += 3;
  return pontos;
}

/** Sem termo: só os atalhos, na ordem do catálogo (sugestões). Com termo:
 * o que casa, do mais para o menos relevante. */
export function buscarEntradas(entradas: EntradaBusca[], termo: string, limite = 20): EntradaBusca[] {
  const termoNormalizado = normalizarBusca(termo);
  if (!termoNormalizado) return entradas.filter((item) => item.tipo === "acao").slice(0, limite);
  return entradas
    .map((item, ordem) => ({ item, ordem, pontos: pontuar(item, termoNormalizado) }))
    .filter((r): r is { item: EntradaBusca; ordem: number; pontos: number } => r.pontos !== null)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, limite)
    .map((r) => r.item);
}

/** Atalho de teclado que abre a busca: Ctrl+K (Cmd+K no Mac) em qualquer
 * lugar; "/" só fora de campo de digitação (lá o "/" é texto). */
export function teclaAbreBusca(evento: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  emCampoDeTexto: boolean;
}): boolean {
  if (evento.altKey) return false;
  if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === "k") return true;
  return evento.key === "/" && !evento.ctrlKey && !evento.metaKey && !evento.emCampoDeTexto;
}
