import { redirect } from "next/navigation";

// Estoque mensal deixou de ser página própria - os dados agora ficam na
// seção "Dados Complementares da DRE", dentro da própria página da DRE.
// Rota antiga preservada só como redirecionamento (link salvo, atalho antigo
// etc. continuam funcionando).
export default function EstoqueMensalRedirecionamento() {
  redirect("/financeiro-gerencial/dre#dados-complementares-da-dre");
}
