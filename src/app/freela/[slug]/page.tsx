import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { carregarPaginaPublica } from "@/lib/freelancers/servidor";
import { corTextoSobre } from "@/lib/avaliacoes/marca";
import { FormularioCheckin } from "./formulario";

// Página pública do check-in (QR Code na loja), sem login e sem o menu do Zatti Hub: só a marca
// do restaurante. Sempre lida na hora (a gestão pode fechar o check-in). Não indexa.
export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await carregarPaginaPublica(slug).catch(() => null);
  return {
    title: pagina ? `Check-in ${pagina.nome}` : "Check-in",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaCheckin({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const pagina = await carregarPaginaPublica(slug);
  if (!pagina) notFound();

  if (!pagina.ativa) {
    const texto = corTextoSobre(pagina.corPrincipal);
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center" style={{ backgroundColor: pagina.corPrincipal, color: texto }}>
        <p className="text-xl font-bold">{pagina.nome}</p>
        <p className="mt-3 text-lg">O check-in está fechado no momento. Fale com o gerente.</p>
      </main>
    );
  }

  return <FormularioCheckin slug={pagina.slug} nome={pagina.nome} logoUrl={pagina.logoUrl} corPrincipal={pagina.corPrincipal} corFundo={pagina.corFundo} />;
}
