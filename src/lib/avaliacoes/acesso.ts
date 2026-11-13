import "server-only";
import { redirect } from "next/navigation";
import { getAcessoAtual, temPermissao, type AcessoAtual } from "@/lib/acesso";
import { lerAvaliacoesHabilitado } from "./servidor";

// Barreira do módulo Avaliações (primeira camada; o banco repete em
// `usuario_pode_usar_avaliacoes`). Gestão e master, módulo ligado na unidade e, por exceção em
// Equipe > Permissões, nunca "sem acesso". A operação não vê (padrão "sem acesso", teto igual).

export async function requireAvaliacoes(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (acesso.areaInterna || (acesso.role !== "gestao" && acesso.role !== "master")) redirect("/painel");
  if (!temPermissao(acesso, "avaliacoes", "ver")) redirect("/painel");
  if (!(await lerAvaliacoesHabilitado(acesso.unidadeId))) redirect("/painel");
  return acesso;
}

/** Telas e ações que gravam (marca, perguntas, logo, quem recebe o alerta): "editar". */
export async function requireAvaliacoesEditar(): Promise<AcessoAtual> {
  const acesso = await requireAvaliacoes();
  if (!temPermissao(acesso, "avaliacoes", "editar")) redirect("/avaliacoes");
  return acesso;
}
