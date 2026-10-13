import { requireGarante } from "@/lib/acesso";
import { DICA_GARANTE, estadoJanela, hojeOperacao, ontemOperacao } from "@/lib/garante/regras";
import { CartaoAgenda } from "@/components/garante/cartao-agenda";
import { DicaCalculo } from "@/components/dica-calculo";
import { carregarAgenda } from "./dados";

/** Hoje: os checklists do dia de quem está logado (gestão vê todos). Os de
 * ontem que ficaram abertos aparecem embaixo enquanto a janela deles (horário
 * limite + tolerância de atraso da unidade) não fecha. */
export default async function GaranteHojePage() {
  const acesso = await requireGarante();
  const [agenda, agendaOntem] = await Promise.all([
    carregarAgenda(acesso, hojeOperacao()),
    carregarAgenda(acesso, ontemOperacao()),
  ]);
  const agora = new Date();
  const abertosOntem = agendaOntem.filter((l) => l.situacao !== "concluida" && estadoJanela(l.abreEm, l.fechaEm, agora) !== "fechada");
  const feitos = agenda.filter((l) => l.situacao === "concluida").length;
  const gestao = acesso.role !== "operacional";
  const dataTexto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Checklist Garante</h1>
        <p className="flex flex-wrap items-center gap-1 text-sm text-cinza-medio">
          {dataTexto} · {feitos} de {agenda.length} concluídos
          <DicaCalculo rotulo="checklists concluídos hoje" texto={DICA_GARANTE.diaConcluido} />
          {agenda.length > 0 && feitos === agenda.length && " · Dia 100%"}
        </p>
      </div>
      {agenda.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum checklist para hoje.
          {gestao && " Monte um a partir dos POPs em Modelos e publicação."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agenda.map((linha) => (
            <CartaoAgenda key={linha.publicacaoId} linha={linha} gestao={gestao} />
          ))}
        </div>
      )}

      {abertosOntem.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-azul-noite">Ficaram abertos ontem</h2>
            <p className="text-xs text-cinza-medio">
              Ainda dá para terminar até o fim da tolerância de atraso de cada um (aparece no cartão). Depois disso ficam só para consulta no Quadro do dia.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {abertosOntem.map((linha) => (
              <CartaoAgenda key={linha.publicacaoId} linha={linha} gestao={gestao} dia="ontem" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
