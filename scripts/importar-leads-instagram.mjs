/** Importa em lote os leads da prospecção ativa pelo Instagram para o
 * Comercial (Escritório > Comercial) do Zatti Hub.
 *
 * Cada lead entra com origem `instagram`, etapa "Começar a seguir" e
 * o evento `criado` na linha do tempo, pela RPC `zh_leads_importar` (só
 * service_role). Lead que já existe (mesmo @ ou mesmo WhatsApp) não é
 * duplicado nem sobrescrito: aparece na lista de repetidos. Item inválido
 * não derruba o lote: aparece na lista de inválidos com o motivo.
 *
 * Arquivo JSON: um array (até 500 por execução) de objetos. Só `instagram`
 * ou `whatsapp` é obrigatório; o resto é opcional.
 *   [
 *     {
 *       "instagram": "@hamburgueriadoze",       // @, sem @ ou link do perfil
 *       "nome": "Zé",                           // sem nome: usa o @
 *       "negocio": "Hamburgueria do Zé",
 *       "whatsapp": "31999990000",              // DDD + número
 *       "cidade_bairro": "Belo Horizonte / Savassi",
 *       "seguidores": 1840,
 *       "ultimo_post_em": "2026-10-05",          // AAAA-MM-DD
 *       "nota_google": 4.6,                     // 0 a 5
 *       "avaliacoes_google": 312,
 *       "vende_delivery": "ifood"               // ifood | proprio | nao | ""
 *     }
 *   ]
 *
 *   node scripts/importar-leads-instagram.mjs --arquivo "C:/caminho/leads.json" --simular
 *   node scripts/importar-leads-instagram.mjs --arquivo "C:/caminho/leads.json"
 *
 * Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no
 * .env.local ou no ambiente). --simular só confere o arquivo, não grava.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { instagramValido, normalizarInstagram } from "../src/lib/comercial/funil.ts";

const CAMPOS = new Set([
  "instagram", "nome", "negocio", "whatsapp", "cidade_bairro", "seguidores", "ultimo_post_em",
  "nota_google", "avaliacoes_google", "vende_delivery",
]);
const LIMITE = 500;

function argumento(nome) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function semBom(texto) {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

function carregarAmbiente() {
  const arquivo = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(arquivo)) return;
  for (const linha of semBom(fs.readFileSync(arquivo, "utf8")).split(/\r?\n/)) {
    const partes = linha.match(/^\s*([^#=]+)=(.*)$/);
    if (!partes) continue;
    let valor = partes[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    const chave = partes[1].trim();
    if (!process.env[chave]) process.env[chave] = valor;
  }
}

/** Conferência local (a regra que vale é a do banco): devolve o lead pronto
 * para a RPC ou o motivo de recusa. */
function prepararLead(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return { motivo: "não é objeto" };
  const extras = Object.keys(item).filter((k) => !CAMPOS.has(k));
  if (extras.length) return { motivo: `campo desconhecido: ${extras.join(", ")}` };
  const instagram = normalizarInstagram(String(item.instagram ?? ""));
  const whatsapp = String(item.whatsapp ?? "").replace(/\D/g, "");
  if (!instagram && !whatsapp) return { motivo: "sem Instagram e sem WhatsApp" };
  if (instagram && !instagramValido(instagram)) return { motivo: `Instagram inválido: ${item.instagram}` };
  if (item.ultimo_post_em && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.ultimo_post_em))) {
    return { motivo: "ultimo_post_em fora do formato AAAA-MM-DD" };
  }
  if (item.vende_delivery && !["ifood", "proprio", "nao"].includes(String(item.vende_delivery))) {
    return { motivo: "vende_delivery deve ser ifood, proprio, nao ou vazio" };
  }
  return { lead: { ...item, instagram: instagram || null, whatsapp: whatsapp || null } };
}

async function principal() {
  const caminho = argumento("arquivo");
  if (!caminho) {
    console.error('Use: node scripts/importar-leads-instagram.mjs --arquivo "caminho/leads.json" [--simular]');
    process.exit(1);
  }
  const lista = JSON.parse(semBom(fs.readFileSync(caminho, "utf8")));
  if (!Array.isArray(lista)) {
    console.error("O arquivo precisa ser um array JSON de leads.");
    process.exit(1);
  }
  if (lista.length > LIMITE) {
    console.error(`Até ${LIMITE} leads por execução (o arquivo tem ${lista.length}). Divida em partes.`);
    process.exit(1);
  }

  const prontos = [];
  const indiceOriginal = [];
  const recusados = [];
  const vistos = new Set();
  lista.forEach((item, i) => {
    const r = prepararLead(item);
    if (r.motivo) return recusados.push(`item ${i + 1}: ${r.motivo}`);
    const chave = r.lead.instagram ?? r.lead.whatsapp;
    if (vistos.has(chave)) return recusados.push(`item ${i + 1}: repetido no próprio arquivo (${chave})`);
    vistos.add(chave);
    prontos.push(r.lead);
    indiceOriginal.push(i + 1);
  });

  console.log(`${lista.length} itens no arquivo; ${prontos.length} prontos; ${recusados.length} recusados na conferência.`);
  for (const r of recusados) console.log(`  - ${r}`);

  if (process.argv.includes("--simular")) {
    console.log("\n--simular: nada foi gravado no banco.");
    return;
  }
  if (prontos.length === 0) return;

  carregarAmbiente();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local ou ambiente).");
    process.exit(1);
  }
  const supabase = createClient(url, chave, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("zh_leads_importar", { p_leads: prontos });
  if (error) {
    console.error(`Falhou ao importar: ${error.message}`);
    process.exit(1);
  }
  console.log(`\nInseridos: ${data.inseridos}`);
  if (data.repetidos.length) {
    console.log(`Já existiam (não mexi): ${data.repetidos.length}`);
    for (const r of data.repetidos) console.log(`  - item ${indiceOriginal[r.item - 1]}: ${r.instagram ?? ""}`);
  }
  if (data.invalidos.length) {
    console.log(`Recusados pelo banco: ${data.invalidos.length}`);
    for (const r of data.invalidos) console.log(`  - item ${indiceOriginal[r.item - 1]}: ${r.instagram ?? ""} (${r.motivo})`);
  }
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
