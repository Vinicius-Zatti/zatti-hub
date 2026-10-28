import { DadosUnidade } from "@/components/configuracoes/dados-unidade";
import { requireConfiguracoes } from "./acesso";
import { LinkVideoAjuda } from "@/components/videos-ajuda";

export const dynamic = "force-dynamic";

/** Configurações > Unidade (Navegação V2, 24/10/2026): só leitura. */
export default async function ConfiguracoesUnidadePage() {
  const acesso = await requireConfiguracoes();
  return (
    <div className="flex flex-col gap-3">
      {/* Vídeo desta tela (28/10/2026), mesmo link discreto do Estoque. */}
      <div className="-ml-2">
        <LinkVideoAjuda id="configuracoes" pergunta="Como ler as Configurações?" />
      </div>
      <DadosUnidade
        organizacaoNome={acesso.organizacaoNome}
        unidadeNome={acesso.unidadeNome}
        fonteDadosEstoque={acesso.fonteDadosEstoque}
        planilhaConectada={Boolean(acesso.spreadsheetId)}
        role={acesso.role}
      />
    </div>
  );
}
