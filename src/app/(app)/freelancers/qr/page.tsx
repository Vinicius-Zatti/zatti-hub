import { temPermissao } from "@/lib/acesso";
import { requireFreelancers } from "@/lib/freelancers/acesso";
import { carregarConfiguracao, lerMarcaDaUnidade } from "@/lib/freelancers/servidor";
import { logoComoDataUrl } from "@/lib/avaliacoes/servidor";
import { urlBase } from "@/lib/avaliacoes/qr";
import { ARTE_FREELA, nomeArquivoArteFreela, urlPublicaFreela } from "@/lib/freelancers/regras";
import { ArteQr } from "@/components/avaliacoes/arte-qr";
import { CriarConfiguracao } from "@/components/freelancers/criar-configuracao";

/** Arte do QR de check-in (10 x 15 cm), no mesmo desenho e na mesma marca da arte das
 * Avaliações: logo e cores vêm de Avaliações > Configurar; sem elas, o nome da unidade. */
export default async function FreelancersQrPage() {
  const acesso = await requireFreelancers();
  const configuracao = await carregarConfiguracao(acesso);
  if (!configuracao) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Arte do QR</h1>
        <CriarConfiguracao unidadeNome={acesso.unidadeNome} podeEditar={temPermissao(acesso, "freelancers", "editar")} />
      </div>
    );
  }
  const marca = await lerMarcaDaUnidade(acesso.unidadeId);
  const logoDataUrl = await logoComoDataUrl(marca.logoPath);
  const url = urlPublicaFreela(configuracao.slug, urlBase());

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Arte do QR de check-in</h1>
        <p className="text-sm text-cinza-medio">
          Baixe e imprima em 10 x 15 cm (tamanho de foto). Coloque onde a equipe chega para trabalhar, não no salão. O endereço não muda: pode imprimir uma vez só.
          {marca.logoPath ? " A logo e as cores são as mesmas da pesquisa de Avaliações." : " Sem marca cadastrada em Avaliações, a arte sai com o nome da unidade."}
        </p>
        {!configuracao.ativa && <p className="mt-1 text-sm font-semibold text-ambar">O check-in está fechado: quem ler o QR agora vê um aviso.</p>}
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" data-tour="freela-qr">
        <ArteQr
          origem="salao"
          url={url}
          slug={configuracao.slug}
          nome={marca.nome ?? acesso.unidadeNome}
          corPrincipal={marca.corPrincipal}
          corFundo={marca.corFundo}
          logoDataUrl={logoDataUrl}
          textos={{
            titulo: ARTE_FREELA.titulo,
            chamada: ARTE_FREELA.chamada,
            subtitulo: ARTE_FREELA.subtitulo,
            arquivoPng: nomeArquivoArteFreela(configuracao.slug, "png"),
            arquivoPdf: nomeArquivoArteFreela(configuracao.slug, "pdf"),
          }}
        />
      </div>
    </div>
  );
}
