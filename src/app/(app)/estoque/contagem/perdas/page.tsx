import { getAcessoAtual } from "@/lib/acesso";
import { ErroCarregamento } from "@/components/erro-carregamento";
import { ExtratoDesligado } from "@/components/extrato/extrato-desligado";
import { LinkVideoAjuda } from "@/components/videos-ajuda";
import { PerdasEstoque } from "@/components/extrato/perdas-estoque";
import { listarExtratoPagina, listarProdutosParaPerda } from "@/lib/banco/extrato";
import { lerFiltroExtrato } from "@/lib/extrato";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";

export const dynamic = "force-dynamic";

export default async function PerdasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const acesso = await getAcessoAtual();
  if (acesso.fonteDadosEstoque !== "banco") {
    return (
      <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
        O registro de perdas só existe para unidade com o estoque no Zatti Hub (não na planilha).
      </div>
    );
  }
  // Chave da unidade desligada (decisão 7): nem lista nem registro de perda.
  if (!acesso.extratoEstoqueHabilitado) return <ExtratoDesligado titulo="Perdas" />;

  // Perdas canceladas continuam na lista (riscadas): o histórico não some.
  const filtro = { ...lerFiltroExtrato(await searchParams), tipo: "perda" as const, incluirCancelados: true };
  let pagina;
  let produtos;
  try {
    [pagina, produtos] = await Promise.all([
      listarExtratoPagina(acesso.unidadeId, filtro),
      listarProdutosParaPerda(acesso.unidadeId),
    ]);
  } catch {
    return <ErroCarregamento />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-azul-noite">Perdas</h1>
        <p className="text-sm text-cinza-medio">
          Registre o que foi jogado fora, com o motivo. Cada perda entra no extrato do estoque.
        </p>
        {/* Vídeo desta tela (27/10/2026), mesmo link discreto da Contagem. */}
        <div className="-ml-2">
          <LinkVideoAjuda id="estoque-perdas" pergunta="Como registrar uma perda?" />
        </div>
      </div>
      <PerdasEstoque
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={filtro.pagina}
        produtos={produtos}
        hoje={hojeIsoBrasil()}
        podeCancelar={acesso.role === "gestao" || acesso.role === "master"}
      />
    </div>
  );
}
