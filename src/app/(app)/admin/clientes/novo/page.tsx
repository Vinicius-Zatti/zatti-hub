import { requireMaster } from "@/lib/acesso";
import { FormularioClienteNovo } from "./formulario-cliente-novo";

export const metadata = { title: "Cliente novo - Admin - Zatti Hub" };

/** Só master com AAL2 chega aqui - `requireMaster()` redireciona qualquer
 * outro papel, e `getAcessoAtual()` (chamado por dentro) já redireciona
 * pra /mfa se for master sem AAL2. Barreira de verdade, não decorativa -
 * esconder o item de menu (ver (app)/layout.tsx) é só UX em cima disso. */
export default async function ClienteNovoPage() {
  await requireMaster();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-azul-noite">Cadastrar cliente novo</h1>
      <p className="mt-1 text-sm text-cinza-medio">
        Cria a organização, a primeira unidade e os vínculos de acesso, e envia os convites pelo
        fluxo oficial do Supabase - substitui o processo manual de convite avulso + SQL solto.
      </p>
      <div className="mt-6">
        <FormularioClienteNovo />
      </div>
    </div>
  );
}
