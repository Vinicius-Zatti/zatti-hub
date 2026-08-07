"use client";

import { usePathname } from "next/navigation";

const CAMINHOS: Record<string, string[]> = {
  "/estoque/produtos": ["Estoque", "Produtos", "Consultar produtos"],
  "/estoque/produtos/edicao": ["Estoque", "Produtos", "Editar dados"],
  "/estoque/produtos/novo": ["Estoque", "Produtos", "Novo produto"],
  "/estoque/contagem": ["Estoque", "Contagem", "Fazer contagem"],
  "/estoque/contagem/visualizacao": ["Estoque", "Contagem", "Conferir contagens"],
  "/estoque/pedidos": ["Estoque", "Pedidos", "Criar cotação"],
  "/estoque/pedidos/cotacoes": ["Estoque", "Pedidos", "Editor de espelhos"],
  "/estoque/pedidos/feitos": ["Estoque", "Pedidos", "Pedidos feitos"],
  "/estoque/fornecedores": ["Estoque", "Fornecedores", "Consultar fornecedores"],
  "/estoque/fornecedores/edicao": ["Estoque", "Fornecedores", "Editar dados"],
  "/estoque/fornecedores/novo": ["Estoque", "Fornecedores", "Novo fornecedor"],
  "/estoque/cmv": ["Estoque", "CMV Real"],
};

export function EstoqueBreadcrumb() {
  const pathname = usePathname();
  const caminho = CAMINHOS[pathname] ?? ["Estoque"];

  return (
    <nav aria-label="Caminho atual" className="text-xs text-cinza-medio">
      <ol className="flex flex-wrap items-center gap-1.5">
        {caminho.map((parte, indice) => (
          <li key={`${parte}-${indice}`} className="flex items-center gap-1.5">
            {indice > 0 && <span aria-hidden="true">›</span>}
            <span
              aria-current={indice === caminho.length - 1 ? "page" : undefined}
              className={indice === caminho.length - 1 ? "font-semibold text-azul-petroleo" : ""}
            >
              {parte}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
