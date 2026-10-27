import { getAcessoAtual } from "@/lib/acesso";
import { ErroCarregamento } from "@/components/erro-carregamento";
import { ExtratoDesligado } from "@/components/extrato/extrato-desligado";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { ExtratoMovimentacoes } from "@/components/extrato/extrato-movimentacoes";
import { listarExtratoPagina, listarSaldos } from "@/lib/banco/extrato";
import { lerFiltroExtrato } from "@/lib/extrato";

export const dynamic = "force-dynamic";

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const acesso = await getAcessoAtual();
  if (acesso.fonteDadosEstoque !== "banco") {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
        O extrato do estoque só existe para unidade com o estoque no Zatti Hub (não na planilha).
      </div>
    );
  }
  // Chave da unidade desligada (decisão 7): nenhum número, só o aviso.
  if (!acesso.extratoEstoqueHabilitado) return <ExtratoDesligado titulo="Movimentações" />;

  const filtro = lerFiltroExtrato(await searchParams);
  let pagina;
  let saldos;
  try {
    [pagina, saldos] = await Promise.all([
      listarExtratoPagina(acesso.unidadeId, filtro),
      listarSaldos(acesso.unidadeId, filtro.sku),
    ]);
  } catch {
    return <ErroCarregamento />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Movimentações</h1>
        <p className="text-sm text-cinza-medio">
          Extrato do estoque: compras recebidas, perdas e a posição de cada contagem completa.
        </p>
        {/* Vídeo desta tela (27/10/2026), mesmo link discreto da Contagem. */}
        <div className="-ml-2">
          <LinkVideoAjuda id="estoque-movimentacoes" pergunta="Como ler as movimentações?" />
        </div>
      </div>
      <ExtratoMovimentacoes filtro={filtro} linhas={pagina.linhas} total={pagina.total} saldos={saldos} />
    </div>
  );
}
