import { google } from "googleapis";

// Camada temporária: por baixo, os dados moram na planilha Google Sheets
// que já existe hoje ("Sistema M.E.G.A. - Template Zatti"). Quando validarmos
// o modelo de dados com uso real, essa é a única camada que muda pra Postgres —
// as páginas e componentes não precisam saber de onde o dado vem.
//
// Qual planilha usar não é mais fixo por variável de ambiente: cada unidade
// (cliente) tem seu próprio `spreadsheet_id` cadastrado no Supabase, e o
// valor certo já vem resolvido de `getAcessoAtual()` (src/lib/acesso.ts) -
// nunca de um id vindo de formulário ou da URL.

function getAuth() {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const key = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Faltam as credenciais da service account do Google (GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY) no .env.local"
    );
  }

  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}
