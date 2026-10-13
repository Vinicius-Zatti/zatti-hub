import { requireGarante } from "@/lib/acesso";
import { DICA_PLANOS, lerPagina } from "@/lib/garante/planos";
import { DicaCalculo } from "@/components/dica-calculo";
import { ListaPlanos } from "@/components/garante/lista-planos";
import { carregarPlanos } from "../dados";

/** Planos de ação: um por item fora da meta (na conclusão) e por item crítico
 * fora da meta em checklist que venceu sem concluir. Atrasados no topo.
 * Abertos em páginas de 100 (`?pagina=N`); os totais vêm do banco.
 * Resolver: responsável ou gestão. Descartar: só gestão. Tudo conferido no
 * banco (`garante_resolver_plano`, `garante_descartar_plano`). */
export default async function PlanosPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const acesso = await requireGarante();
  const busca = await searchParams;
  const agora = new Date();
  const dados = await carregarPlanos(acesso, lerPagina(busca.pagina), agora);
  const { totalAbertos, totalAtrasados } = dados;
  const gestao = acesso.role !== "operacional";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Planos de ação</h1>
        <p className="flex flex-wrap items-center gap-1 text-sm text-cinza-medio">
          {totalAbertos} {totalAbertos === 1 ? "aberto" : "abertos"}
          <DicaCalculo rotulo="planos abertos" texto={DICA_PLANOS.abertos} />
          <span>· {totalAtrasados} {totalAtrasados === 1 ? "atrasado" : "atrasados"}</span>
          <DicaCalculo rotulo="planos atrasados" texto={DICA_PLANOS.atrasados} />
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-cinza-medio">
          {gestao ? "Todos os planos da unidade." : "Os planos em que você é o responsável."} De onde vem cada plano
          <DicaCalculo rotulo="origem do plano" texto={DICA_PLANOS.origem} />
        </p>
      </div>
      <ListaPlanos
        planos={dados.planos}
        gestao={gestao}
        agoraIso={agora.toISOString()}
        totalAbertos={totalAbertos}
        totalAtrasados={totalAtrasados}
        totalFechados={dados.totalFechados}
        pagina={dados.pagina}
        totalPaginas={dados.totalPaginas}
      />
    </div>
  );
}
