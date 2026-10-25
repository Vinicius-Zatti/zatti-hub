const ROTULO_PAPEL: Record<string, string> = { master: "Master (Zatti)", gestao: "Gestão da organização" };

function Linha({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-cinza-claro py-3 first:border-t-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-cinza-medio">{rotulo}</dt>
      <dd className="font-semibold text-azul-noite sm:text-right">
        {valor}
        {detalhe && <span className="block text-xs font-normal text-cinza-medio">{detalhe}</span>}
      </dd>
    </div>
  );
}

/** Configurações > Unidade: dados da unidade da sessão, só leitura. Não há
 * action segura para renomear unidade ou trocar a fonte do estoque (a troca
 * muda de onde o estoque inteiro é lido); quem muda é a Zatti. */
export function DadosUnidade({
  organizacaoNome,
  unidadeNome,
  fonteDadosEstoque,
  planilhaConectada,
  role,
}: {
  organizacaoNome: string;
  unidadeNome: string;
  fonteDadosEstoque: "banco" | "planilha";
  planilhaConectada: boolean;
  role: string;
}) {
  const noBanco = fonteDadosEstoque === "banco";
  return (
    <section className="flex flex-col gap-3">
      <h1 className="sr-only">Configurações da unidade</h1>
      <dl className="rounded-2xl border border-cinza-claro bg-branco px-4 py-1">
        <Linha rotulo="Organização" valor={organizacaoNome} />
        <Linha rotulo="Unidade" valor={unidadeNome} />
        <Linha
          rotulo="Fonte do estoque"
          valor={noBanco ? "Zatti Hub" : "Planilha Google"}
          detalhe={
            noBanco
              ? "Produtos, contagens e compras ficam no próprio Zatti Hub."
              : planilhaConectada
                ? "O estoque é lido da planilha conectada a esta unidade."
                : "Planilha ainda não conectada."
          }
        />
        <Linha rotulo="Seu acesso" valor={ROTULO_PAPEL[role] ?? role} />
      </dl>
      <p className="text-sm text-cinza-medio">Para mudar o nome da unidade ou a fonte do estoque, fale com a Zatti.</p>
    </section>
  );
}
