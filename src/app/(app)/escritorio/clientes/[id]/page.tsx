import { VisaoGeral } from "@/components/clientes/visao-geral";
import { lerProximosEventos } from "@/lib/agenda/calendario";
import { alertasDoCliente, calcularProgresso, proximaReuniaoDoCliente, tarefasAbertas } from "@/lib/clientes/jornada";
import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { obterCliente } from "./dados";

export default async function VisaoGeralClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cliente = await obterCliente(id);
  const hoje = hojeIsoBrasil();
  const calendario = await lerProximosEventos(hoje);
  const evento = calendario.ok
    ? proximaReuniaoDoCliente(calendario.eventos, cliente.acompanhamento.termoCalendario, hoje)
    : null;

  return (
    <VisaoGeral
      dados={{
        acompanhamento: cliente.acompanhamento,
        progresso: calcularProgresso(cliente.etapas),
        proximaReuniao: !calendario.ok
          ? `Indisponível: ${calendario.motivo}`
          : evento
            ? `${formatarDataBr(evento.data)}${evento.hora ? ` às ${evento.hora}` : ""} - ${evento.titulo}`
            : "Nenhuma reunião marcada nos próximos 60 dias",
        riscos: cliente.itens.filter((i) => i.tipo === "risco" && i.situacao === "aberta"),
        esperandoCliente: tarefasAbertas(cliente.itens, "cliente"),
        esperandoVinicius: tarefasAbertas(cliente.itens, "vinicius"),
        alertas: alertasDoCliente(cliente, hoje),
      }}
    />
  );
}
