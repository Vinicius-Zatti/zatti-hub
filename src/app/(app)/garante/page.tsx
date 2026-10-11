import { requireGarante } from "@/lib/acesso";
import { hojeOperacao } from "@/lib/garante/regras";
import { CartaoAgenda } from "@/components/garante/cartao-agenda";
import { carregarAgenda } from "./dados";

/** Hoje: os checklists do dia de quem está logado (gestão vê todos). */
export default async function GaranteHojePage() {
  const acesso = await requireGarante();
  const hoje = hojeOperacao();
  const agenda = await carregarAgenda(acesso, hoje);
  const feitos = agenda.filter((l) => l.situacao === "concluida").length;
  const dataTexto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Checklist Garante</h1>
        <p className="text-sm text-cinza-medio">
          {dataTexto} · {feitos} de {agenda.length} concluídos
          {agenda.length > 0 && feitos === agenda.length && " · Dia 100%"}
        </p>
      </div>
      {agenda.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum checklist para hoje.
          {acesso.role !== "operacional" && " Monte um a partir dos POPs em Modelos e publicação."}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agenda.map((linha) => (
            <CartaoAgenda key={linha.publicacaoId} linha={linha} gestao={acesso.role !== "operacional"} />
          ))}
        </div>
      )}
    </div>
  );
}
