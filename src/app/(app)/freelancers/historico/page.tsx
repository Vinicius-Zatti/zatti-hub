import { temPermissao } from "@/lib/acesso";
import { requireFreelancers } from "@/lib/freelancers/acesso";
import { carregarConfiguracao, listarCheckins, LIMITE_CHECKINS } from "@/lib/freelancers/servidor";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { resumoDoDia } from "@/lib/freelancers/regras";
import { ResumoFreelancers } from "@/components/freelancers/resumo";
import { TabelaCheckins } from "@/components/freelancers/tabela-checkins";
import { LancarPendentes } from "@/components/freelancers/lancar-pendentes";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Histórico: diárias de um período (padrão: do dia 1 do mês até hoje), com os totais. Pendente
 * de outro dia também se confere por aqui. */
export default async function FreelancersHistoricoPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const acesso = await requireFreelancers();
  const params = await searchParams;
  const hoje = hojeIsoBrasil();
  const ate = params.ate && DIA.test(params.ate) && params.ate <= hoje ? params.ate : hoje;
  const de = params.de && DIA.test(params.de) && params.de <= ate ? params.de : `${ate.slice(0, 8)}01`;
  const [{ checkins, cortado }, configuracao] = await Promise.all([listarCheckins(acesso, de, ate), carregarConfiguracao(acesso)]);
  const podeEditar = temPermissao(acesso, "freelancers", "editar");
  const semTitulo = checkins.filter((c) => c.estado === "conferido" && !c.lancamentoId && !c.tituloGeradoEm).length;
  const campo = "rounded-md border border-cinza-claro bg-branco px-3 py-2 text-base sm:text-sm";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Histórico de diárias</h1>
        <p className="text-sm text-cinza-medio">Todas as diárias do período, conferidas ou não. Uma pendente de outro dia também se confere por aqui.</p>
      </div>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          De
          <input type="date" name="de" defaultValue={de} max={hoje} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          Até
          <input type="date" name="ate" defaultValue={ate} max={hoje} className={campo} />
        </label>
        <button type="submit" className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco">
          Mostrar este período
        </button>
      </form>
      <ResumoFreelancers resumo={resumoDoDia(checkins)} periodo="periodo" />
      {cortado && <p className="text-sm font-semibold text-ambar">O período tem mais de {LIMITE_CHECKINS} diárias. Diminua as datas para ver todas.</p>}
      {podeEditar && semTitulo > 0 && <LancarPendentes quantidade={semTitulo} />}
      <TabelaCheckins checkins={checkins} diariaPadrao={configuracao?.diariaPadrao ?? null} podeEditar={podeEditar} mostrarDia />
    </div>
  );
}
