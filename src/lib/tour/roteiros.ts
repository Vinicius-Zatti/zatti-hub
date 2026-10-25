// Tour no primeiro acesso de cada módulo (Navegação V2, fase 4, 25/10/2026).
// TODOS os textos do tour moram neste arquivo, para Vinícius validar num lugar
// só. Regras de escrita: PT-BR, "você", sem travessão, sem emoji, curto, e cada
// texto diz o que a pessoa faz ali. 3 a 5 passos por módulo.
//
// `alvos`: seletores CSS do elemento que o passo aponta, em ordem de
// preferência. Vale o primeiro que estiver visível na tela; sem nenhum
// visível (tela sem aquele elemento, papel sem a aba, celular x computador),
// o passo é pulado. Por isso dá para listar passos que só a gestão vê.

export type ModuloTour =
  | "inicio"
  | "estoque"
  | "vendas"
  | "financeiro"
  | "cardapio"
  | "garante"
  | "equipe"
  | "relatorios"
  | "cadastros"
  | "configuracoes";

export type PassoTour = {
  alvos: readonly string[];
  titulo: string;
  texto: string;
};

/** Rótulo do módulo no menu do piloto -> chave gravada em `tours_vistos`.
 * A chave não muda se o rótulo mudar (ex.: Cardápio ainda é provisório). */
