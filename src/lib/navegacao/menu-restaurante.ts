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
  /** Configurações do piloto: master ou dono (gestão da organização inteira,
   * vínculo sem unidade fixa). Ausente = não vê. */
  podeConfigurar?: boolean;
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

// ---------------------------------------------------------------------------
// Menu do piloto da Navegação V2 (estrutura de módulos, 24/10/2026)
// ---------------------------------------------------------------------------

/** Rótulo provisório do módulo de fichas técnicas no piloto: Vinícius ainda
 * escolhe o nome final. Trocar aqui troca no menu, nas abas e na barra. */
export const ROTULO_CARDAPIO = "Cardápio";
/** "Desempenho" vira "Vendas" no piloto (mesma rota /financeiro/consolidado). */
export const ROTULO_VENDAS = "Vendas";

/** Páginas de entrada novas do piloto. Só aparecem para quem tem ao menos uma
 * tela de dentro delas no menu; fora do piloto redirecionam para a rota antiga. */
export const ENTRADA_ESTOQUE = "/estoque/visao-geral";
export const ENTRADA_RELATORIOS = "/relatorios";
export const ENTRADA_CADASTROS = "/cadastros";
/** Dashboard por área do piloto (fase 3): aba do Início, só gestão/master. */
export const ENTRADA_DASHBOARD = "/painel/dashboard";
export const ENTRADA_CONFIGURACOES = "/configuracoes";
export const CONFIGURACOES_MODULOS = "/configuracoes/modulos";

/** Relatórios que saem do Financeiro e vão para o módulo Relatórios. */
export const RELATORIOS_FINANCEIRO: readonly { label: string; href: string }[] = [
  { label: "Painel M.E.G.A.", href: "/financeiro-gerencial/painel-mega" },
  { label: "DRE", href: "/financeiro-gerencial/dre" },
  { label: "Fluxo de Caixa", href: "/financeiro-gerencial/fluxo-caixa" },
  { label: "DFC", href: "/financeiro-gerencial/dfc" },
];

const CADASTROS_DO_FINANCEIRO = new Set(["/financeiro-gerencial/contas", "/financeiro-gerencial/categorias"]);

// Ordem pelo uso real dos clientes (Vinícius, 24/10/2026): Visão geral |
// Produtos | Contagem | Pedidos | CMV Real | Perdas | Movimentações. A mesma
// ordem vale na sanfona, no filtro do menu e nas abas de dois níveis.
function secoesEstoquePiloto({ podeGerir }: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
    { label: "Visão geral", items: [{ label: "Visão geral", href: ENTRADA_ESTOQUE }] },
    { label: "Produtos", items: [{ label: "Produtos", href: "/estoque/produtos" }] },
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
    ...(podeGerir ? [{ label: "CMV Real", items: [{ label: "CMV Real", href: "/estoque/cmv" }] }] : []),
    // Já abertas a todos os papéis pelas abas atuais da Contagem (getAcessoAtual).
    { label: "Perdas", items: [{ label: "Perdas", href: "/estoque/contagem/perdas" }] },
    { label: "Movimentações", items: [{ label: "Movimentações", href: "/estoque/contagem/movimentacoes" }] },
  ];
}

/** Mesmo Financeiro de hoje, menos os relatórios (vão para Relatórios) e menos
 * Contas financeiras e Plano de Contas (vão para Cadastros). */
function secoesFinanceiroPiloto(ctx: ContextoMenuRestaurante): SecaoNavegacao[] {
  return secoesFinanceiroGerencial(ctx)
    .filter((secao) => secao.label !== "Relatórios")
    .map((secao) =>
      secao.label === "Configurações"
        ? { label: "Fechamento do mês", items: secao.items.filter((i) => !CADASTROS_DO_FINANCEIRO.has(i.href)) }
        : secao,
    );
}

function secoesCardapioPiloto({ podeGerir }: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
    {
      label: "Fichas técnicas",
      items: [
        { label: "Fichas técnicas", href: "/fichas-tecnicas" },
        ...(podeGerir
          ? [
              { label: "Margem Ideal", href: "/fichas-tecnicas/calculadora" },
              { label: "Precificação", href: "/fichas-tecnicas/precificacao" },
            ]
          : []),
      ],
    },
  ];
}

function secoesGarantePiloto({ podeGerir }: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
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
  ];
}

