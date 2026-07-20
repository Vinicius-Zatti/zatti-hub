export function ConectarPlanilha({ erro }: { erro: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-ambar bg-ambar/10 p-6">
      <h2 className="font-display text-xl font-bold text-azul-noite">
        Falta conectar a planilha
      </h2>
      <p className="mt-2 text-sm text-cinza">
        O Zatti Hub ainda está lendo dados da planilha Google Sheets por baixo dos
        panos. Pra essa tela funcionar, falta configurar o acesso da service
        account do Google no arquivo <code className="rounded bg-branco px-1">.env.local</code>.
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-azul-noite p-3 text-xs text-off-white">
{`GOOGLE_SHEETS_CLIENT_EMAIL=...
GOOGLE_SHEETS_PRIVATE_KEY="..."
GOOGLE_SHEETS_SPREADSHEET_ID=...`}
      </pre>
      <p className="mt-3 text-xs text-cinza-medio">Detalhe técnico: {erro}</p>
    </div>
  );
}
