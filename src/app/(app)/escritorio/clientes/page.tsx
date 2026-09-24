import { Carteira, type LinhaCarteira } from "@/components/clientes/carteira";
import { requireEscritorio } from "@/lib/acesso";
import { lerProximosEventos } from "@/lib/agenda/calendario";
import { carregarClientes, listarOrganizacoesDaCarteira } from "@/lib/banco/clientes";
import { alertasDoCliente, calcularProgresso, proximaReuniaoDoCliente, tarefasAbertas } from "@/lib/clientes/jornada";
import { ROTULO_ETAPA } from "@/lib/clientes/tipos";
import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

export default async function CarteiraClientesPage() {
  await requireEscritorio();
  const hoje = hojeIsoBrasil();
  const [organizacoes, clientes, calendario] = await Promise.all([
    listarOrganizacoesDaCarteira(),
    carregarClientes(),
    lerProximosEventos(hoje),
  ]);
  const porOrganizacao = new Map(clientes.map((c) => [c.acompanhamento.organizacaoId, c]));

  const linhas: LinhaCarteira[] = organizacoes.map((org) => {
    const cliente = porOrganizacao.get(org.id);
    if (!cliente) {
      return {
        organizacaoId: org.id, nome: org.nome, acompanhamentoId: null, fase: "", progresso: 0,
        saude: "nao_avaliada", proximaReuniao: "", proximoMarco: "", pendenciasCliente: 0,
        pendenciasVinicius: 0, alertas: [],
      };
    }
    const a = cliente.acompanhamento;
    const evento = calendario.ok ? proximaReuniaoDoCliente(calendario.eventos, a.termoCalendario, hoje) : null;
    return {
      organizacaoId: org.id,
      nome: org.nome,
      acompanhamentoId: a.id,
      fase: ROTULO_ETAPA[a.etapaAtual],
      progresso: calcularProgresso(cliente.etapas),
      saude: a.saude,
      proximaReuniao: !calendario.ok
        ? "Calendar indisponível"
        : evento
          ? `${formatarDataBr(evento.data)}${evento.hora ? ` ${evento.hora}` : ""}`
          : a.termoCalendario ? "Sem reunião marcada" : "Defina o termo do Calendar",
      proximoMarco: a.proximoMarco + (a.proximoMarcoData ? ` (${formatarDataBr(a.proximoMarcoData)})` : ""),
      pendenciasCliente: tarefasAbertas(cliente.itens, "cliente").length,
      pendenciasVinicius: tarefasAbertas(cliente.itens, "vinicius").length,
      alertas: alertasDoCliente(cliente, hoje),
    };
  });

  return <Carteira linhas={linhas} avisoCalendario={calendario.ok ? null : calendario.motivo} />;
}
