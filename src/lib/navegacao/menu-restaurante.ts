import type { ItemNavegacao, SecaoNavegacao } from "./tipos";

// Menu do restaurante (tudo que não é a área interna do Vinícius). Saiu de
// `app/(app)/layout.tsx` em 24/10/2026 sem mudar nada no menu atual, para o
// menu do piloto da Navegação V2 nascer das mesmas regras e ser testável.
// Esconder item é só UX - a barreira de verdade é `requireGestao()` e afins
// em cada página e Server Action.

export type ContextoMenuRestaurante = {
  /** Gestão ou master (`role !== "operacional"`). */
  podeGerir: boolean;
  consolidadoVendasHabilitado: boolean;
  financeiroGerencialHabilitado: boolean;
  fichasTecnicasHabilitado: boolean;
  equipeHabilitado: boolean;
  garanteHabilitado: boolean;
  conciliacaoHabilitada: boolean;
};

// Rótulo "Desempenho" - módulo tecnicamente continua em /financeiro/consolidado
// (rota, dados e permissões intactos), só o nome visível no menu mudou.
// Não confundir com o módulo Financeiro gerencial novo, abaixo.
function secoesDesempenho({ podeGerir }: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
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
}

// Ordem do dia a dia (pedido de Vinícius em 20/10/2026): painel primeiro, depois o trabalho diário
// (caixa de entrada, conciliação, contas a pagar e receber), relatórios e por último a configuração.
function secoesFinanceiroGerencial({
  podeGerir,
  conciliacaoHabilitada,
}: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
    {
      label: "Dia a dia",
      items: [
        { label: "Painel financeiro", href: "/financeiro-gerencial/visao-geral" },
        { label: "Caixa de Entrada", href: "/financeiro-gerencial/caixa-entrada" },
        ...(conciliacaoHabilitada ? [{ label: "Conciliação", href: "/financeiro-gerencial/conciliacao" }] : []),
        { label: "Contas a pagar e receber", href: "/financeiro-gerencial/contas-pagar-receber" },
        { label: "Cartões", href: "/financeiro-gerencial/cartoes" },
      ],
    },
    {
      label: "Lançamentos",
      items: [
        { label: "Receitas", href: "/financeiro-gerencial/lancamentos/receitas" },
        { label: "Despesas", href: "/financeiro-gerencial/lancamentos/despesas" },
        { label: "Recorrências", href: "/financeiro-gerencial/recorrencias" },
      ],
    },
    {
      label: "Relatórios",
      items: [
        { label: "Painel M.E.G.A.", href: "/financeiro-gerencial/painel-mega" },
        { label: "DRE", href: "/financeiro-gerencial/dre" },
        { label: "Fluxo de Caixa", href: "/financeiro-gerencial/fluxo-caixa" },
        { label: "DFC", href: "/financeiro-gerencial/dfc" },
      ],
    },
    ...(podeGerir
      ? [
          {
            label: "Configurações",
            items: [
              { label: "Fechamento", href: "/financeiro-gerencial/fechamento" },
              { label: "Provisões", href: "/financeiro-gerencial/provisoes" },
              { label: "Contas financeiras", href: "/financeiro-gerencial/contas" },
              { label: "Plano de Contas", href: "/financeiro-gerencial/categorias" },
            ],
          },
        ]
      : []),
  ];
}

function secoesFichasTecnicas({ podeGerir }: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
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
}

