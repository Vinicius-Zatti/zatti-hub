import { CalendarioConteudo } from "@/components/conteudo/calendario-conteudo";
import { requireEscritorio } from "@/lib/acesso";
import { carregarPecas } from "@/lib/banco/conteudo";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

export default async function ConteudoPage() {
  await requireEscritorio();
  const pecas = await carregarPecas();
  return <CalendarioConteudo pecas={pecas} hoje={hojeIsoBrasil()} />;
}
