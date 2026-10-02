import { notFound } from "next/navigation";
import { FichaLead } from "@/components/comercial/ficha-lead";
import { requireEscritorio } from "@/lib/acesso";
import { carregarLead, listarOrganizacoesAtivas } from "@/lib/banco/comercial";
import { idUuidSchema } from "@/lib/validacao";

export default async function FichaLeadPage({ params }: { params: Promise<{ id: string }> }) {
  await requireEscritorio();
  const { id } = await params;
  if (!idUuidSchema.safeParse(id).success) notFound();
  const [dados, organizacoes] = await Promise.all([carregarLead(id), listarOrganizacoesAtivas()]);
  if (!dados) notFound();
  return <FichaLead lead={dados.lead} eventos={dados.eventos} organizacoes={organizacoes} />;
}
