import { requireGarante } from "@/lib/acesso";
import { DICA_GARANTE, dataDoDiaAgenda, mostrarNaAgenda } from "@/lib/garante/regras";
import { CartaoAgenda } from "@/components/garante/cartao-agenda";
import { DicaCalculo } from "@/components/dica-calculo";
import { carregarAgenda } from "./dados";
import { AvisoSomenteVer } from "@/components/aviso-somente-ver";

/** Hoje: os checklists do dia de quem está logado (gestão vê todos). Os de
 * ontem que ficaram abertos aparecem embaixo enquanto a janela deles (horário
 * limite + tolerância de atraso da unidade) não fecha. Os de amanhã aparecem
 * quando a antecedência já abriu (ex.: checklist de 01h começa às 23h). */
export default async function GaranteHojePage() {
  const acesso = await requireGarante();
  const agora = new Date();
  const [agenda, agendaOntem, agendaAmanha] = await Promise.all([
    carregarAgenda(acesso, dataDoDiaAgenda("hoje", agora)),
    carregarAgenda(acesso, dataDoDiaAgenda("ontem", agora)),
    carregarAgenda(acesso, dataDoDiaAgenda("amanha", agora)),
  ]);
  const abertosOntem = agendaOntem.filter((l) => mostrarNaAgenda("ontem", l, agora));
  const jaAbertosAmanha = agendaAmanha.filter((l) => mostrarNaAgenda("amanha", l, agora));
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
      <AvisoSomenteVer acesso={acesso} modulo="garante" />
      {agenda.length === 0 ? (
        <p data-tour="garante-checklists" className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum checklist para hoje.
          {gestao && " Monte um a partir dos POPs em Modelos e publicação."}
        </p>
      ) : (
        <div data-tour="garante-checklists" className="grid gap-3 md:grid-cols-2">
          {agenda.map((linha) => (
            <CartaoAgenda key={linha.publicacaoId} linha={linha} gestao={gestao} />
          ))}
        </div>
      )}

      {jaAbertosAmanha.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-azul-noite">Já dá para começar os de amanhã</h2>
            <p className="text-xs text-cinza-medio">
              A antecedência da unidade já abriu para estes checklists de amanhã (o horário de abertura aparece no cartão).
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {jaAbertosAmanha.map((linha) => (
              <CartaoAgenda key={linha.publicacaoId} linha={linha} gestao={gestao} dia="amanha" />
            ))}
          </div>
        </section>
      )}

      {abertosOntem.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-azul-noite">Ficaram abertos ontem</h2>
            <p className="text-xs text-cinza-medio">
              Ainda dá para terminar até o fim da janela de cada um (aparece no cartão). Depois disso ficam só para consulta no Quadro do dia.
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
