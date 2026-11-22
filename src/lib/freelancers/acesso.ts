import "server-only";
import { redirect } from "next/navigation";
import { getAcessoAtual, temPermissao, type AcessoAtual } from "@/lib/acesso";
import { lerFreelancersHabilitado } from "./servidor";

// Barreira do módulo Freelancers (primeira camada; o banco repete em
// `usuario_pode_usar_freelancers`). Gestão e master por padrão; a operação só quando o dono
// liberou em Equipe > Permissões. Módulo ligado na unidade.

export async function requireFreelancers(): Promise<AcessoAtual> {
  const acesso = await getAcessoAtual();
  if (acesso.areaInterna) redirect("/inicio");
  if (!temPermissao(acesso, "freelancers", "ver")) redirect("/painel");
  if (!(await lerFreelancersHabilitado(acesso.unidadeId))) redirect("/painel");
  return acesso;
}

/** Telas que só servem para gravar (Configurar): "editar". */
export async function requireFreelancersEditar(): Promise<AcessoAtual> {
  const acesso = await requireFreelancers();
  if (!temPermissao(acesso, "freelancers", "editar")) redirect("/freelancers");
  return acesso;
}
