import { InicioAreaInterna } from "@/components/area-interna/inicio";
import { requireEscritorio } from "@/lib/acesso";
import { lerCompromissosDoDia } from "@/lib/agenda/calendario";
import { montarDia } from "@/lib/agenda/dia";
import { diaDaSemanaIso } from "@/lib/agenda/grade";
import { montarInicio } from "@/lib/area-interna/inicio";
import { listarExecucoesDoDia, listarRotinasDoDia, listarTarefasDoDia } from "@/lib/banco/agenda";
import { carregarClientes } from "@/lib/banco/clientes";
import { carregarLeads } from "@/lib/banco/comercial";
import { carregarPecas } from "@/lib/banco/conteudo";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

export const dynamic = "force-dynamic";

/** Uma fonte fora do ar não derruba o Início: a seção dela avisa e as outras
 * aparecem (o erro fica no log do servidor). */
async function ouNull<T>(rotulo: string, promessa: Promise<T>): Promise<T | null> {
  try {
    return await promessa;
  } catch (erro) {
    console.error(`[inicio] falha ao carregar ${rotulo}:`, erro);
    return null;
  }
}

export default async function InicioPage() {
  const acesso = await requireEscritorio();
  const hoje = hojeIsoBrasil();

  const [rotinas, tarefas, execucoes, calendario, leads, clientes, pecas] = await Promise.all([
    ouNull("rotinas", listarRotinasDoDia(acesso.userId, diaDaSemanaIso(hoje))),
    ouNull("tarefas", listarTarefasDoDia(acesso.userId, hoje)),
    ouNull("execuções", listarExecucoesDoDia(acesso.userId, hoje)),
    lerCompromissosDoDia(hoje),
    ouNull("leads", carregarLeads()),
    ouNull("clientes", carregarClientes()),
    ouNull("peças", carregarPecas()),
  ]);

  const agendaOk = rotinas !== null && tarefas !== null && execucoes !== null;
  const dia = montarDia({
    rotinas: rotinas ?? [],
    tarefas: tarefas ?? [],
    execucoes: execucoes ?? [],
    compromissos: calendario.ok ? calendario.eventos : null,
  });

  const inicio = montarInicio({
    hoje,
    compromissos: calendario.ok ? dia.compromissos : null,
    prioridades: dia.prioridades,
    leads: leads ?? [],
    clientes: clientes ?? [],
    pecas: pecas ?? [],
  });

  return (
    <InicioAreaInterna
      hoje={hoje}
      nome={acesso.usuarioNome}
      inicio={inicio}
      falhas={{
        agenda: !agendaOk,
        calendario: calendario.ok ? null : calendario.motivo,
        comercial: leads === null,
        clientes: clientes === null,
        conteudo: pecas === null,
      }}
    />
  );
}
