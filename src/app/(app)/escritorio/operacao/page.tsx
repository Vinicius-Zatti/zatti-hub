import { PainelOperacao } from "@/components/operacao/painel-operacao";
import { requireEscritorio } from "@/lib/acesso";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { lerOperacao } from "@/lib/operacao/vini";

// Leitura ao vivo do Vini a cada visita: nada de cache entre um ok no WhatsApp e a tela.
export const dynamic = "force-dynamic";

export default async function OperacaoPage() {
  await requireEscritorio();
  const leitura = await lerOperacao();
  return (
    <PainelOperacao
      dados={leitura.ok ? leitura.dados : null}
      aviso={leitura.ok ? null : leitura.mensagem}
      ignorados={leitura.ok ? leitura.ignorados : 0}
      hoje={hojeIsoBrasil()}
    />
  );
}