export const MODULO_TOUR_POR_ROTULO: Readonly<Record<string, ModuloTour>> = {
  Início: "inicio",
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

// Elementos que existem em todos os módulos (cabeçalho, menu, busca).
const ABAS = ['[data-tour="abas-modulo"]'];
const SUBABAS = ['[data-tour="subabas-modulo"]'];
const REVER = ['[data-tour="rever-tour"]'];
const DICA = ['#conteudo-principal button[aria-label^="Como é calculado"]'];
// Desktop: botão Buscar do menu lateral; celular: lupa do cabeçalho.
const BUSCA = ['button[aria-label^="Buscar menus e atalhos"]'];
// Desktop: menu lateral; celular: barra de atalhos de baixo.
const MENU = ['#menu-lateral nav[aria-label="Módulos do sistema"]', 'nav[aria-label="Atalhos"]'];

const PASSO_REVER: PassoTour = {
  alvos: REVER,
  titulo: "Rever o tour",
  texto: "Quer ver estas dicas de novo? Toque aqui quando quiser.",
};

const PASSO_DICA: PassoTour = {
  alvos: DICA,
  titulo: "Como a conta é feita",
  texto: "Todo número calculado tem este (i). Toque nele para ver a fórmula em palavras simples.",
};

export const ROTEIROS_TOUR: Readonly<Record<ModuloTour, readonly PassoTour[]>> = {
  inicio: [
    {
      alvos: ['ul[aria-label="Atalhos da operação do dia"]'],
      titulo: "Operação do dia",
      texto: "Aqui ficam os atalhos do que você faz todo dia. Toque num cartão para ir direto à tela.",
    },
    {
      alvos: ['section[aria-labelledby="inicio-gestao"]'],
      titulo: "Gestão",
      texto: "Os atalhos da gestão: cotação, lançamentos do Financeiro e o que só você decide.",
    },
    {
      alvos: ABAS,
      titulo: "Dashboard",
      texto: "Na aba Dashboard você vê os números de cada área num lugar só.",
    },
    {
      alvos: BUSCA,
      titulo: "Buscar",
      texto: "Procure qualquer tela pelo nome. No computador, use Ctrl+K.",
    },
    {
      alvos: MENU,
      titulo: "Menu",
      texto: "Pelo menu você chega a todos os módulos. No celular, os mais usados ficam na barra de baixo.",
    },
  ],
  estoque: [
    {
      alvos: ABAS,
      titulo: "Seções do Estoque",
      texto: "Cada seção do Estoque tem uma aba: Produtos, Contagem, Pedidos e as outras. Toque para trocar.",
    },
    {
      alvos: SUBABAS,
      titulo: "Telas da seção",
      texto: "Quando a seção tem mais de uma tela, elas aparecem nesta segunda linha.",
    },
    {
      alvos: ['section[aria-label="Contagem"]'],
      titulo: "Última contagem",
      texto: "Aqui você vê o valor em estoque e os itens que pedem compra. Toque para conferir a contagem.",
    },
    PASSO_DICA,
    PASSO_REVER,
  ],
  vendas: [
    {
      alvos: ["#conteudo-principal form"],
      titulo: "Lançar vendas",
      texto: "Lance aqui as vendas do dia, separadas por forma de pagamento, e salve no fim.",
    },
    {
      alvos: ABAS,
      titulo: "Histórico",
      texto: "Em Histórico você confere e corrige os lançamentos dos outros dias.",
    },
    PASSO_REVER,
  ],
  financeiro: [
    {
      alvos: ABAS,
      titulo: "Seções do Financeiro",
      texto: "O Financeiro se divide em dia a dia, lançamentos e fechamento do mês. Toque para trocar.",
    },
    {
      alvos: SUBABAS,
      titulo: "Telas da seção",
      texto: "Cada seção abre suas telas nesta linha. Comece pelo Painel financeiro e pela Caixa de Entrada.",
    },
    PASSO_DICA,
    PASSO_REVER,
  ],
  cardapio: [
    {
      alvos: ['#conteudo-principal input[placeholder^="Buscar por nome"]'],
      titulo: "Achar uma ficha",
      texto: "Procure a ficha técnica pelo nome, pelo SKU ou pela categoria.",
    },
    {
      alvos: ABAS,
      titulo: "Margem e preço",
      texto: "Nestas abas você calcula a Margem Ideal e confere a Precificação dos pratos.",
    },
    PASSO_REVER,
  ],
  garante: [
    {
      alvos: ['[data-tour="garante-checklists"]'],
      titulo: "Checklists de hoje",
      texto: "Aqui estão os seus checklists do dia. Toque em um para começar e marcar cada item.",
    },
    {
      alvos: DICA,
      titulo: "Andamento do dia",
      texto: "O (i) mostra como contamos os checklists concluídos hoje.",
    },
    {
      alvos: ABAS,
      titulo: "Planos e gestão",
      texto: "Em Planos de ação ficam as correções combinadas. A gestão também vê o Quadro do dia e a Nota.",
    },
    PASSO_REVER,
  ],
  equipe: [
    {
      alvos: ['[data-tour="equipe-cadastrar"]'],
      titulo: "Cadastrar pessoa",
      texto: "Cadastre quem trabalha com você. O login e a senha provisória chegam no WhatsApp da pessoa.",
    },
    {
      alvos: ['[data-tour="equipe-com-acesso"]'],
      titulo: "Quem tem acesso",
      texto: "Aqui você muda o acesso de cada pessoa ou tira o login de quem saiu.",
    },
    PASSO_REVER,
  ],
  relatorios: [
    {
      alvos: ['ul[aria-label="Relatórios disponíveis"]'],
      titulo: "Seus relatórios",
      texto: "Todos os relatórios num lugar só. Toque no cartão para abrir.",
    },
    {
      alvos: ABAS,
      titulo: "Trocar de relatório",
      texto: "Com as abas você passa de um relatório para outro, como DRE e Fluxo de Caixa.",
    },
    PASSO_REVER,
  ],
  cadastros: [
    {
      alvos: ['ul[aria-label="Cadastros disponíveis"]'],
      titulo: "Seus cadastros",
      texto: "O que você cadastra uma vez e consulta depois: produtos, setores, fornecedores e Plano de Contas.",
    },
    {
      alvos: ABAS,
      titulo: "Ir direto",
      texto: "Pelas abas você abre cada cadastro sem voltar a esta tela.",
    },
    PASSO_REVER,
  ],
  configuracoes: [
    {
      alvos: ABAS,
      titulo: "Configurações",
      texto: "Cada aba ajusta uma parte da unidade. Toque para trocar.",
    },
    {
      alvos: ["#conteudo-principal form"],
      titulo: "Ajustar e salvar",
      texto: "Mude o que precisar e salve. A mudança vale para toda a unidade.",
    },
    PASSO_REVER,
  ],
};
