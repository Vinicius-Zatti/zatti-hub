/** Regras do funil comercial (Escritório > Comercial). Funções puras, usadas
 * no servidor e na tela. A ordem das etapas é a mesma de
 * `zh_leads_ordem_etapa` no banco: compra ou avanço automático nunca rebaixa
 * um lead. Decisões de Vinícius em 02/10/2026 (crm-leads-v1-desenho.md). */

export const ETAPAS = [
  "comecar_a_seguir",
  "mandar_primeira_mensagem",
  "abordado",
  "respondeu",
  "link_enviado",
  "preencheu_formulario",
  "comprou_livro",
  "comprou_app",
  "em_acompanhamento",
  "reuniao_diagnostico",
  "consultoria_fechada",
  "perdido",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ROTULO_ETAPA: Record<Etapa, string> = {
  comecar_a_seguir: "Começar a seguir",
  mandar_primeira_mensagem: "Mandar primeira mensagem",
  abordado: "Abordado",
  respondeu: "Respondeu",
  link_enviado: "Link enviado",
  preencheu_formulario: "Preencheu formulário",
  comprou_livro: "Comprou livro",
  comprou_app: "Comprou app",
  em_acompanhamento: "Em acompanhamento",
  reuniao_diagnostico: "Reunião de diagnóstico",
  consultoria_fechada: "Consultoria fechada",
  perdido: "Perdido",
};

export function ordemEtapa(etapa: Etapa): number {
  return etapa === "perdido" ? 0 : ETAPAS.indexOf(etapa) + 1;
}

/** Próximo passo sugerido para quem está em cada etapa. */
export const SUGESTAO_ETAPA: Record<Etapa, string> = {
  comecar_a_seguir: "Seguir o perfil no Instagram e passar para Mandar primeira mensagem",
  mandar_primeira_mensagem: "Mandar a primeira mensagem curta pelo Direct, sem link",
  abordado: "Esperar resposta; retomar no 2º dia",
  respondeu: "Mandar o link da página com a origem do canal",
  link_enviado: "Ver se abriu o link; retomar em 2 dias",
  preencheu_formulario: "Ver se concluiu o pagamento; se não, chamar no WhatsApp hoje",
  comprou_livro: "Oferecer o Zatti Hub (12x de R$59,90)",
  comprou_app: "Oferecer a consultoria; se não fechar, acompanhamento mensal de R$497",
  em_acompanhamento: "Leitura do mês e oferecer a consultoria",
  reuniao_diagnostico: "Mandar a proposta da consultoria",
  consultoria_fechada: "Marcar 'Virou cliente' e iniciar o acompanhamento",
  perdido: "Nutrição: voltar a falar num novo ciclo",
};

export const ORIGENS = ["instagram", "whatsapp", "ligacao", "site", "indicacao", "teste", "outra"] as const;
export type Origem = (typeof ORIGENS)[number];
export const ROTULO_ORIGEM: Record<Origem, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  site: "Site",
  indicacao: "Indicação",
  teste: "Teste",
  outra: "Outra",
};

export type TipoEvento =
  | "criado"
  | "formulario"
  | "nova_tentativa"
  | "pagamento"
  | "comprou_de_novo"
  | "etapa"
  | "nota"
  | "proxima_acao"
  | "perdido"
  | "virou_cliente";

export type EventoLead = {
  id: string;
  em: string;
  tipo: TipoEvento;
  deEtapa: Etapa | null;
  paraEtapa: Etapa | null;
  produto: string;
  valor: number | null;
  texto: string;
  autor: "site" | "vini" | "sdr" | "vinicius";
};

export const VENDE_DELIVERY = ["", "ifood", "proprio", "nao"] as const;
export type VendeDelivery = (typeof VENDE_DELIVERY)[number];
export const ROTULO_DELIVERY: Record<VendeDelivery, string> = {
  "": "Não informado",
  ifood: "iFood",
  proprio: "Delivery próprio",
  nao: "Não vende",
};

export type Lead = {
  id: string;
  /** Só dígitos, sem o 55; "" quando o lead veio só pelo Instagram. */
  whatsapp: string;
  /** @ normalizado (minúsculo, sem @ e sem URL); "" quando não tem. */
  instagram: string;
  cidadeBairro: string;
  seguidores: number | null;
  ultimoPostEm: string | null;
  notaGoogle: number | null;
  avaliacoesGoogle: number | null;
  vendeDelivery: VendeDelivery;
  nome: string;
  negocio: string;
  origem: Origem;
  produtoInteresse: string;
  etapa: Etapa;
  motivoPerda: string;
  faturamentoAtual: string;
  faturamentoDesejado: string;
  dificuldade: string;
  proximaAcao: string;
  proximaAcaoEm: string | null;
  organizacaoId: string | null;
  criadoEm: string;
  etapaDesde: string;
  ultimoEventoEm: string;
};

const PRODUTO_PAGAMENTO: Record<string, string> = { livro: "Livro", "zatti-hub": "Zatti Hub" };

/** Produto do formulário ("Zatti Hub - plano anual", "Livro Restaurante no
 * Controle") e do pagamento ("zatti-hub", "livro") caem na mesma chave. */
export function chaveProduto(produto: string): "livro" | "zatti-hub" | "consultoria" | "outro" {
  const p = produto.toLowerCase();
  if (p === "livro" || p.includes("livro")) return "livro";
  if (p === "zatti-hub" || p.includes("zatti hub")) return "zatti-hub";
  if (p.includes("consultoria")) return "consultoria";
  return "outro";
}

/** Texto de cada evento na linha do tempo. Formulário (ou nova tentativa) de
 * produto pago sem pagamento depois dele aparece como "não finalizou". */
