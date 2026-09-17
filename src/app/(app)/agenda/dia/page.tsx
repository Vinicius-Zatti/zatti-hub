import { requireAgenda } from "@/lib/acesso";
import { lerCompromissosDoDia } from "@/lib/agenda/calendario";
import { montarDia } from "@/lib/agenda/dia";
import { diaDaSemanaIso } from "@/lib/agenda/grade";
import {
  listarExecucoesDoDia,
  listarRotinasDoDia,
  listarTarefasDoDia,
  obterPublicacaoDaGrade,
} from "@/lib/banco/agenda";
import { PainelDia } from "@/components/agenda/painel-dia";
import { dataIsoValida } from "@/lib/validacao";

export const dynamic = "force-dynamic";

/** Data local do Brasil em ISO, sem depender do fuso do servidor (Vercel roda
 * em UTC, e perto da meia-noite isso abriria o dia errado). */
function hojeBrasilIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export default async function AgendaDiaPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const acesso = await requireAgenda();
  const params = await searchParams;

  // `?data=` vem da URL, então é entrada do usuário como qualquer outra: usa a
  // mesma validação de calendário das Server Actions, não só o formato.
  // "2026-02-31" casa com a máscara e não existe. Data inválida não derruba a
  // página nem abre outro dia calado: volta pra hoje e a tela diz o porquê.
  const dataPedida = params.data?.trim();
  const dataValida = Boolean(dataPedida) && dataIsoValida(dataPedida as string);
  const data = dataValida ? (dataPedida as string) : hojeBrasilIso();
  const avisoData = dataPedida && !dataValida ? `"${dataPedida}" não é uma data válida. Abri o dia de hoje.` : null;

  const [rotinas, tarefas, execucoes, leituraCalendario, publicadoEm] = await Promise.all([
    listarRotinasDoDia(acesso.userId, diaDaSemanaIso(data)),
    listarTarefasDoDia(acesso.userId, data),
    listarExecucoesDoDia(acesso.userId, data),
    lerCompromissosDoDia(data),
    obterPublicacaoDaGrade(acesso.userId),
  ]);

  const dia = montarDia({
    rotinas,
    tarefas,
    execucoes,
    compromissos: leituraCalendario.ok ? leituraCalendario.eventos : null,
  });

  return (
    <PainelDia
      data={data}
      hoje={hojeBrasilIso()}
      dia={dia}
      rotinas={rotinas}
      gradePublicadaEm={publicadoEm}
      avisoData={avisoData}
      avisoCalendario={leituraCalendario.ok ? null : leituraCalendario.motivo}
    />
  );
}