// Módulos que ficam iguais nos dois menus (Desempenho em diante).
function modulosComuns(ctx: ContextoMenuRestaurante): ItemNavegacao[] {
  const { podeGerir } = ctx;
  return [
    {
      label: "Desempenho",
      href: "/financeiro/consolidado/novo",
      icone: "financeiro",
      activePrefix: "/financeiro",
      disabled: !ctx.consolidadoVendasHabilitado,
      sections: secoesDesempenho(ctx),
    },
    {
      label: "Financeiro",
      // Painel financeiro abre o módulo para todos os papéis (20/10/2026).
      href: "/financeiro-gerencial/visao-geral",
      icone: "financeiroGerencial",
      activePrefix: "/financeiro-gerencial",
      disabled: !ctx.financeiroGerencialHabilitado,
      sections: secoesFinanceiroGerencial(ctx),
    },
    {
      label: "Precificação",
      href: "/fichas-tecnicas",
      icone: "fichas",
      activePrefix: "/fichas-tecnicas",
      disabled: !ctx.fichasTecnicasHabilitado,
      sections: secoesFichasTecnicas(ctx),
    },
    // Equipe: gestão cadastra a própria equipe (flag por organização). A
    // barreira de verdade é `requireEquipe()` na página e em cada action.
    ...(podeGerir && ctx.equipeHabilitado
      ? [
          {
            label: "Equipe",
            href: "/equipe",
            icone: "acessos" as const,
            activePrefix: "/equipe",
            disabled: false,
          },
        ]
      : []),
    // Checklist Garante: etapa Garante do M.E.G.A. (rotina com dono, prazo e foto).
    // Ocupa o lugar de "Tarefas". Cumprir é de todos; montar e o quadro, só gestão.
    {
      label: "Checklist Garante",
      href: "/garante",
      icone: "tarefas",
      activePrefix: "/garante",
      disabled: !ctx.garanteHabilitado,
      sections: [
        {
          label: "Cumprir",
          items: [
            { label: "Hoje", href: "/garante" },
            { label: "Planos de ação", href: "/garante/planos" },
          ],
        },
        ...(podeGerir
          ? [
              {
                label: "Gestão",
                items: [
                  { label: "Quadro do dia", href: "/garante/quadro" },
                  { label: "Nota", href: "/garante/nota" },
                  { label: "Modelos e publicação", href: "/garante/modelos" },
                ],
              },
            ]
          : []),
      ],
    },
    { label: "Marketing", href: "#", icone: "marketing", disabled: true },
    // Escritório e Acessos saíram daqui em 15/10/2026: ficam só na Zatti HUB
    // (`itensAreaInterna`), escolhida no seletor de organização.
  ];
}

/** Menu atual (painel flutuante), de todas as unidades fora do piloto. */
export function montarMenuRestaurante(ctx: ContextoMenuRestaurante): ItemNavegacao[] {
  const { podeGerir } = ctx;
  const secoesEstoque: SecaoNavegacao[] = [
    {
      label: "Produtos",
      items: [
        { label: "Consultar produtos", href: "/estoque/produtos" },
        ...(podeGerir
          ? [
              { label: "Editar dados", href: "/estoque/produtos/edicao" },
              { label: "Setores", href: "/estoque/setores" },
            ]
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

  // Cada módulo só sai de "em breve" pra unidade com a flag ligada
  // (`unidades.consolidado_vendas_habilitado`/`financeiro_gerencial_habilitado`,
  // configurável por cliente).
  return [
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
    ...modulosComuns(ctx),
  ];
}

/**
 * Menu do piloto da Navegação V2 (fase 1, 24/10/2026): mesmos destinos, mesmos
 * papéis e mesmas flags do menu atual, só agrupados por natureza. Cadastros
 * junta o que se cadastra (produtos, setores, fornecedores) e Estoque fica com
 * a rotina (contagem, pedidos, CMV Real). Nenhuma rota muda.
 */
export function montarMenuRestaurantePiloto(ctx: ContextoMenuRestaurante): ItemNavegacao[] {
  const { podeGerir } = ctx;
  const secoesCadastros: SecaoNavegacao[] = [
    {
      label: "Produtos",
      items: [
        { label: "Consultar produtos", href: "/estoque/produtos" },
        ...(podeGerir ? [{ label: "Editar dados", href: "/estoque/produtos/edicao" }] : []),
      ],
    },
    ...(podeGerir
      ? [
          { label: "Setores", items: [{ label: "Setores", href: "/estoque/setores" }] },
          {
            label: "Fornecedores",
            items: [
              { label: "Consultar fornecedores", href: "/estoque/fornecedores" },
              { label: "Editar dados", href: "/estoque/fornecedores/edicao" },
            ],
          },
        ]
      : []),
  ];

  const secoesEstoque: SecaoNavegacao[] = [
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
      ? [{ label: "CMV Real", items: [{ label: "Consultar CMV", href: "/estoque/cmv" }] }]
      : []),
  ];

  return [
    // Início = o Painel geral de hoje (o Início com atalhos é a fase 3).
    { label: "Início", href: "/painel", icone: "painel", activePrefix: "/painel", disabled: false },
    {
      label: "Cadastros",
      href: "/estoque/produtos",
      icone: "cadastros",
      // Prefixos mais longos que o "/estoque" do Estoque: o menu marca o mais longo.
      activePrefix: ["/estoque/produtos", "/estoque/setores", "/estoque/fornecedores"],
      disabled: false,
      sections: secoesCadastros,
    },
    {
      label: "Estoque",
      href: "/estoque/contagem",
      icone: "estoque",
      activePrefix: "/estoque",
      disabled: false,
      sections: secoesEstoque,
    },
    ...modulosComuns(ctx),
  ];
}
