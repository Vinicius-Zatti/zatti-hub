"use client";

import { useSearchParams } from "next/navigation";
import { SubTabs } from "@/components/sub-tabs";

// As 3 abas de Pedidos operam sobre a MESMA contagem base (`?data=`) - é a
// chave que decide qual Pedido salvo cada tela lê/escreve. Sem isso, trocar
// de aba depois de salvar em Criar Cotação largava o `data` pelo caminho:
// Editor de Espelhos abria sem query param, caía na contagem mais recente
// (padrão de `gerarPedido`) e recalculava do zero em vez de mostrar o que
// acabou de ser salvo - parecendo que "não salvou" quando na verdade salvou
// certo, só que pra outra data. Pedidos Feitos entrou nessa lista junto -
// se a data propagada não tiver pedido confirmado nenhum, a página cai
// sozinha na mais recente que tiver (não quebra, só ignora o parâmetro).
const HREFS_COM_CONTAGEM_BASE = new Set([
  "/estoque/pedidos",
  "/estoque/pedidos/cotacoes",
  "/estoque/pedidos/feitos",
]);

export function PedidosSubTabs({ items }: { items: { label: string; href: string }[] }) {
  const searchParams = useSearchParams();
  const data = searchParams.get("data");

  const itemsComData = data
    ? items.map((item) =>
        HREFS_COM_CONTAGEM_BASE.has(item.href)
          ? { ...item, href: `${item.href}?data=${encodeURIComponent(data)}` }
          : item
      )
    : items;

  return <SubTabs items={itemsComData} />;
}
