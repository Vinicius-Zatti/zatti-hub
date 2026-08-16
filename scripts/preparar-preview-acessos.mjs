import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const arquivoAmbiente = path.join(process.cwd(), ".env.local");
for (const linha of fs.readFileSync(arquivoAmbiente, "utf8").split(/\r?\n/)) {
  const partes = linha.match(/^\s*([^#=]+)=(.*)$/);
  if (!partes || process.env[partes[1].trim()]) continue;
  let valor = partes[2].trim();
  if (/^(["']).*\1$/.test(valor)) valor = valor.slice(1, -1);
  process.env[partes[1].trim()] = valor;
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) throw new Error("Supabase local não configurado em .env.local.");

const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error("Este script só pode rodar contra o Supabase local.");
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = process.env.PREVIEW_MASTER_EMAIL ?? "master.preview@teste.local";
const senha = process.env.PREVIEW_MASTER_PASSWORD ?? "teste12345";
const { data: usuarios, error: erroLista } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (erroLista) throw erroLista;

let usuario = usuarios.users.find((item) => item.email === email);
if (!usuario) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: "Master Preview" },
  });
  if (error || !data.user) throw error ?? new Error("Falha ao criar o master local.");
  usuario = data.user;
} else {
  const { data, error } = await admin.auth.admin.updateUserById(usuario.id, {
    password: senha,
    user_metadata: { nome: "Master Preview" },
  });
  if (error || !data.user) throw error ?? new Error("Falha ao atualizar o master local.");
  usuario = data.user;
}

const organizacaoId = "org-ancora-master-preview";
const unidadeId = "unidade-ancora-master-preview";
const operacoes = [
  admin.from("organizacoes").upsert({
    id: organizacaoId, nome: "Ancora Master Preview", tipo_cliente: "saas", ativo: true,
  }),
  admin.from("unidades").upsert({
    id: unidadeId, organizacao_id: organizacaoId, nome: "Unidade Preview",
    spreadsheet_id: null, ativo: true, fonte_dados_estoque: "banco",
    consolidado_vendas_habilitado: false,
  }),
  admin.from("perfis").upsert({ id: usuario.id, nome: "Master Preview" }),
];
for (const operacao of operacoes) {
  const { error } = await operacao;
  if (error) throw error;
}

const { data: vinculos, error: erroVinculos } = await admin
  .from("vinculos").select("id").eq("user_id", usuario.id).eq("role", "master").limit(1);
if (erroVinculos) throw erroVinculos;
const vinculo = { user_id: usuario.id, organizacao_id: organizacaoId,
  unidade_id: null, role: "master", status: "ativo" };
const resultado = vinculos?.[0]
  ? await admin.from("vinculos").update(vinculo).eq("id", vinculos[0].id)
  : await admin.from("vinculos").insert(vinculo);
if (resultado.error) throw resultado.error;

console.log(`Preview local pronto em ${url}: ${email}`);
