import "server-only";
import { google } from "googleapis";
import type { CompromissoCalendario, LeituraCalendario } from "@/lib/agenda/tipos";

/** Leitura do Google Calendar de Vinícius para montar a seção Agenda do dia.
 *
 * Usa a mesma conta de serviço das planilhas (`GOOGLE_SHEETS_*`), só que com
 * escopo de leitura de agenda. Para funcionar, a agenda precisa estar
 * compartilhada com o e-mail da conta de serviço - conta de serviço não
 * enxerga agenda pessoal por padrão. Enquanto isso não estiver feito, a
 * leitura falha de forma explícita e a tela mostra o motivo, em vez de exibir
 * um dia vazio como se não houvesse compromisso nenhum.
 *
 * Nada do Calendar é gravado no banco: compromisso é sempre lido na hora. */

const CALENDARIO_PADRAO = "consultoriazatti@gmail.com";

function getAuth() {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

/** "2026-09-15T12:00:00-03:00" -> "12:00". Recorte de string de propósito: a
 * API já devolve no fuso pedido, e passar por `Date` arriscaria o clássico
 * pulo de um dia (mesma regra de `formatarDataBr` no Financeiro Gerencial). */
function horaDoDateTime(dateTime: string | null | undefined): string | null {
  if (!dateTime || dateTime.length < 16) return null;
  return dateTime.slice(11, 16);
}

export async function lerCompromissosDoDia(dataIso: string): Promise<LeituraCalendario> {
  const auth = getAuth();
  if (!auth) {
    return { ok: false, motivo: "Credenciais do Google não configuradas neste ambiente." };
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID || CALENDARIO_PADRAO;

  try {
    const calendar = google.calendar({ version: "v3", auth });
    const { data } = await calendar.events.list({
      calendarId,
      timeMin: `${dataIso}T00:00:00-03:00`,
      timeMax: `${dataIso}T23:59:59-03:00`,
      timeZone: "America/Sao_Paulo",
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 50,
    });

    const eventos: CompromissoCalendario[] = (data.items ?? [])
      .filter((evento) => evento.status !== "cancelled")
      .map((evento) => ({
        id: evento.id ?? "",
        titulo: evento.summary?.trim() || "(sem título)",
        horaInicio: horaDoDateTime(evento.start?.dateTime),
        horaFim: horaDoDateTime(evento.end?.dateTime),
        diaInteiro: Boolean(evento.start?.date),
        recorrente: Boolean(evento.recurringEventId),
      }));

    return { ok: true, eventos };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : "erro desconhecido";
    // 404 é o sintoma exato de agenda não compartilhada com a conta de
    // serviço - vale dizer isso na tela, senão vira caça ao fantasma.
    const motivo = detalhe.includes("404")
      ? `Agenda ${calendarId} não está compartilhada com a conta de serviço do app.`
      : `Não consegui ler o Google Calendar: ${detalhe}`;
    return { ok: false, motivo };
  }
}
