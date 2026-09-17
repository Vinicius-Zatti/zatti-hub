import { requireAgenda } from "@/lib/acesso";
import { horaCurta, nomeDiaSemana } from "@/lib/agenda/grade";
import { listarRotinasDaSemana, obterPublicacaoDaGrade } from "@/lib/banco/agenda";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import type { RotinaAgenda } from "@/lib/agenda/tipos";

export const dynamic = "force-dynamic";

const ROTULO_TIPO: Record<RotinaAgenda["tipo"], string> = {
  bloco: "Bloco de trabalho",
  rotina: "Rotina",
  compromisso: "Reunião fixa",
  pessoal: "Pessoal",
};

function faixa(rotina: RotinaAgenda): string {
  if (!rotina.horaInicio) return rotina.horarioTexto;
  return rotina.horaFim ? `${horaCurta(rotina.horaInicio)}-${horaCurta(rotina.horaFim)}` : horaCurta(rotina.horaInicio);
}

/** Leitura da grade publicada. Não é editável aqui de propósito: a fonte
 * oficial da rotina permanente continua sendo `_conhecimento/agenda-semanal.md`
 * no Cérebro do Gestor, e esta tela é a publicação dela. Mudar a rotina é
 * mudar o arquivo e rodar `npm run agenda:publicar` (mais a série recorrente
 * do Google Calendar, na mesma passada). */
export default async function AgendaSemanaPage() {
  const acesso = await requireAgenda();
  const [rotinas, publicadoEm] = await Promise.all([
    listarRotinasDaSemana(acesso.userId),
    obterPublicacaoDaGrade(acesso.userId),
  ]);

  const dias = [...new Set(rotinas.map((r) => r.diaSemana))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Rotina da semana</h1>
        <p className="text-sm text-cinza-medio">
          Publicação da agenda semanal do Cérebro do Gestor. Para mudar, edite o arquivo lá e rode{" "}
          <code>npm run agenda:publicar</code> - e atualize a série recorrente do Google Calendar junto.
        </p>
      </div>

      {rotinas.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhuma rotina publicada ainda.
        </p>
      ) : (
        <>
          <p className="text-xs text-cinza-medio">
            Publicada em {publicadoEm ? formatarDataBr(publicadoEm.slice(0, 10)) : "data desconhecida"}.
          </p>
          {dias.map((dia) => (
            <div key={dia} className="flex flex-col gap-2">
              <h2 className="font-display text-lg font-bold capitalize text-azul-noite">{nomeDiaSemana(dia)}</h2>
              <TabelaRolavel>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-azul-petroleo text-branco">
                      <Th larguraFixa="110px">Horário</Th>
                      <Th>Atividade</Th>
                      <Th larguraFixa="140px">Tipo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotinas
                      .filter((r) => r.diaSemana === dia)
                      .map((rotina) => (
                        <tr key={rotina.id} className="border-b border-cinza-claro">
                          <td className="px-3 py-2 font-mono text-xs text-cinza-medio">{faixa(rotina)}</td>
                          <td className="max-w-0 truncate px-3 py-2 text-azul-noite" title={rotina.rotulo}>
                            {rotina.rotulo}
                          </td>
                          <td className="px-3 py-2 text-xs text-cinza-medio">{ROTULO_TIPO[rotina.tipo]}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </TabelaRolavel>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
