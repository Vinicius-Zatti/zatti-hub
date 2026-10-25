import { DadosUnidade } from "@/components/configuracoes/dados-unidade";
import { requireConfiguracoes } from "./acesso";

export const dynamic = "force-dynamic";

/** Configurações > Unidade (Navegação V2, 24/10/2026): só leitura. */
export default async function ConfiguracoesUnidadePage() {
  const acesso = await requireConfiguracoes();
  return (
    <DadosUnidade
      organizacaoNome={acesso.organizacaoNome}
      unidadeNome={acesso.unidadeNome}
      fonteDadosEstoque={acesso.fonteDadosEstoque}
      planilhaConectada={Boolean(acesso.spreadsheetId)}
      role={acesso.role}
    />
  );
}
