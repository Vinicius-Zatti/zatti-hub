import type { Posicao, Sala } from "./tipos";

/** Representação do organograma do Time de IA. A fonte oficial é
 * `_conhecimento/zatti/time-ia.md` no vault: mude lá primeiro e reflita aqui.
 * Posição nova também pede `responsabilidades.ts` e `estado.ts` - o teste
 * acusa o que faltar. */
export const SALAS: Sala[] = [
  { id: "ceo", nome: "Sala do CEO", empresa: "zatti", tipo: "ceo", grupo: "topo", resumo: "Metas, limites, decisões estratégicas e autoridade em restaurantes." },
  { id: "recepcao", nome: "Recepção do Vini", empresa: "zatti", tipo: "recepcao", grupo: "topo", resumo: "Porta de entrada. Todo pedido começa aqui e é encaminhado." },
  { id: "vendas", nome: "Diretoria de Vendas", empresa: "zatti", tipo: "diretoria", grupo: "empresa", resumo: "Atrair, gerar demanda e fechar novos clientes para a Zatti." },
  { id: "produto", nome: "Diretoria de Produto e Tecnologia", empresa: "zatti", tipo: "diretoria", grupo: "empresa", resumo: "Zatti Hub, produtos digitais, automações e dados da Zatti." },
  { id: "corporativa", nome: "Diretoria Corporativa", empresa: "zatti", tipo: "diretoria", grupo: "empresa", resumo: "Financeiro da Zatti, jurídico, processos e melhoria contínua." },
  { id: "clientes", nome: "Clientes Zatti", empresa: "zatti", tipo: "diretoria", grupo: "clientes", resumo: "Conhecimento de Vinícius e do Método M.E.G.A. aplicado aos restaurantes." },
  { id: "horizzon", nome: "Núcleo Estratégico Horizzon", empresa: "horizzon", tipo: "nucleo", grupo: "horizzon", resumo: "Operação da Horizzon Work, separada dos clientes da Zatti." },
];

const vaga = (id: string, cargo: string, salaId: string, reportaA: string): Posicao => ({
  id, cargo, salaId, ocupanteId: null, arquetipoId: null, reportaA,
});

/** Área de restaurante: a autoridade técnica é sempre de Vinícius. */
const area = (id: string, cargo: string): Posicao => ({
  id, cargo, salaId: "clientes", ocupanteId: "vinicius", arquetipoId: null, reportaA: "autoridade-tecnica",
});

export const POSICOES: Posicao[] = [
  { id: "ceo", cargo: "CEO e autoridade em restaurantes", salaId: "ceo", ocupanteId: "vinicius", arquetipoId: null, reportaA: null, lider: true },
  { id: "chefe-operacoes", cargo: "Chefe de Operações", salaId: "recepcao", ocupanteId: "vini", arquetipoId: null, reportaA: "ceo", lider: true },

  { id: "dir-vendas", cargo: "Direção de Vendas", salaId: "vendas", ocupanteId: "agente", arquetipoId: "flavio-augusto", reportaA: "chefe-operacoes", lider: true },
  { id: "marketing", cargo: "Marketing", salaId: "vendas", ocupanteId: "agente", arquetipoId: "alfredo-soares", reportaA: "dir-vendas" },
  { id: "comercial", cargo: "Comercial", salaId: "vendas", ocupanteId: "antonio", arquetipoId: null, reportaA: "dir-vendas" },

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

  { id: "autoridade-tecnica", cargo: "Autoridade técnica e guardião do M.E.G.A.", salaId: "clientes", ocupanteId: "vinicius", arquetipoId: null, reportaA: "ceo", lider: true },
  { id: "coordenacao-clientes", cargo: "Direção de Clientes, coordenação e implantação", salaId: "clientes", ocupanteId: "vini", arquetipoId: null, reportaA: "chefe-operacoes" },
  area("diagnostico-mega", "Diagnóstico M.E.G.A."),
  area("bpo-financeiro", "Gestão financeira e BPO"),
  { id: "bpo-execucao", cargo: "Execução do BPO", salaId: "clientes", ocupanteId: "agente", arquetipoId: "eliandro-prado", reportaA: "bpo-financeiro" },
  area("cmv-estoque", "CMV, estoque e compras"),
  area("precificacao", "Precificação"),
  area("engenharia-cardapio", "Engenharia de cardápio"),
  area("vendas-restaurante", "Vendas do restaurante"),
  area("processos-operacao", "Processos e gestão da operação"),
  vaga("sucesso-cliente", "Sucesso do Cliente (a definir)", "clientes", "coordenacao-clientes"),

  { id: "hzz-cmo", cargo: "CMO e responsável final", salaId: "horizzon", ocupanteId: "vinicius", arquetipoId: null, reportaA: null, lider: true },
  { id: "hzz-coordenacao", cargo: "Coordenação operacional", salaId: "horizzon", ocupanteId: "vini", arquetipoId: null, reportaA: "hzz-cmo" },
  vaga("hzz-estrategia", "Estratégia dos clientes", "horizzon", "hzz-coordenacao"),
  vaga("hzz-reunioes", "Reuniões, atas e acompanhamento", "horizzon", "hzz-coordenacao"),
  vaga("hzz-relatorios", "Relatórios e desempenho", "horizzon", "hzz-coordenacao"),
  vaga("hzz-comercial", "Comercial e crescimento da Horizzon", "horizzon", "hzz-coordenacao"),
  vaga("hzz-entregas", "Controle de entregas do time", "horizzon", "hzz-coordenacao"),
];
