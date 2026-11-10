// Porta de acesso de equipe do Vini (09/11/2026): o que o Vini pode pedir e em que formato.
// Função pura (servidor e teste). Master nunca sai por aqui: só gestão e operacional.

const ID_TEXTO = /^[A-Za-z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAPEIS = new Set(["gestao", "operacional"]);

export type PedidoPorta =
  | { acao: "listar"; organizacaoId: string }
  | {
      acao: "cadastrar";
      organizacaoId: string;
      nome: string;
      email: string;
      whatsapp: string;
      role: "gestao" | "operacional";
      unidadeId: string | null;
    }
  | { acao: "editar"; organizacaoId: string; vinculoId: string; role: "gestao" | "operacional"; unidadeId: string | null }
  | { acao: "revogar" | "reativar"; organizacaoId: string; vinculoId: string }
  | { acao: "renomear"; organizacaoId: string; vinculoId: string; nome: string }
  | { acao: "whatsapp"; organizacaoId: string; vinculoId: string; whatsapp: string };

type Validado = { ok: true; pedido: PedidoPorta } | { ok: false; erro: string };

function texto(valor: unknown, max: number): string | null {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= max ? valor.trim() : null;
}

function unidade(valor: unknown): string | null | undefined {
  if (valor === null || valor === undefined || valor === "") return null;
  return typeof valor === "string" && ID_TEXTO.test(valor) ? valor : undefined;
}

export function validarPedidoPorta(corpo: unknown): Validado {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "corpo_invalido" };
  const c = corpo as Record<string, unknown>;
  const organizacaoId = typeof c.organizacao_id === "string" && ID_TEXTO.test(c.organizacao_id) ? c.organizacao_id : null;
  if (!organizacaoId) return { ok: false, erro: "organizacao_invalida" };

  switch (c.acao) {
    case "listar":
      return { ok: true, pedido: { acao: "listar", organizacaoId } };

    case "cadastrar": {
      const nome = texto(c.nome, 160);
      const email = texto(c.email, 254);
      const whatsapp = texto(c.whatsapp, 30);
      const unidadeId = unidade(c.unidade_id);
      if (!nome) return { ok: false, erro: "nome_invalido" };
      if (!email) return { ok: false, erro: "email_invalido" };
      if (!whatsapp) return { ok: false, erro: "whatsapp_invalido" };
      if (typeof c.role !== "string" || !PAPEIS.has(c.role)) return { ok: false, erro: "papel_invalido" };
      if (unidadeId === undefined) return { ok: false, erro: "unidade_invalida" };
      return {
        ok: true,
        pedido: { acao: "cadastrar", organizacaoId, nome, email, whatsapp, role: c.role as "gestao" | "operacional", unidadeId },
      };
    }

    case "editar":
    case "revogar":
    case "reativar":
    case "renomear":
    case "whatsapp": {
      const vinculoId = typeof c.vinculo_id === "string" && UUID.test(c.vinculo_id) ? c.vinculo_id : null;
      if (!vinculoId) return { ok: false, erro: "vinculo_invalido" };
      if (c.acao === "whatsapp") {
        const whatsapp = texto(c.whatsapp, 30);
        if (!whatsapp) return { ok: false, erro: "whatsapp_invalido" };
        return { ok: true, pedido: { acao: "whatsapp", organizacaoId, vinculoId, whatsapp } };
      }
      if (c.acao === "renomear") {
        const nome = texto(c.nome, 160);
        if (!nome) return { ok: false, erro: "nome_invalido" };
        return { ok: true, pedido: { acao: "renomear", organizacaoId, vinculoId, nome } };
      }
      if (c.acao !== "editar") return { ok: true, pedido: { acao: c.acao, organizacaoId, vinculoId } };
      const unidadeId = unidade(c.unidade_id);
      if (typeof c.role !== "string" || !PAPEIS.has(c.role)) return { ok: false, erro: "papel_invalido" };
      if (unidadeId === undefined) return { ok: false, erro: "unidade_invalida" };
      return {
        ok: true,
        pedido: { acao: "editar", organizacaoId, vinculoId, role: c.role as "gestao" | "operacional", unidadeId },
      };
    }

    default:
      return { ok: false, erro: "acao_invalida" };
  }
}
