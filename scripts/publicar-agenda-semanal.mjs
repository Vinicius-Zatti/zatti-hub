/** Publica a grade semanal do Cérebro do Gestor no Zatti Hub.
 *
 * `_conhecimento/agenda-semanal.md` continua sendo a fonte oficial da rotina
 * permanente - este script só lê aquele arquivo e substitui a publicação
 * anterior em `zh_agenda_rotinas`, via `publicar_agenda_semanal`. Rodar
 * sempre que a grade mudar de forma permanente, junto com a atualização da
 * série recorrente no Google Calendar (regra da Agenda v2: nunca encerrar
 * com só um dos lados corrigido).
 *
 * Cada linha de dia da grade precisa do seu `<!-- agenda-id:... -->`. Faltou,
 * repetiu ou está fora do formato: o script lista tudo e não publica nada,
 * nem em --simular. Faixa que saiu da grade fica inativa no banco (tarefas e
 * histórico preservados) e o script mostra quais foram.
 *
 *   npm run agenda:publicar -- --simular     (mostra o que faria, não grava)
 *   npm run agenda:publicar
 *   npm run agenda:publicar -- --arquivo "C:/caminho/agenda-semanal.md"
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { interpretarGradeSemanal, nomeDiaSemana } from "../src/lib/agenda/grade.ts";

const CAMINHO_PADRAO = path.join(
  process.cwd(),
  "..",
  "Cérebro do Gestor",
  "_conhecimento",
  "agenda-semanal.md"
);

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function temSinalizador(nome) {
  return process.argv.includes(`--${nome}`);
}

function carregarAmbiente() {
  const arquivo = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const partes = linha.match(/^\s*([^#=]+)=(.*)$/);
    if (!partes) continue;
    let valor = partes[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    process.env[partes[1].trim()] = valor;
  }
}

function resumir(faixas) {
  const porDia = new Map();
  for (const faixa of faixas) {
    if (!porDia.has(faixa.dia_semana)) porDia.set(faixa.dia_semana, []);
    porDia.get(faixa.dia_semana).push(faixa);
  }

  for (const dia of [...porDia.keys()].sort((a, b) => a - b)) {
    console.log(`\n${nomeDiaSemana(dia).toUpperCase()}`);
    for (const faixa of porDia.get(dia)) {
      const horario = faixa.hora_inicio
        ? `${faixa.hora_inicio}${faixa.hora_fim ? `-${faixa.hora_fim}` : ""}`
        : faixa.horario_texto;
      console.log(`  ${String(horario).padEnd(13)} ${faixa.tipo.padEnd(12)} ${faixa.rotulo}`);
    }
  }
}

async function principal() {
  carregarAmbiente();

  const arquivo = argumento("arquivo") ?? CAMINHO_PADRAO;
  if (!fs.existsSync(arquivo)) {
    console.error(`Não achei a grade em:\n  ${arquivo}\nUse --arquivo para apontar o caminho certo.`);
    process.exit(1);
  }

  const { faixas, erros } = interpretarGradeSemanal(fs.readFileSync(arquivo, "utf8"));
  if (erros.length > 0) {
    console.error(`A grade tem ${erros.length} problema(s) de agenda-id. Nada publicado.\n`);
    for (const erro of erros) console.error(`  - ${erro}`);
    process.exit(1);
  }

  if (faixas.length === 0) {
    console.error("A grade foi lida, mas nenhuma faixa de horário foi reconhecida. Nada publicado.");
    process.exit(1);
  }

  console.log(`Grade lida de ${arquivo}`);
  console.log(`${faixas.length} faixas em ${new Set(faixas.map((f) => f.dia_semana)).size} dias.`);
  resumir(faixas);

  if (temSinalizador("simular")) {
    console.log("\n--simular: nada foi gravado no banco.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local.");
    process.exit(1);
  }

  const supabase = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("publicar_agenda_semanal", { p_grade: faixas });

  if (error) {
    console.error(`Falhou ao publicar: ${error.message}`);
    process.exit(1);
  }

  console.log(`\nPublicado: ${data.publicadas} faixas ativas em zh_agenda_rotinas.`);
  if (data.inativadas.length > 0) {
    console.log(`Saíram da grade e ficaram inativas (tarefas e histórico preservados): ${data.inativadas.join(", ")}`);
  }
  if (data.reativadas.length > 0) {
    console.log(`Voltaram para a grade e foram reativadas: ${data.reativadas.join(", ")}`);
  }
  console.log("Lembrete: mudança permanente também atualiza a série recorrente do Google Calendar.");
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