/** Cadastros: o que se cadastra uma vez e se consulta. Só gestão/master, como
 * hoje; cada grupo segue a flag do módulo de origem. */
function secoesCadastrosPiloto(ctx: ContextoMenuRestaurante): SecaoNavegacao[] {
  if (!ctx.podeGerir) return [];
  return [
    { label: "Todos os cadastros", items: [{ label: "Todos os cadastros", href: ENTRADA_CADASTROS }] },
    { label: "Produtos", items: [{ label: "Editar produtos", href: "/estoque/produtos/edicao" }] },
    { label: "Setores", items: [{ label: "Setores", href: "/estoque/setores" }] },
    {
      label: "Fornecedores",
      items: [
        { label: "Consultar fornecedores", href: "/estoque/fornecedores" },
        { label: "Editar fornecedores", href: "/estoque/fornecedores/edicao" },
      ],
    },
    ...(ctx.fichasTecnicasHabilitado
      ? [
          {
            label: "Fichas técnicas",
            items: [
              { label: "Categorias de fichas", href: "/fichas-tecnicas/categorias" },
              { label: "Conversões de unidade", href: "/fichas-tecnicas/conversoes" },
            ],
          },
        ]
      : []),
    ...(ctx.financeiroGerencialHabilitado
      ? [
          {
            label: "Financeiro",
            items: [
              { label: "Contas financeiras", href: "/financeiro-gerencial/contas" },
              { label: "Plano de Contas", href: "/financeiro-gerencial/categorias" },
            ],
          },
        ]
      : []),
  ];
}

/** Painel de vendas = Dashboard do consolidado: só gestão/master com a flag. */
export function temPainelVendas(ctx: ContextoMenuRestaurante): boolean {
  return ctx.podeGerir && ctx.consolidadoVendasHabilitado;
}

/** Relatórios: a página de catálogo (que agrupa Financeiro, Estoque, Garante e
 * Vendas, cada relatório na rota de sempre) e os do Financeiro, com a flag. O
 * Estoque sempre tem relatório para todos os papéis (Contagens), então o
 * módulo aparece para todo mundo; o catálogo mostra só o que a pessoa abre. */
function secoesRelatoriosPiloto(ctx: ContextoMenuRestaurante): SecaoNavegacao[] {
  return [
    {
      label: "Relatórios",
      items: [
        { label: "Todos os relatórios", href: ENTRADA_RELATORIOS },
        ...(ctx.financeiroGerencialHabilitado ? RELATORIOS_FINANCEIRO.map((r) => ({ ...r })) : []),
      ],
    },
  ];
}

/** Configurações: dados da unidade e módulos contratados. Só master e dono;
 * ligar ou desligar módulo é só master (`requireMaster` na action). */
function secoesConfiguracoesPiloto(ctx: ContextoMenuRestaurante): SecaoNavegacao[] {
  if (!ctx.podeConfigurar) return [];
  return [
    { label: "Unidade", items: [{ label: "Unidade", href: ENTRADA_CONFIGURACOES }] },
    { label: "Módulos", items: [{ label: "Módulos", href: CONFIGURACOES_MODULOS }] },
  ];
}

/**
 * Menu do piloto da Navegação V2 (módulos aprovados por Vinícius em 24/10/2026):
 * Início, Estoque, Vendas, Financeiro, Cardápio, Garante, Equipe, Relatórios,
 * Cadastros e Configurações. Mesmos papéis e flags do menu atual. Destinos novos: só as três
 * páginas de entrada (Estoque, Relatórios, Cadastros) e Movimentações e Perdas,
 * que já abriam pelas abas da Contagem. Nenhuma rota, permissão ou flag muda.
 * As abas de cada módulo saem daqui (`lib/navegacao/abas.ts`).
 */
