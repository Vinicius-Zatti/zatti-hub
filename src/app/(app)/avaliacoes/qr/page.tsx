import { temPermissao } from "@/lib/acesso";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";
import { carregarPesquisa, logoComoDataUrl } from "@/lib/avaliacoes/servidor";
import { urlBase, urlPublica } from "@/lib/avaliacoes/qr";
import { ArteQr } from "@/components/avaliacoes/arte-qr";
import { CriarPesquisa } from "@/components/avaliacoes/criar-pesquisa";

/** Arte do QR para imprimir (10 x 15 cm): uma para a mesa (salão) e outra para o delivery, com a
 * logo e as cores da unidade. O QR aponta para o endereço fixo de produção. Só ler, por isso
 * quem só vê o módulo também baixa. */
export default async function ArteQrPage() {
  const acesso = await requireAvaliacoes();
  const pesquisa = await carregarPesquisa(acesso);
  if (!pesquisa) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Arte do QR</h1>
        <CriarPesquisa unidadeNome={acesso.unidadeNome} podeEditar={temPermissao(acesso, "avaliacoes", "editar")} />
      </div>
    );
  }
  const base = urlBase();
  const logoDataUrl = await logoComoDataUrl(pesquisa.logoPath);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Arte do QR</h1>
        <p className="text-sm text-cinza-medio">
          Baixe e imprima em 10 x 15 cm (tamanho de foto). A da mesa vai no salão; a do delivery próprio vai junto do pedido feito com vocês; a dos apps vai
          junto do pedido do iFood, 99 e afins. Mudou a logo ou as cores? Baixe de novo: o QR continua o mesmo. Só aparecem os tipos ligados em Configurar.
        </p>
        {!pesquisa.ativa && <p className="mt-1 text-sm font-semibold text-ambar">A pesquisa está pausada: quem ler o QR agora vê um aviso de pausa.</p>}
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {pesquisa.origens.map((o) => (
          <ArteQr
            key={o}
            origem={o}
            url={urlPublica(pesquisa.slug, o, base)}
            slug={pesquisa.slug}
            nome={pesquisa.nomeExibido}
            corPrincipal={pesquisa.corPrincipal}
            corFundo={pesquisa.corFundo}
            logoDataUrl={logoDataUrl}
          />
        ))}
      </div>
    </div>
  );
}
