import { redirect } from "next/navigation";
import { getAcessoAtual } from "@/lib/acesso";
import { getAssinaturaAtual } from "@/lib/assinatura/app";
import { CARENCIA_DIAS } from "@/lib/assinatura/regras";
import { WHATSAPP_VINICIUS } from "@/lib/suporte";
import { signOutAction } from "@/lib/supabase/actions";

// Vigência anual (15/10/2026): depois de vencer e passar a carência, o app trava aqui. Nenhum dado
// é apagado; renovando, tudo volta como estava.
export const dynamic = "force-dynamic";

export default async function AssinaturaVencidaPage() {
  const acesso = await getAcessoAtual();
  const assinatura = await getAssinaturaAtual(acesso.organizacaoId);
  if (acesso.role === "master" || assinatura.situacao.tipo !== "bloqueada") redirect("/");
  const podeGerir = acesso.role !== "operacional";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Assinatura vencida</h1>
      <p className="max-w-md text-sm text-cinza-medio">
        A assinatura do Zatti Hub do {acesso.organizacaoNome} venceu há mais de {CARENCIA_DIAS} dias e o acesso
        foi pausado. Seus dados continuam guardados: renovando, tudo volta como estava.
      </p>
      {podeGerir && assinatura.link ? (
        <a
          href={assinatura.link}
          className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo"
        >
          Renovar assinatura
        </a>
      ) : (
        <p className="max-w-md text-sm text-cinza-medio">Fale com a gestão do restaurante para renovar.</p>
      )}
      <a
        href={`https://wa.me/${WHATSAPP_VINICIUS}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-azul-petroleo underline"
      >
        Falar com a Zatti no WhatsApp
      </a>
      <form action={signOutAction}>
        <button type="submit" className="text-sm text-cinza-medio underline">
          Sair
        </button>
      </form>
    </div>
  );
}
