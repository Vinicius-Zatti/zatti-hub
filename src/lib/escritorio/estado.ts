import type { EstadoPosicao } from "./tipos";

/** Estado operacional registrado à mão. Não é tempo real: nada aqui vem de
 * integração. Quem atualiza (Vini ou sessão autorizada) muda este arquivo e a
 * data abaixo. Regra: nível só sobe com evidência escrita (skill, serviço ou
 * arquivo que existe), e situação "aguardando"/"com problema" exige motivo. */
export const ESTADO_ATUALIZADO_EM = "2026-09-24";

const definido = (): EstadoPosicao => ({ nivel: "definido", situacao: "disponivel", entregas: [], alertas: [] });
const pessoa = (): EstadoPosicao => ({ nivel: null, situacao: "disponivel", entregas: [], alertas: [] });
const vaga = (): EstadoPosicao => ({ nivel: null, situacao: "vaga", entregas: [], alertas: [] });

export const ESTADO: Record<string, EstadoPosicao> = {
  ceo: pessoa(),
  "chefe-operacoes": {
    nivel: "operacional", situacao: "disponivel",
    evidencia: "Serviço vini no Railway (lembretes, WhatsApp e módulos cs-* por cliente) e Agenda diária.",
    entregas: [], alertas: [],
  },

  "dir-vendas": definido(),
  marketing: {
    nivel: "processo", situacao: "disponivel",
    evidencia: "Motor de conteúdo pessoal: vini-estrategista, vini-redator, vini-diretor-criativo e vini-editor.",
    entregas: [], alertas: [],
  },
  comercial: {
    nivel: "processo", situacao: "disponivel",
    evidencia: "Comandos pesquisar-prospecto e gerar-proposta.",
    entregas: [], alertas: [],
  },

  "dir-clientes": {
    nivel: "processo", situacao: "disponivel",
    evidencia: "Módulos cs-* por cliente no Vini. O padrão de time de agentes por cliente segue incompleto.",
    entregas: [], alertas: ["Padrão de time de agentes por cliente com prazo vencido em 31/07, sem nova data."],
  },
  implantacao: {
    nivel: "processo", situacao: "disponivel",
    evidencia: "Onboarding e carga de dados no Zatti Hub feitos em sessão, sem agente próprio.",
    entregas: [{ data: "2026-09-23", descricao: "Ajustes de dados da The House no Zatti Hub (produtos, contagem, mínimo e fornecedores)." }],
    alertas: [],
  },
  "consultoria-mega": pessoa(),
  "bpo-financeiro": {
    nivel: "processo", situacao: "disponivel",
    evidencia: "Skills dre-domquixote, dre-lucaskinhas e consulta-extrato; coleta de extrato da DQ no Vini.",
    entregas: [], alertas: [],
  },
  "sucesso-cliente": vaga(),

  "dir-produto": definido(),
  "zatti-hub": {
    nivel: "processo", situacao: "aguardando-vinicius",
    evidencia: "Agente ajustes-app-zatti-hub e regras do repositório (AGENTS.md).",
    motivo: "Teste de uso do Financeiro Gerencial e nome da última linha da DRE.",
    entregas: [{ data: "2026-09-23", descricao: "Três correções do Financeiro Gerencial no ar (commit b3970fb)." }],
    alertas: [],
  },
  "produtos-digitais": definido(),
  automacoes: vaga(),
  dados: vaga(),

  "dir-corporativa": definido(),
  "financeiro-zatti": definido(),
  juridico: definido(),
  processos: vaga(),
  "melhoria-continua": vaga(),

  "hzz-cmo": pessoa(),
  "hzz-coordenacao": {
    nivel: "processo", situacao: "aguardando-vinicius",
    evidencia: "Skills hzz-*, processar-atas e Horizzon HUB.",
    motivo: "Autorização para gravar o grupo do Malokero no serviço vini (Railway).",
    entregas: [{ data: "2026-09-23", descricao: "Onboarding do Malokero feito e lembrete enviado ao grupo." }],
    alertas: [],
  },
  "hzz-estrategia": vaga(),
  "hzz-reunioes": vaga(),
  "hzz-relatorios": vaga(),
  "hzz-comercial": vaga(),
  "hzz-entregas": vaga(),
};