export function descreverEventos(eventos: EventoLead[]): { evento: EventoLead; titulo: string; detalhe: string }[] {
  const ordenados = [...eventos].sort((a, b) => a.em.localeCompare(b.em));
  return ordenados.map((ev, i) => {
    const chave = chaveProduto(ev.produto);
    const pagouDepois = ordenados
      .slice(i + 1)
      .some((d) => (d.tipo === "pagamento" || d.tipo === "comprou_de_novo") && chaveProduto(d.produto) === chave);
    const pago = chave === "livro" || chave === "zatti-hub";
    const naoFinalizou = pago && !pagouDepois ? " - não finalizou a compra" : "";
    const valor = ev.valor != null ? ` (${formatarReais(ev.valor)})` : "";
    switch (ev.tipo) {
      case "criado":
        return {
          evento: ev,
          titulo: `Lead cadastrado${ev.paraEtapa ? ` em ${ROTULO_ETAPA[ev.paraEtapa]}` : ""}`,
          detalhe: ev.texto,
        };
      case "formulario":
        return { evento: ev, titulo: `Preencheu o formulário: ${ev.produto || "site"}${naoFinalizou}`, detalhe: ev.texto };
      case "nova_tentativa":
        return { evento: ev, titulo: `Nova tentativa: ${ev.produto || "site"}${naoFinalizou}`, detalhe: ev.texto };
      case "pagamento":
        return { evento: ev, titulo: `Comprou ${PRODUTO_PAGAMENTO[ev.produto] ?? ev.produto}${valor}`, detalhe: ev.texto };
      case "comprou_de_novo":
        return { evento: ev, titulo: `Comprou de novo: ${PRODUTO_PAGAMENTO[ev.produto] ?? ev.produto}${valor}`, detalhe: ev.texto };
      case "etapa":
        return {
          evento: ev,
          titulo: `Etapa: ${ev.deEtapa ? `${ROTULO_ETAPA[ev.deEtapa]} → ` : ""}${ev.paraEtapa ? ROTULO_ETAPA[ev.paraEtapa] : ""}`,
          detalhe: ev.texto,
        };
      case "perdido":
        return { evento: ev, titulo: "Marcado como perdido", detalhe: ev.texto };
      case "proxima_acao":
        return { evento: ev, titulo: "Próxima ação definida", detalhe: ev.texto };
      case "virou_cliente":
        return { evento: ev, titulo: "Virou cliente", detalhe: ev.texto };
      default:
        return { evento: ev, titulo: "Nota", detalhe: ev.texto };
    }
  });
}

export function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Dias inteiros entre duas datas ISO (data de hoje no fuso de Brasília). */
export function diasDesde(isoTimestamp: string, hojeIso: string): number {
  const inicio = Date.UTC(+isoTimestamp.slice(0, 4), +isoTimestamp.slice(5, 7) - 1, +isoTimestamp.slice(8, 10));
  const hoje = Date.UTC(+hojeIso.slice(0, 4), +hojeIso.slice(5, 7) - 1, +hojeIso.slice(8, 10));
  return Math.max(0, Math.round((hoje - inicio) / 86_400_000));
}

export type Indicadores = {
  leadsNoPeriodo: number;
  compraram: number;
  conversao: number | null;
  porOrigem: { origem: Origem; total: number }[];
};

/** Números do topo, sempre sobre os leads já filtrados na tela. Comprou =
 * etapa de compra ou além (exceto perdido). Conversão = compraram / leads. */
export function calcularIndicadores(leads: Lead[]): Indicadores {
  const compraram = leads.filter((l) => l.etapa !== "perdido" && ordemEtapa(l.etapa) >= ordemEtapa("comprou_livro")).length;
  const contagem = new Map<Origem, number>();
  for (const l of leads) contagem.set(l.origem, (contagem.get(l.origem) ?? 0) + 1);
  return {
    leadsNoPeriodo: leads.length,
    compraram,
    conversao: leads.length ? Math.round((compraram / leads.length) * 1000) / 10 : null,
    porOrigem: [...contagem.entries()].map(([origem, total]) => ({ origem, total })).sort((a, b) => b.total - a.total),
  };
}

export type FiltroComercial = { origem: Origem | ""; produto: "livro" | "zatti-hub" | "consultoria" | ""; desde: string | null };

export function filtrarLeads(leads: Lead[], f: FiltroComercial): Lead[] {
  return leads.filter(
    (l) =>
      (!f.origem || l.origem === f.origem) &&
      (!f.produto || chaveProduto(l.produtoInteresse) === f.produto) &&
      (!f.desde || l.criadoEm.slice(0, 10) >= f.desde),
  );
}

/** Link do WhatsApp do lead (com 55 do Brasil). */
export function linkWhatsapp(whatsapp: string): string {
  return `https://wa.me/55${whatsapp.replace(/\D/g, "")}`;
}

/** @ do Instagram normalizado: minúsculo, sem @, sem URL ("@Fulano",
 * "https://www.instagram.com/fulano/?hl=pt" -> "fulano"). A mesma regra de
 * `zh_leads_normalizar_instagram` no banco. Devolve "" se vazio. */
export function normalizarInstagram(entrada: string): string {
  return entrada
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.|m\.)?instagram\.com\//, "")
    .replace(/^@+|[/?#].*$/g, "");
}

export function instagramValido(handle: string): boolean {
  return /^[a-z0-9._]{1,30}$/.test(handle);
}

/** Link do perfil, derivado do @ (não é guardado no banco). */
export function linkInstagram(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

/** Data e hora de um timestamp no horário de Brasília (DD/MM/AAAA HH:MM). */
export function formatarMomentoBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

export function formatarWhatsapp(w: string): string {
  return w.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
}
