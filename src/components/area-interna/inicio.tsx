import Link from "next/link";
import { DicaCalculo } from "@/components/dica-calculo";
import type { Inicio } from "@/lib/area-interna/inicio";
import { ROTULO_SAUDE, type Saude } from "@/lib/clientes/tipos";
import { ROTULO_ETAPA } from "@/lib/comercial/funil";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { CARENCIA_DIAS, dataBR } from "@/lib/assinatura/regras";
import type { AssinaturaResumo } from "@/lib/assinatura/servidor";

type Falhas = {
  agenda: boolean;
  calendario: string | null;
  comercial: boolean;
  clientes: boolean;
  conteudo: boolean;
  assinaturas: boolean;
};

const COR_SAUDE: Record<Saude, string> = {
  critica: "bg-vermelho/10 text-vermelho",
  atencao: "bg-ambar/15 text-azul-noite",
  nao_avaliada: "bg-cinza-claro text-cinza-medio",
  boa: "bg-verde/10 text-verde",
};

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()),
  );
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

function Cartao({ titulo, link, rotuloLink, children }: { titulo: string; link: string; rotuloLink: string; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-cinza-claro bg-branco p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-cinza-claro pb-3">
        <h2 className="font-display text-xl font-bold text-azul-noite">{titulo}</h2>
        <Link href={link} className="shrink-0 text-sm font-semibold text-azul-petroleo hover:text-ambar">
          {rotuloLink}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Numero({ valor, rotulo, dica }: { valor: string | number; rotulo: string; dica: string }) {
  return (
    <div className="rounded-lg bg-off-white px-3 py-2">
      <p className="text-2xl font-bold text-azul-noite">{valor}</p>
      <p className="flex items-center gap-1 text-xs text-cinza-medio">
        {rotulo}
        <DicaCalculo rotulo={rotulo} texto={dica} />
      </p>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-sm text-cinza-medio">{texto}</p>;
}

function Falhou() {
  return (
    <p className="rounded-lg bg-vermelho/10 px-3 py-2 text-sm text-vermelho">
      Não foi possível carregar agora. Abra a tela completa pelo link acima.
    </p>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-cinza-medio">{children}</h3>;
}

export function InicioAreaInterna({
  hoje,
  nome,
  inicio,
  assinaturas,
  falhas,
}: {
  hoje: string;
  nome: string | null;
  inicio: Inicio;
  assinaturas: AssinaturaResumo[];
  falhas: Falhas;
}) {
  const { agenda, comercial, clientes, conteudo } = inicio;
  const primeiroNome = nome?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-medium text-cinza-medio">{formatarDataBr(hoje)}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-azul-noite sm:text-4xl">
          {saudacao()}
          {primeiroNome ? `, ${primeiroNome}` : ""}
        </h1>
        <p className="mt-1 text-sm text-cinza-medio">
          Sua área de trabalho na Zatti HUB: o dia, o comercial, os clientes e o conteúdo numa tela só.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Agenda de hoje" link="/agenda/dia" rotuloLink="Abrir o dia">
          {falhas.agenda ? (
            <Falhou />
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <Subtitulo>Compromissos</Subtitulo>
                {agenda.compromissos === null ? (
                  <p className="text-sm text-cinza-medio">Não consegui ler o Calendar: {falhas.calendario}</p>
                ) : agenda.compromissos.length === 0 ? (
                  <Vazio texto="Nenhum compromisso no Calendar hoje." />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {agenda.compromissos.map((c) => (
                      <li key={c.id} className="flex gap-3 text-sm">
                        <span className="w-24 shrink-0 font-semibold text-azul-petroleo">
                          {c.diaInteiro ? "Dia inteiro" : `${c.horaInicio ?? ""}${c.horaFim ? ` - ${c.horaFim}` : ""}`}
                        </span>
                        <span className="min-w-0 break-words text-azul-noite">{c.titulo}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <Subtitulo>
                  Prioridades: {agenda.prioridadesFeitas} de {agenda.prioridades.length} feitas
                  <DicaCalculo
                    rotulo="Prioridades feitas"
                    texto="Prioridades de hoje marcadas como feitas na Agenda, sobre o total de prioridades do dia (teto de 4)."
                  />
                </Subtitulo>
                {agenda.prioridades.length === 0 ? (
                  <Vazio texto="Nenhuma prioridade marcada para hoje." />
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {agenda.prioridades.map((p) => (
                      <li
                        key={p.id}
                        className={`break-words text-sm ${p.situacao === "feita" ? "text-cinza-medio line-through" : "text-azul-noite"}`}
                      >
                        {p.titulo}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Comercial" link="/escritorio/comercial" rotuloLink="Abrir o funil">
          {falhas.comercial ? (
            <Falhou />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Numero
                  valor={comercial.falarHojeTotal}
                  rotulo="Falar hoje"
                  dica="Leads ativos com próxima ação marcada para hoje ou para antes (atrasados). Perdido e Consultoria fechada ficam fora."
                />
                <Numero valor={comercial.ativos} rotulo="No funil" dica="Leads em qualquer etapa, menos Perdido e Consultoria fechada." />
                <Numero valor={comercial.novos7Dias} rotulo="Novos em 7 dias" dica="Leads criados de 6 dias atrás até hoje." />
                <Numero
                  valor={comercial.mes.conversao === null ? "-" : `${comercial.mes.conversao.toLocaleString("pt-BR")}%`}
                  rotulo="Conversão do mês"
                  dica={`Leads criados neste mês que compraram (Comprou livro ou etapa depois, menos Perdido), divididos pelos leads criados no mês: ${comercial.mes.compraram} de ${comercial.mes.leadsNoPeriodo}.`}
                />
              </div>
              {comercial.falarHoje.length === 0 ? (
                <Vazio texto="Ninguém para chamar hoje." />
              ) : (
                <ul className="flex flex-col divide-y divide-cinza-claro">
                  {comercial.falarHoje.map((l) => {
                    const atrasado = l.proximaAcaoEm !== null && l.proximaAcaoEm < hoje;
                    return (
                      <li key={l.id} className="py-2">
                        <Link
                          href={`/escritorio/comercial/${l.id}`}
                          className="flex flex-col gap-0.5 hover:text-ambar sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                        >
                          <span className="min-w-0 truncate text-sm font-semibold text-azul-noite">
                            {l.nome || l.negocio || (l.instagram ? `@${l.instagram}` : "Lead sem nome")}
                          </span>
                          <span className={`shrink-0 text-xs ${atrasado ? "font-semibold text-vermelho" : "text-cinza-medio"}`}>
                            {ROTULO_ETAPA[l.etapa]} - {atrasado ? `atrasado desde ${formatarDataBr(l.proximaAcaoEm!)}` : "hoje"}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {comercial.falarHojeTotal > comercial.falarHoje.length && (
                <p className="text-xs text-cinza-medio">E mais {comercial.falarHojeTotal - comercial.falarHoje.length} no funil.</p>
              )}
            </div>
          )}
        </Cartao>

        <Cartao titulo="Clientes" link="/escritorio/clientes" rotuloLink="Abrir a carteira">
          {falhas.clientes ? (
            <Falhou />
          ) : clientes.length === 0 ? (
            <Vazio texto="Nenhum cliente em acompanhamento." />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-cinza-claro">
                {clientes.map((c) => (
                  <li key={c.id} className="py-2">
                    <Link href={`/escritorio/clientes/${c.id}`} className="flex flex-col gap-1 hover:text-ambar">
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold text-azul-noite">{c.nome}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${COR_SAUDE[c.saude]}`}>
                          {ROTULO_SAUDE[c.saude]}
                        </span>
                      </span>
                      <span className="text-xs text-cinza-medio">
                        Jornada {c.progresso}%
                        {c.alertas.length > 0 && (
                          <span className="font-semibold text-vermelho">
                            {" "}- {c.alertas[0]}
                            {c.alertas.length > 1 ? ` (+${c.alertas.length - 1})` : ""}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1 text-xs text-cinza-medio">
                Como ler a jornada e os alertas
                <DicaCalculo
                  rotulo="Jornada e alertas"
                  texto="Jornada = etapas concluídas mais a parte feita do checklist das etapas em andamento, sobre o total de etapas. Alertas: tarefa vencida, risco aberto, etapa bloqueada ou com prazo vencido, onboarding esperando decisão e marco atrasado. A saúde é a que você avaliou na ficha do cliente."
                />
              </p>
            </>
          )}
        </Cartao>

        <Cartao titulo="Assinaturas do app" link="/acessos" rotuloLink="Abrir acessos">
          {falhas.assinaturas ? (
            <Falhou />
          ) : assinaturas.length === 0 ? (
            <Vazio texto="Nenhuma assinatura vencendo nos próximos 30 dias." />
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-cinza-claro">
                {assinaturas.map((a) => (
                  <li key={a.organizacao_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-azul-noite">{a.restaurante}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        a.dias < 0 ? "bg-vermelho/10 text-vermelho" : a.dias <= 7 ? "bg-ambar/15 text-azul-noite" : "bg-cinza-claro text-cinza-medio"
                      }`}
                    >
                      {a.dias < -CARENCIA_DIAS
                        ? `Travada desde ${dataBR(a.vigencia_fim)}`
                        : a.dias < 0
                          ? `Venceu em ${dataBR(a.vigencia_fim)}`
                          : a.dias === 0
                            ? "Vence hoje"
                            : `Vence em ${a.dias} dia(s)`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex items-center gap-1 text-xs text-cinza-medio">
                Como ler
                <DicaCalculo
                  rotulo="Assinaturas do app"
                  texto={`Contas da compra pelo site com fim da vigência em até 30 dias ou já vencidas, as mais urgentes primeiro. Depois de vencer, o cliente usa por mais ${CARENCIA_DIAS} dias com aviso e depois o app trava, sem apagar dado. Os avisos de renovação saem sozinhos pelo WhatsApp 30, 7 e 1 dia antes e no dia.`}
                />
              </p>
            </>
          )}
        </Cartao>

        <Cartao titulo="Conteúdo" link="/escritorio/conteudo" rotuloLink="Abrir o calendário">
          {falhas.conteudo ? (
            <Falhou />
          ) : (
            <div className="flex flex-col gap-4">
              {conteudo.atrasadas > 0 && (
                <p className="flex items-center gap-1 rounded-lg bg-ambar/15 px-3 py-2 text-sm text-azul-noite">
                  {conteudo.atrasadas} peça(s) com data passada ainda sem publicar.
                  <DicaCalculo
                    rotulo="Peças atrasadas"
                    texto="Peças com data antes de hoje e status diferente de Publicado Teste e Publicado todos."
                  />
                </p>
              )}
              {[
                { titulo: "Hoje", pecas: conteudo.hoje },
                { titulo: "Amanhã", pecas: conteudo.amanha },
              ].map((grupo) => (
                <div key={grupo.titulo}>
                  <Subtitulo>{grupo.titulo}</Subtitulo>
                  {grupo.pecas.length === 0 ? (
                    <Vazio texto="Nada no calendário." />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {grupo.pecas.map((p) => (
                        <li key={p.id} className="flex flex-col text-sm sm:flex-row sm:justify-between sm:gap-3">
                          <span className="min-w-0 break-words text-azul-noite">
                            {p.hora ? <span className="font-semibold text-azul-petroleo">{p.hora} </span> : null}
                            {p.titulo}
                          </span>
                          <span className="shrink-0 text-xs text-cinza-medio">{[p.formato, p.status].filter(Boolean).join(" - ")}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}
