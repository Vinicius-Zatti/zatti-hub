import {
  EstruturaAplicativo,
  type ItemNavegacao,
  type SecaoNavegacao,
} from "@/components/estrutura-aplicativo";
import { GuardaContagemProvider } from "@/components/guarda-contagem";
import { GuardaEdicaoProvider } from "@/components/guarda-edicao";
import { getAcessoAtual } from "@/lib/acesso";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getAcessoAtual();
  const podeGerir = acesso.role !== "operacional";

  const secoesEstoque: SecaoNavegacao[] = [
    {
      label: "Produtos",
      items: [
        { label: "Consultar produtos", href: "/estoque/produtos" },
        ...(podeGerir
          ? [{ label: "Editar dados", href: "/estoque/produtos/edicao" }]
          : []),
      ],
    },
    {
      label: "Contagem",
      items: [
        { label: "Fazer contagem", href: "/estoque/contagem" },
        { label: "Conferir contagens", href: "/estoque/contagem/visualizacao" },
      ],
    },
    {
      label: "Pedidos",
      items: [
        ...(podeGerir
          ? [
              { label: "Criar cotação", href: "/estoque/pedidos" },
              { label: "Editor de espelhos", href: "/estoque/pedidos/cotacoes" },
            ]
          : []),
        { label: "Pedidos feitos", href: "/estoque/pedidos/feitos" },
      ],
    },
    ...(podeGerir
      ? [
          {
            label: "Fornecedores",
            items: [
              { label: "Consultar fornecedores", href: "/estoque/fornecedores" },
              { label: "Editar dados", href: "/estoque/fornecedores/edicao" },
            ],
          },
          {
            label: "CMV Real",
            items: [{ label: "Consultar CMV", href: "/estoque/cmv" }],
          },
        ]
      : []),
  ];

  const secoesFinanceiro: SecaoNavegacao[] = [
    {
      label: "Consolidado de vendas",
      items: [
        { label: "Novo lançamento", href: "/financeiro/consolidado/novo" },
        { label: "Histórico", href: "/financeiro/consolidado" },
        ...(podeGerir
          ? [{ label: "Dashboard", href: "/financeiro/consolidado/dashboard" }]
          : []),
      ],
    },
  ];

  // Financeiro só sai de "em breve" pra unidade com a flag ligada
  // (`unidades.consolidado_vendas_habilitado`, configurável por cliente).
  const itensNavegacao: ItemNavegacao[] = [
    {
      label: "Estoque",
      href: "/estoque/produtos",
      icone: "estoque",
      activePrefix: "/estoque",
      disabled: false,
      sections: secoesEstoque,
    },
    {
      label: "Financeiro",
      href: "/financeiro/consolidado/novo",
      icone: "financeiro",
      activePrefix: "/financeiro",
      disabled: !acesso.consolidadoVendasHabilitado,
      sections: secoesFinanceiro,
    },
    { label: "Fichas Técnicas", href: "#", icone: "fichas", disabled: true },
    { label: "Tarefas", href: "#", icone: "tarefas", disabled: true },
    { label: "Marketing", href: "#", icone: "marketing", disabled: true },
  ];

  return (
    <GuardaContagemProvider>
      <GuardaEdicaoProvider>
        <EstruturaAplicativo
          items={itensNavegacao}
          organizacaoAtual={acesso.organizacaoId}
          organizacaoNome={acesso.organizacaoNome}
          organizacoes={acesso.organizacoesDisponiveis}
        >
          {children}
        </EstruturaAplicativo>
      </GuardaEdicaoProvider>
    </GuardaContagemProvider>
  );
}
