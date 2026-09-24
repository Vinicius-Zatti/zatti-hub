import type { Posicao, Sala } from "./tipos";

/** Fonte única do organograma do Time de IA (aprovado por Vinícius em
 * 24/09/2026). Para mudar a estrutura, edite só este arquivo e, se for posição
 * nova, `responsabilidades.ts` e `estado.ts` - o teste acusa o que faltar. */
export const SALAS: Sala[] = [
  { id: "ceo", nome: "Sala do CEO", empresa: "zatti", tipo: "ceo", resumo: "Metas, limites e decisões estratégicas." },
  { id: "recepcao", nome: "Recepção do Vini", empresa: "zatti", tipo: "recepcao", resumo: "Porta de entrada. Todo pedido começa aqui e é encaminhado." },
  { id: "vendas", nome: "Diretoria de Vendas", empresa: "zatti", tipo: "diretoria", resumo: "Atrair, gerar demanda e fechar novos clientes." },
  { id: "clientes", nome: "Diretoria de Clientes", empresa: "zatti", tipo: "diretoria", resumo: "Implantar, atender e reter os clientes da Zatti." },
  { id: "produto", nome: "Diretoria de Produto e Tecnologia", empresa: "zatti", tipo: "diretoria", resumo: "Zatti Hub, produtos digitais, automações e dados." },
  { id: "corporativa", nome: "Diretoria Corporativa", empresa: "zatti", tipo: "diretoria", resumo: "Financeiro da Zatti, jurídico, processos e melhoria contínua." },
  { id: "horizzon", nome: "Núcleo Estratégico Horizzon", empresa: "horizzon", tipo: "nucleo", resumo: "Operação da Horizzon Work, separada dos clientes da Zatti." },
];

const vaga = (id: string, cargo: string, salaId: string, reportaA: string): Posicao => ({
  id, cargo, salaId, ocupanteId: null, arquetipoId: null, reportaA,
});

export const POSICOES: Posicao[] = [
  { id: "ceo", cargo: "CEO", salaId: "ceo", ocupanteId: "vinicius", arquetipoId: null, reportaA: null, lider: true },
  { id: "chefe-operacoes", cargo: "Chefe de Operações", salaId: "recepcao", ocupanteId: "vini", arquetipoId: null, reportaA: "ceo", lider: true },

  { id: "dir-vendas", cargo: "Direção de Vendas", salaId: "vendas", ocupanteId: "agente", arquetipoId: "flavio-augusto", reportaA: "chefe-operacoes", lider: true },
  { id: "marketing", cargo: "Marketing", salaId: "vendas", ocupanteId: "agente", arquetipoId: "alfredo-soares", reportaA: "dir-vendas" },
  { id: "comercial", cargo: "Comercial", salaId: "vendas", ocupanteId: "antonio", arquetipoId: null, reportaA: "dir-vendas" },

  { id: "dir-clientes", cargo: "Direção de Clientes", salaId: "clientes", ocupanteId: "vini", arquetipoId: null, reportaA: "chefe-operacoes", lider: true },
  { id: "implantacao", cargo: "Implantação", salaId: "clientes", ocupanteId: "vini", arquetipoId: null, reportaA: "dir-clientes" },
  { id: "consultoria-mega", cargo: "Consultoria M.E.G.A.", salaId: "clientes", ocupanteId: "vinicius", arquetipoId: null, reportaA: "dir-clientes" },
  { id: "bpo-financeiro", cargo: "BPO Financeiro", salaId: "clientes", ocupanteId: "agente", arquetipoId: "eliandro-prado", reportaA: "dir-clientes" },
  vaga("sucesso-cliente", "Sucesso do Cliente", "clientes", "dir-clientes"),

  { id: "dir-produto", cargo: "Direção de Produto e Tecnologia", salaId: "produto", ocupanteId: "agente", arquetipoId: "marcos-eduardo", reportaA: "chefe-operacoes", lider: true },
  { id: "zatti-hub", cargo: "Zatti Hub", salaId: "produto", ocupanteId: "agente", arquetipoId: "anderson", reportaA: "dir-produto" },
  { id: "produtos-digitais", cargo: "Produtos Digitais", salaId: "produto", ocupanteId: "agente", arquetipoId: "erico-rocha", reportaA: "dir-produto" },
  vaga("automacoes", "Automações", "produto", "dir-produto"),
  vaga("dados", "Dados e Inteligência", "produto", "dir-produto"),

  { id: "dir-corporativa", cargo: "Direção Corporativa", salaId: "corporativa", ocupanteId: "agente", arquetipoId: "karol", reportaA: "chefe-operacoes", lider: true },
  { id: "financeiro-zatti", cargo: "Financeiro da Zatti", salaId: "corporativa", ocupanteId: "agente", arquetipoId: "bruno-perini", reportaA: "dir-corporativa" },
  { id: "juridico", cargo: "Jurídico", salaId: "corporativa", ocupanteId: "bia", arquetipoId: null, reportaA: "dir-corporativa" },
  vaga("processos", "Processos e Qualidade", "corporativa", "dir-corporativa"),
  vaga("melhoria-continua", "Melhoria Contínua", "corporativa", "dir-corporativa"),

  { id: "hzz-cmo", cargo: "CMO e responsável final", salaId: "horizzon", ocupanteId: "vinicius", arquetipoId: null, reportaA: null, lider: true },
  { id: "hzz-coordenacao", cargo: "Coordenação operacional", salaId: "horizzon", ocupanteId: "vini", arquetipoId: null, reportaA: "hzz-cmo" },
  vaga("hzz-estrategia", "Estratégia dos clientes", "horizzon", "hzz-coordenacao"),
  vaga("hzz-reunioes", "Reuniões, atas e acompanhamento", "horizzon", "hzz-coordenacao"),
  vaga("hzz-relatorios", "Relatórios e desempenho", "horizzon", "hzz-coordenacao"),
  vaga("hzz-comercial", "Comercial e crescimento da Horizzon", "horizzon", "hzz-coordenacao"),
  vaga("hzz-entregas", "Controle de entregas do time", "horizzon", "hzz-coordenacao"),
];
