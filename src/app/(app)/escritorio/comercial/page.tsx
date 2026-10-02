import { Funil } from "@/components/comercial/funil";
import { requireEscritorio } from "@/lib/acesso";
import { carregarLeads } from "@/lib/banco/comercial";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

export default async function ComercialPage() {
  await requireEscritorio();
  const leads = await carregarLeads();
  return <Funil leads={leads} hoje={hojeIsoBrasil()} />;
}
