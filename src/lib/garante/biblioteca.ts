/** Biblioteca de modelos do Checklist Garante: os POPs operacionais da Zatti
 * (etapa Estrutura do M.E.G.A.), item por item, sem inventar nada. Fonte:
 * `_conhecimento/negocios/pops-operacionais-restaurantes.md` (POPs 1, 2, 3,
 * 5 e 6). A única adaptação: a linha de temperatura das câmaras virou dois
 * itens numéricos com a faixa que o próprio POP define (0 a 5 °C e abaixo de
 * -18 °C), para o app saber quando está fora da meta. Texto e modelos são
 * nossos; nada vem de concorrente. */

export type TipoItemGarante = "check" | "numero" | "estrelas" | "texto";

export type ItemBiblioteca = {
  grupo: string;
  titulo: string;
  tipo?: TipoItemGarante;
  metaMin?: number;
  metaMax?: number;
};

export type ModeloBiblioteca = {
  chave: string;
  nome: string;
  descricao: string;
  quando: string;
  itens: ItemBiblioteca[];
};

const c = (grupo: string, titulo: string): ItemBiblioteca => ({ grupo, titulo });

export const BIBLIOTECA_POPS: ModeloBiblioteca[] = [
  {
    chave: "pop-1-abertura",
    nome: "Abertura",
    descricao: "POP 1: iniciar o expediente com equipamentos testados, insumos verificados e equipe alinhada.",
    quando: "Todo dia, ao menos 30 minutos antes da abertura para clientes",
    itens: [
      c("Equipamentos e infraestrutura", "Ligar e testar fogão, chapa, fritadeira e forno"),
      { grupo: "Equipamentos e infraestrutura", titulo: "Temperatura das câmaras de refrigerados (°C)", tipo: "numero", metaMin: 0, metaMax: 5 },
      { grupo: "Equipamentos e infraestrutura", titulo: "Temperatura das câmaras de congelados (°C)", tipo: "numero", metaMax: -18 },
      c("Equipamentos e infraestrutura", "Testar sistema de PDV e plataformas de delivery (ativos e recebendo pedidos)"),
      c("Equipamentos e infraestrutura", "Verificar disponibilidade de troco no caixa"),
      c("Equipamentos e infraestrutura", "Checar conexão de internet"),
      c("Insumos e cozinha", "Conferir estoque dos itens críticos para o turno (os que não podem faltar)"),
      c("Insumos e cozinha", "Confirmar que a mise en place pode ser montada sem falta de insumos"),
      c("Insumos e cozinha", "Verificar validade de itens que serão usados no dia"),
      c("Ambiente", "Salão limpo e mesas organizadas"),
      c("Ambiente", "Banheiros abastecidos e limpos"),
      c("Ambiente", "Lixeiras vazias"),
      c("Equipe", "Confirmar presença e fardamento de todos"),
      c("Equipe", "Briefing rápido: metas do dia, promoções ativas, informações da semana, alertas operacionais"),
      c("Equipe", "Distribuir funções do turno se houver alteração"),
    ],
  },
  {
    chave: "pop-2-fechamento",
    nome: "Fechamento",
    descricao: "POP 2: encerrar com segurança, higiene garantida, estoque armazenado e faturamento registrado.",
    quando: "Ao final de cada expediente, após o último atendimento",
    itens: [
      c("Financeiro", "Fechar o caixa e conferir valores físicos contra o sistema"),
      c("Financeiro", "Registrar divergências com justificativa"),
      c("Financeiro", "Registrar faturamento do dia por canal (salão, delivery próprio, plataformas)"),
      c("Financeiro", "Guardar dinheiro em local seguro conforme padrão do restaurante"),
      c("Cozinha e estoque", "Desligar fogão, chapa, fritadeira e forno"),
      c("Cozinha e estoque", "Embalar e identificar insumos que sobram: nome do produto + data de abertura"),
      c("Cozinha e estoque", "Armazenar cada item no local correto (geladeira, câmara, seco) com temperatura verificada"),
      c("Cozinha e estoque", "Descartar sobras que não podem ser reaproveitadas conforme critério definido"),
      c("Limpeza", "Limpeza completa das superfícies de cozinha"),
      c("Limpeza", "Higienização dos equipamentos (chapa, fritadeira, bordas do fogão)"),
      c("Limpeza", "Limpeza de piso da cozinha"),
      c("Limpeza", "Limpeza do salão e banheiros"),
      c("Limpeza", "Lixeiras esvaziadas e sacos trocados"),
      c("Segurança", "Desligar sistemas de PDV e delivery"),
      c("Segurança", "Verificar janelas e portas fechadas"),
      c("Segurança", "Verificar gás (desligado conforme padrão do estabelecimento)"),
      c("Segurança", "Apagar luzes de áreas não monitoradas"),
    ],
  },
  {
    chave: "pop-3-praca",
    nome: "Montagem da praça",
    descricao: "POP 3: cada estação pronta antes do primeiro pedido, com insumos, equipamentos e utensílios.",
    quando: "Todo dia, após a abertura e antes do início do serviço",
    itens: [
      c("Higiene e organização", "Limpar e sanitizar todas as superfícies de trabalho"),
      c("Higiene e organização", "Utensílios limpos e disponíveis (espátulas, pinças, conchas, facas)"),
      c("Higiene e organização", "Posicionar utensílios de uso frequente ao alcance direto"),
      c("Mise en place", "Separar e porcionar insumos do cardápio conforme fichas técnicas"),
      c("Mise en place", "Organizar ingredientes por proximidade de uso na estação"),
      c("Mise en place", "Verificar embalagens de delivery disponíveis (caixas, sacolas, proteções)"),
      c("Mise en place", "Confirmar disponibilidade de papel manteiga, papel toalha e similares"),
      c("Equipamentos", "Ligar chapa com antecedência para atingir temperatura operacional"),
      c("Equipamentos", "Ligar fritadeira e verificar nível e qualidade do óleo"),
      c("Equipamentos", "Ligar outros equipamentos conforme rotina do cardápio"),
      c("Referência técnica", "Fichas técnicas dos pratos do cardápio acessíveis"),
      c("Referência técnica", "Verificar item 86 (indisponível) e comunicar ao atendimento antes de abrir"),
    ],
  },
  {
    chave: "pop-5-limpeza-fechamento",
    nome: "Limpeza de fechamento",
    descricao: "POP 5 (diária): ambiente no padrão da vigilância sanitária ao fim do dia.",
    quando: "Diariamente, no fechamento",
    itens: [
      c("Limpeza de fechamento", "Superfícies de cozinha: limpar com detergente e sanitizar com produto adequado"),
      c("Limpeza de fechamento", "Chapa: raspar resíduos com espátula, limpar com produto indicado para aço"),
      c("Limpeza de fechamento", "Fritadeira: filtrar ou trocar o óleo conforme padrão do restaurante"),
      c("Limpeza de fechamento", "Fogão: limpar queimadores, grelhas e superfícies"),
      c("Limpeza de fechamento", "Piso da cozinha: varrer e lavar com desengordurante"),
      c("Limpeza de fechamento", "Salão: mesas, cadeiras e piso"),
      c("Limpeza de fechamento", "Banheiros: piso, vasos, pias e espelhos"),
      c("Limpeza de fechamento", "Lixeiras: esvaziar, lavar e trocar sacos"),
    ],
  },
  {
    chave: "pop-5-limpeza-semanal",
    nome: "Limpeza profunda semanal",
    descricao: "POP 5 (semanal): limpeza profunda de câmaras, exaustão e áreas de difícil acesso.",
    quando: "Uma vez por semana",
    itens: [
      c("Limpeza profunda", "Interior das câmaras frias e geladeiras (prateleiras, paredes, ralos)"),
      c("Limpeza profunda", "Coifas e filtros de exaustão"),
      c("Limpeza profunda", "Interior de forno"),
      c("Limpeza profunda", "Prateleiras do estoque"),
      c("Limpeza profunda", "Rodapés, cantos e áreas de difícil acesso do piso"),
      c("Limpeza profunda", "Face externa dos equipamentos"),
    ],
  },
  {
    chave: "pop-6-estoque",
    nome: "Organização de estoque",
    descricao: "POP 6: estoque organizado (PVPS), sem desperdício e com rastreabilidade.",
    quando: "Diariamente e após cada recebimento de mercadoria",
    itens: [
      c("Identificação", "Todo item armazenado com etiqueta: nome, data de entrada e data de validade"),
      c("Identificação", "Produtos abertos com etiqueta de data de abertura e prazo de uso"),
      c("Organização por categoria", "Carnes e proteínas na câmara fria ou freezer, separados por tipo"),
      c("Organização por categoria", "Laticínios na geladeira, separados de carnes cruas"),
      c("Organização por categoria", "Vegetais e frutas no local adequado à temperatura requerida"),
      c("Organização por categoria", "Secos e embalagens em prateleiras secas, organizados por tipo"),
      c("Organização por categoria", "Produtos de limpeza separados dos alimentos, nunca na mesma prateleira"),
      c("Verificação", "Conferir temperatura das câmaras ao organizar"),
      c("Verificação", "Remover e descartar produto vencido ou com sinal de deterioração"),
      c("Verificação", "Registrar descarte no controle de estoque com data, produto e quantidade"),
      c("Verificação", "Sinalizar ao responsável itens com estoque baixo"),
    ],
  },
];

export function modeloDaBiblioteca(chave: string): ModeloBiblioteca | undefined {
  return BIBLIOTECA_POPS.find((m) => m.chave === chave);
}
