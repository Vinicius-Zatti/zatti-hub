import { google } from "googleapis";

// Camada temporária: por baixo, os dados moram na planilha Google Sheets
// que já existe hoje ("Sistema M.E.G.A. - Template Zatti"). Quando validarmos
// o modelo de dados com uso real, essa é a única camada que muda pra Postgres —
// as páginas e componentes não precisam saber de onde o dado vem.

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

// Por enquanto, um único tenant (Dom Quixote) aponta pra uma planilha fixa.
// Quando tiver mais de um cliente, isso vira uma consulta a uma tabela de
// tenants (Supabase) que devolve o spreadsheetId de cada um.
export function getSpreadsheetId(_tenantId: string = "dom-quixote"): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) {
    throw new Error("Falta GOOGLE_SHEETS_SPREADSHEET_ID no .env.local");
  }
  return id;
}
