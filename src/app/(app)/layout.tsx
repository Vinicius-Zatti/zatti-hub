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

  // Rótulo "Desempenho" - módulo tecnicamente continua em /financeiro/consolidado
  // (rota, dados e permissões intactos), só o nome visível no menu mudou.
  // Não confundir com o módulo Financeiro gerencial novo, abaixo.
  const secoesDesempenho: SecaoNavegacao[] = [
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

  const secoesFinanceiroGerencial: SecaoNavegacao[] = [
    {
      label: "Caixa",
      items: [{ label: "Contas financeiras", href: "/financeiro-gerencial/contas" }],
    },
    {
      label: "Lançamentos",
      items: [
        { label: "Receitas", href: "/financeiro-gerencial/lancamentos/receitas" },
        { label: "Despesas", href: "/financeiro-gerencial/lancamentos/despesas" },
      ],
    },
    {
      label: "DRE",
      items: [{ label: "DRE", href: "/financeiro-gerencial/dre" }],
    },
    ...(podeGerir
      ? [
          {
            label: "Configurações",
            items: [{ label: "Categorias", href: "/financeiro-gerencial/categorias" }],
          },
        ]
      : []),
  ];

  const secoesFichasTecnicas: SecaoNavegacao[] = [
    {
      label: "Fichas técnicas",
      items: [
        { label: "Consultar fichas", href: "/fichas-tecnicas" },
        ...(podeGerir
          ? [
              { label: "Categorias", href: "/fichas-tecnicas/categorias" },
              { label: "Conversões de unidade", href: "/fichas-tecnicas/conversoes" },
              { label: "Margem Ideal", href: "/fichas-tecnicas/calculadora" },
              { label: "Precificação", href: "/fichas-tecnicas/precificacao" },
            ]
          : []),
      ],
    },
  ];

  // Cada módulo só sai de "em breve" pra unidade com a flag ligada
  // (`unidades.consolidado_vendas_habilitado`/`financeiro_gerencial_habilitado`,
  // configurável por cliente).
  const itensNavegacao: ItemNavegacao[] = [
    {
      label: "Painel geral",
      href: "/painel",
      icone: "painel",
      activePrefix: "/painel",
      disabled: false,
    },
    {
      label: "Estoque",
      href: "/estoque/produtos",
      icone: "estoque",
      activePrefix: "/estoque",
      disabled: false,
      sections: secoesEstoque,
    },
    {
      label: "Desempenho",
      href: "/financeiro/consolidado/novo",
      icone: "financeiro",
      activePrefix: "/financeiro",
      disabled: !acesso.consolidadoVendasHabilitado,
      sections: secoesDesempenho,
    },
    {
      label: "Financeiro",
      // Contas financeiras é só Gestão/master (`requireGestaoFinanceiroGerencial`)
      // - Operacional que clicar no item do menu precisa cair numa tela que
      // ele realmente acessa, não ser redirecionado pra fora do módulo.
      href: podeGerir ? "/financeiro-gerencial/contas" : "/financeiro-gerencial/lancamentos/despesas",
      icone: "financeiroGerencial",
      activePrefix: "/financeiro-gerencial",
      disabled: !acesso.financeiroGerencialHabilitado,
      sections: secoesFinanceiroGerencial,
    },
    {
      label: "Precificação",
      href: "/fichas-tecnicas",
      icone: "fichas",
      activePrefix: "/fichas-tecnicas",
      disabled: !acesso.fichasTecnicasHabilitado,
      sections: secoesFichasTecnicas,
    },
    { label: "Tarefas", href: "#", icone: "tarefas", disabled: true },
    { label: "Marketing", href: "#", icone: "marketing", disabled: true },
    // Esconder os itens abaixo pra quem não é master é só UX - a barreira de
    // verdade é `requireMaster()`/`requireMeuTempo()` no layout de cada
    // módulo e em cada Server Action, não isto aqui.
    ...(acesso.role === "master"
      ? [
          {
            label: "Meu Tempo",
            href: "/meu-tempo/hoje",
            icone: "meuTempo" as const,
            activePrefix: "/meu-tempo",
            disabled: false,
          },
          {
            label: "Acessos",
            href: "/acessos",
            icone: "acessos" as const,
            activePrefix: "/acessos",
            disabled: false,
          },
        ]
      : []),
  ];

  return (
    <GuardaContagemProvider>
      <GuardaEdicaoProvider>
        <EstruturaAplicativo
          items={itensNavegacao}
          organizacaoAtual={acesso.organizacaoId}
          organizacaoNome={acesso.organizacaoNome}
          organizacoes={acesso.organizacoesDisponiveis}
          usuarioEmail={acesso.usuarioEmail}
          usuarioNome={acesso.usuarioNome}
        >
          {children}
        </EstruturaAplicativo>
      </GuardaEdicaoProvider>
    </GuardaContagemProvider>
  );
}
