import { requireGarante } from "@/lib/acesso";
import { DICA_PLANOS, situacaoPlanoNaTela } from "@/lib/garante/planos";
import { DicaCalculo } from "@/components/dica-calculo";
import { ListaPlanos } from "@/components/garante/lista-planos";
import { carregarPlanos } from "../dados";

/** Planos de ação: um por item fora da meta (na conclusão) e por item crítico
 * fora da meta em checklist que venceu sem concluir. Atrasados no topo.
 * Resolver: responsável ou gestão. Descartar: só gestão. Tudo conferido no
 * banco (`garante_resolver_plano`, `garante_descartar_plano`). */
export default async function PlanosPage() {
  const acesso = await requireGarante();
  const planos = await carregarPlanos(acesso);
  const agora = new Date();
  const abertos = planos.filter((p) => p.situacao === "aberto");
  const atrasados = abertos.filter((p) => situacaoPlanoNaTela(p.situacao, p.prazo, agora) === "atrasado").length;
  const gestao = acesso.role !== "operacional";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Planos de ação</h1>
        <p className="flex flex-wrap items-center gap-1 text-sm text-cinza-medio">
          {abertos.length} {abertos.length === 1 ? "aberto" : "abertos"}
          <DicaCalculo rotulo="planos abertos" texto={DICA_PLANOS.abertos} />
          <span>· {atrasados} {atrasados === 1 ? "atrasado" : "atrasados"}</span>
          <DicaCalculo rotulo="planos atrasados" texto={DICA_PLANOS.atrasados} />
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-cinza-medio">
          {gestao ? "Todos os planos da unidade." : "Os planos em que você é o responsável."} De onde vem cada plano
          <DicaCalculo rotulo="origem do plano" texto={DICA_PLANOS.origem} />
        </p>
      </div>
      <ListaPlanos planos={planos} gestao={gestao} agoraIso={agora.toISOString()} />
    </div>
  );
}
