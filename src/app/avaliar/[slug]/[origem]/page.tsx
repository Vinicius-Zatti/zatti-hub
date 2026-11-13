import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { carregarPesquisaPublica } from "@/lib/avaliacoes/servidor";
import { ehOrigem, perguntasAtivas } from "@/lib/avaliacoes/perguntas";
import { corTextoSobre } from "@/lib/avaliacoes/marca";
import { FormularioAvaliacao } from "./formulario";

// Página pública da pesquisa (QR Code), sem login e sem o menu do Zatti Hub: só a marca do
// restaurante. Sempre lida na hora (a gestão pode mudar cores, perguntas ou pausar). Não indexa.
export const dynamic = "force-dynamic";

type Params = { slug: string; origem: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const pesquisa = await carregarPesquisaPublica(slug).catch(() => null);
  return {
    title: pesquisa ? `Avalie ${pesquisa.nome}` : "Avaliação",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaAvaliar({ params }: { params: Promise<Params> }) {
  const { slug, origem } = await params;
  if (!ehOrigem(origem)) notFound();
  const pesquisa = await carregarPesquisaPublica(slug);
  if (!pesquisa) notFound();
  const texto = corTextoSobre(pesquisa.corFundo);

  return (
    <div className="min-h-dvh" style={{ backgroundColor: pesquisa.corFundo, color: texto }}>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-6">
        {pesquisa.logoUrl ? (
          // Logo do bucket público da unidade (até 300 KB); tamanho livre, por isso <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pesquisa.logoUrl} alt={pesquisa.nome} className="mx-auto h-auto max-h-28 w-auto max-w-[60%] object-contain" />
        ) : (
          <p className="text-center text-2xl font-bold">{pesquisa.nome}</p>
        )}
        {/* Tipo desligado pela gestão (13/11/2026) mostra a mesma pausa da pesquisa parada. */}
        {pesquisa.ativa && pesquisa.origens.includes(origem) ? (
          <FormularioAvaliacao
            slug={pesquisa.slug}
            origem={origem}
            nome={pesquisa.nome}
            corPrincipal={pesquisa.corPrincipal}
            corTexto={texto}
            agradecimento={pesquisa.agradecimento}
            linkGoogle={pesquisa.linkGoogle}
            perguntas={perguntasAtivas(pesquisa.perguntas)}
            termoVersao={pesquisa.termoVersao}
            termoTexto={pesquisa.termoTexto}
          />
        ) : (
          <p className="mt-10 text-center text-lg font-medium">Esta pesquisa está pausada no momento. Obrigado pelo interesse!</p>
        )}
      </main>
    </div>
  );
}
