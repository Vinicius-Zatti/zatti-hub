import {
  EstruturaAplicativo,
  type ItemNavegacao,
  type SecaoNavegacao,
} from "@/components/estrutura-aplicativo";
import { UnidadeSuporteProvider } from "@/components/contexto-suporte";
import { GuardaContagemProvider } from "@/components/guarda-contagem";
import { GuardaEdicaoProvider } from "@/components/guarda-edicao";
import { getAcessoAtual } from "@/lib/acesso";
import { lerFlagsConciliacao } from "@/lib/banco/conciliacao";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CABECALHO_CAMINHO, ehCaminhoRestaurante } from "@/lib/area-interna/caminhos";
import { FaixaAssinatura } from "@/components/assinatura/faixa-assinatura";
import { getAssinaturaAtual } from "@/lib/assinatura/app";
import { faixaAssinatura } from "@/lib/assinatura/regras";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getAcessoAtual();
  // Zatti HUB (área do Vinícius) não tem tela de restaurante: link antigo ou
  // favorito de /painel, /estoque... volta para o Início dela.
  if (acesso.areaInterna && ehCaminhoRestaurante((await headers()).get(CABECALHO_CAMINHO) ?? "")) {
    redirect("/inicio");
  }
  const podeGerir = acesso.role !== "operacional";
  // Vigência anual (15/10/2026): depois da carência o cliente trava, sem perder dado. O master
  // nunca trava (vê a faixa para saber a situação do cliente).
  const assinatura = acesso.areaInterna ? null : await getAssinaturaAtual(acesso.organizacaoId);
  const conciliacaoHabilitada = acesso.financeiroGerencialHabilitado && !acesso.areaInterna
    ? (await lerFlagsConciliacao(acesso.unidadeId)).habilitada
    : false;
  if (assinatura?.situacao.tipo === "bloqueada" && acesso.role !== "master") redirect("/assinatura-vencida");
  const faixa = assinatura ? faixaAssinatura(assinatura.situacao, podeGerir) : null;
  const nomeUnidadeSuporte =
    acesso.organizacaoNome && acesso.organizacaoNome !== acesso.unidadeNome
      ? `${acesso.organizacaoNome} - ${acesso.unidadeNome}`
      : acesso.unidadeNome;

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

  // Ordem do dia a dia (pedido de Vinícius em 20/10/2026): painel primeiro, depois o trabalho diário
  // (caixa de entrada, conciliação, contas a pagar e receber), relatórios e por último a configuração.
  const secoesFinanceiroGerencial: SecaoNavegacao[] = [
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

  // Área de trabalho do Vinícius (organização "Zatti HUB", 15/10/2026): menu
  // próprio, sem módulos de restaurante. Esconder é só UX - a barreira é
  // `requireMaster()`/`requireEscritorio()` em cada layout e Server Action.
  const itensAreaInterna: ItemNavegacao[] = [
    { label: "Início", href: "/inicio", icone: "painel", activePrefix: "/inicio", disabled: false },
    {
      label: "Agenda",
      href: "/agenda/dia",
      icone: "agenda",
      activePrefix: "/agenda",
      disabled: false,
      sections: [
        {
          label: "Agenda",
          items: [
            { label: "Dia", href: "/agenda/dia" },
            { label: "Rotina da semana", href: "/agenda/semana" },
          ],
        },
      ],
    },
    // Painel de operação (16/10/2026): quadro do que vive no WhatsApp do Vini.
    { label: "Operação", href: "/escritorio/operacao", icone: "tarefas", activePrefix: "/escritorio/operacao", disabled: false },
    {
      label: "Meu Tempo",
      href: "/meu-tempo/hoje",
      icone: "meuTempo",
      activePrefix: "/meu-tempo",
      disabled: false,
      sections: [
        {
          label: "Meu Tempo",
          items: [
            { label: "Hoje", href: "/meu-tempo/hoje" },
            { label: "Painel mensal", href: "/meu-tempo/painel" },
            { label: "Histórico", href: "/meu-tempo/historico" },
            { label: "Configurações", href: "/meu-tempo/configuracoes" },
          ],
        },
      ],
    },
    { label: "Comercial", href: "/escritorio/comercial", icone: "financeiro", activePrefix: "/escritorio/comercial", disabled: false },
    { label: "Clientes", href: "/escritorio/clientes", icone: "organizacao", activePrefix: "/escritorio/clientes", disabled: false },
    { label: "Conteúdo", href: "/escritorio/conteudo", icone: "marketing", activePrefix: "/escritorio/conteudo", disabled: false },
    // "/escritorio" é prefixo das quatro (Operação, Comercial, Clientes, Conteúdo); o menu marca o prefixo mais longo.
    { label: "Time de IA", href: "/escritorio", icone: "escritorio", activePrefix: "/escritorio", disabled: false },
    { label: "Acessos", href: "/acessos", icone: "acessos", activePrefix: "/acessos", disabled: false },
  ];

  // Cada módulo só sai de "em breve" pra unidade com a flag ligada
  // (`unidades.consolidado_vendas_habilitado`/`financeiro_gerencial_habilitado`,
  // configurável por cliente).
  const itensRestaurante: ItemNavegacao[] = [
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
      // Painel financeiro abre o módulo para todos os papéis (20/10/2026).
      href: "/financeiro-gerencial/visao-geral",
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
    // Equipe: gestão cadastra a própria equipe (flag por organização). A
    // barreira de verdade é `requireEquipe()` na página e em cada action.
    ...(podeGerir && acesso.equipeHabilitado
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
      disabled: !acesso.garanteHabilitado,
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

  return (
    <GuardaContagemProvider>
      <GuardaEdicaoProvider>
        <EstruturaAplicativo
          items={acesso.areaInterna ? itensAreaInterna : itensRestaurante}
          organizacaoAtual={acesso.organizacaoId}
          organizacaoNome={acesso.organizacaoNome}
          organizacoes={acesso.organizacoesDisponiveis}
          usuarioEmail={acesso.usuarioEmail}
          usuarioNome={acesso.usuarioNome}
        >
          {/* Nome da unidade para a mensagem de suporte do cartão de erro. */}
          <UnidadeSuporteProvider unidade={nomeUnidadeSuporte}>
            {faixa ? <FaixaAssinatura faixa={faixa} link={assinatura?.link ?? null} /> : null}
            {children}
          </UnidadeSuporteProvider>
        </EstruturaAplicativo>
      </GuardaEdicaoProvider>
    </GuardaContagemProvider>
  );
}