export function montarMenuRestaurantePiloto(ctx: ContextoMenuRestaurante): ItemNavegacao[] {
  const cadastros = secoesCadastrosPiloto(ctx);
  const relatorios = secoesRelatoriosPiloto(ctx);
  const configuracoes = secoesConfiguracoesPiloto(ctx);
  return [
    // Início com atalhos por operação (fase 3, 24/10/2026) em /painel. Na
    // sanfona é link direto para todos; a gestão ganha a aba Dashboard só no
    // cabeçalho do módulo (`linkDireto`).
    {
      label: "Início",
      href: "/painel",
      icone: "painel",
      activePrefix: "/painel",
      disabled: false,
      linkDireto: true,
      ...(ctx.podeGerir
        ? {
            sections: [
              {
                label: "Início",
                items: [
                  { label: "Início", href: "/painel" },
                  { label: "Dashboard", href: ENTRADA_DASHBOARD },
                ],
              },
            ],
          }
        : {}),
    },
    {
      label: "Estoque",
      href: ENTRADA_ESTOQUE,
      icone: "estoque",
      activePrefix: "/estoque",
      disabled: false,
      sections: secoesEstoquePiloto(ctx),
    },
    {
      label: ROTULO_VENDAS,
      href: "/financeiro/consolidado/novo",
      icone: "financeiro",
      activePrefix: "/financeiro",
      disabled: !ctx.consolidadoVendasHabilitado,
      sections: secoesDesempenho(ctx),
    },
    {
      label: "Financeiro",
      href: "/financeiro-gerencial/visao-geral",
      icone: "financeiroGerencial",
      activePrefix: "/financeiro-gerencial",
      disabled: !ctx.financeiroGerencialHabilitado,
      sections: secoesFinanceiroPiloto(ctx),
    },
    {
      label: ROTULO_CARDAPIO,
      href: "/fichas-tecnicas",
      icone: "fichas",
      activePrefix: "/fichas-tecnicas",
      disabled: !ctx.fichasTecnicasHabilitado,
      sections: secoesCardapioPiloto(ctx),
    },
    {
      label: "Garante",
      href: "/garante",
      icone: "tarefas",
      activePrefix: "/garante",
      disabled: !ctx.garanteHabilitado,
      sections: secoesGarantePiloto(ctx),
    },
    // Equipe: mesma regra de hoje (gestão + flag); a barreira é `requireEquipe()`.
    ...(ctx.podeGerir && ctx.equipeHabilitado
      ? [{ label: "Equipe", href: "/equipe", icone: "acessos" as const, activePrefix: "/equipe", disabled: false }]
      : []),
    ...(relatorios.length > 0
      ? [
          {
            label: "Relatórios",
            href: ENTRADA_RELATORIOS,
            icone: "relatorios" as const,
            activePrefix: ENTRADA_RELATORIOS,
            disabled: false,
            sections: relatorios,
          },
        ]
      : []),
    ...(cadastros.length > 0
      ? [
          {
            label: "Cadastros",
            href: ENTRADA_CADASTROS,
            icone: "cadastros" as const,
            activePrefix: ENTRADA_CADASTROS,
            disabled: false,
            sections: cadastros,
          },
        ]
      : []),
    ...(configuracoes.length > 0
      ? [
          {
            label: "Configurações",
            href: ENTRADA_CONFIGURACOES,
            icone: "configuracoes" as const,
            activePrefix: ENTRADA_CONFIGURACOES,
            disabled: false,
            sections: configuracoes,
          },
        ]
      : []),
  ];
}

/** Contexto do menu a partir do acesso logado (layout e páginas de entrada). */
export function contextoMenuRestaurante(
  acesso: {
    role: string;
    consolidadoVendasHabilitado: boolean;
    financeiroGerencialHabilitado: boolean;
    fichasTecnicasHabilitado: boolean;
    equipeHabilitado: boolean;
    garanteHabilitado: boolean;
    unidadeFixa: string | null;
  },
  conciliacaoHabilitada: boolean,
): ContextoMenuRestaurante {
  return {
    podeGerir: acesso.role !== "operacional",
    consolidadoVendasHabilitado: acesso.consolidadoVendasHabilitado,
    financeiroGerencialHabilitado: acesso.financeiroGerencialHabilitado,
    fichasTecnicasHabilitado: acesso.fichasTecnicasHabilitado,
    equipeHabilitado: acesso.equipeHabilitado,
    garanteHabilitado: acesso.garanteHabilitado,
    conciliacaoHabilitada,
    podeConfigurar: podeVerConfiguracoes(acesso),
  };
}

/** Configurações (piloto): master, ou gestão com vínculo na organização
 * inteira (o dono). Gestor preso a uma unidade e operacional não veem. */
export function podeVerConfiguracoes(acesso: { role: string; unidadeFixa: string | null }): boolean {
  return acesso.role === "master" || (acesso.role === "gestao" && acesso.unidadeFixa === null);
}
