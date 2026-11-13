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

  // Visual de 13/11/2026: faixa na cor principal no topo, logo em destaque sobre ela e as perguntas
  // em cartões (antes era tudo solto no fundo e parecia formulário de sistema).
  return (
    <div className="min-h-dvh" style={{ backgroundColor: pesquisa.corFundo, color: texto }}>
      <div className="h-36 w-full" style={{ backgroundColor: pesquisa.corPrincipal }} aria-hidden="true" />
      <main className="mx-auto -mt-20 flex w-full max-w-md flex-col px-4 pb-10">
        <div
          className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-white"
          style={{ boxShadow: `0 0 0 5px ${pesquisa.corFundo}, 0 12px 28px rgba(0,0,0,0.22)` }}
        >
          {pesquisa.logoUrl ? (
            // Logo do bucket público da unidade (até 300 KB); tamanho livre, por isso <img>.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pesquisa.logoUrl} alt={pesquisa.nome} className="h-full w-full object-contain p-2" />
          ) : (
            <span className="px-3 text-center text-base font-bold leading-tight text-[#111111]">{pesquisa.nome}</span>
          )}
        </div>
        {/* Tipo desligado pela gestão (13/11/2026) mostra a mesma pausa da pesquisa parada. */}
        {pesquisa.ativa && pesquisa.origens.includes(origem) ? (
          <FormularioAvaliacao
            slug={pesquisa.slug}
            origem={origem}
            nome={pesquisa.nome}
            corPrincipal={pesquisa.corPrincipal}
            corFundo={pesquisa.corFundo}
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
