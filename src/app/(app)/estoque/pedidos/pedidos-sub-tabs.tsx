"use client";

import { useSearchParams } from "next/navigation";
import { SubTabs } from "@/components/sub-tabs";
import { comContagemBase } from "@/lib/navegacao/abas";

// As 3 abas de Pedidos operam sobre a MESMA contagem base (`?data=`) - é a
// chave que decide qual Pedido salvo cada tela lê/escreve. Sem isso, trocar
// de aba depois de salvar em Criar Cotação largava o `data` pelo caminho:
// Editor de Espelhos abria sem query param, caía na contagem mais recente
// (padrão de `gerarPedido`) e recalculava do zero em vez de mostrar o que
// acabou de ser salvo - parecendo que "não salvou" quando na verdade salvou
// certo, só que pra outra data. Pedidos Feitos entrou nessa lista junto -
// se a data propagada não tiver pedido confirmado nenhum, a página cai
// sozinha na mais recente que tiver (não quebra, só ignora o parâmetro).
// A lista de telas mora em `lib/navegacao/abas.ts` desde 24/10/2026, para as
// abas da Navegação V2 (piloto) levarem o mesmo parâmetro.
export function PedidosSubTabs({ items }: { items: { label: string; href: string }[] }) {
  const searchParams = useSearchParams();
  return <SubTabs items={comContagemBase(items, searchParams.get("data"))} />;
}
