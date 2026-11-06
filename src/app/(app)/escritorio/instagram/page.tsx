import { PainelInstagram } from "@/components/instagram/painel-instagram";
import { requireEscritorio } from "@/lib/acesso";
import { carregarPecasEntre } from "@/lib/banco/conteudo";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { intervaloSemana, ordenarPecas } from "@/lib/instagram/painel";
import type { PecaSemana } from "@/lib/instagram/tipos";
import { lerInstagram } from "@/lib/instagram/vini";

// Leitura ao vivo do Vini a cada visita, como a Operação.
export const dynamic = "force-dynamic";

export default async function InstagramPage() {
  await requireEscritorio();
  const hoje = hojeIsoBrasil();
  const { inicio, fim } = intervaloSemana(hoje);
  const [leitura, pecas] = await Promise.all([
    lerInstagram(),
    carregarPecasEntre(inicio, fim).then(
      (p): PecaSemana[] | null => ordenarPecas(p),
      () => null,
    ),
  ]);
  return (
    <PainelInstagram
      dados={leitura.ok ? leitura.dados : null}
      aviso={leitura.ok ? null : leitura.mensagem}
      ignorados={leitura.ok ? leitura.ignorados : 0}
      pecasSemana={pecas}
      hoje={hoje}
      agoraMs={leitura.ok ? leitura.lidoEm : 0}
    />
  );
}
