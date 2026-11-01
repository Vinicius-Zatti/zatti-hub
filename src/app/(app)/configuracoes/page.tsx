import { DadosUnidade } from "@/components/configuracoes/dados-unidade";
import { requireConfiguracoes } from "./acesso";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { CapturaNfe } from "@/components/configuracoes/captura-nfe";
import { carregarPainelSefaz, type PainelSefaz } from "@/lib/sefaz/painel";

export const dynamic = "force-dynamic";

/** Configurações > Unidade (Navegação V2, 24/10/2026): só leitura. Desde 30/10/2026 o master vê
 * também o certificado A1 da captura de NF-e. */
export default async function ConfiguracoesUnidadePage() {
  const acesso = await requireConfiguracoes();
  let sefaz: PainelSefaz | null = null;
  if (acesso.role === "master") {
    // Falha no painel da captura não derruba a página da unidade.
    sefaz = await carregarPainelSefaz(acesso.unidadeId).catch(() => null);
  }
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
      {sefaz && <CapturaNfe painel={sefaz} />}
    </div>
  );
}
