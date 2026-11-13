import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { carregarPesquisaPublica } from "@/lib/avaliacoes/servidor";
import { ehOrigem, perguntasDoTipo } from "@/lib/avaliacoes/perguntas";
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

  // Tipo desligado pela gestão (13/11/2026) mostra a mesma pausa da pesquisa parada.
  if (!pesquisa.ativa || !pesquisa.origens.includes(origem)) {
    const texto = corTextoSobre(pesquisa.corPrincipal);
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center" style={{ backgroundColor: pesquisa.corPrincipal, color: texto }}>
        <p className="text-xl font-bold">{pesquisa.nome}</p>
        <p className="mt-3 text-lg">Esta pesquisa está pausada no momento. Obrigado pelo interesse!</p>
      </main>
    );
  }

  // Página nova de 13/11/2026: capa da marca e uma pergunta por tela (formulario.tsx).
  return (
    <FormularioAvaliacao
      slug={pesquisa.slug}
      origem={origem}
      nome={pesquisa.nome}
      logoUrl={pesquisa.logoUrl}
      corPrincipal={pesquisa.corPrincipal}
      corFundo={pesquisa.corFundo}
      agradecimento={pesquisa.agradecimento}
      linkGoogle={pesquisa.linkGoogle}
      linkPedidoDireto={pesquisa.linkPedidoDireto}
      perguntas={perguntasDoTipo(pesquisa.perguntas, origem, pesquisa.atendentes)}
      atendentes={pesquisa.atendentes}
      termoVersao={pesquisa.termoVersao}
      termoTexto={pesquisa.termoTexto}
    />
  );
}
