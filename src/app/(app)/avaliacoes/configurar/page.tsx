import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirecionarSemEdicao, temPermissao } from "@/lib/acesso";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";
import { carregarDestinatarios, carregarPesquisa, carregarSituacaoAlertas, urlPublicaLogo } from "@/lib/avaliacoes/servidor";
import { ROTULO_ORIGEM, definicao, perguntasDoTipo } from "@/lib/avaliacoes/perguntas";
import { urlBase, urlPublica } from "@/lib/avaliacoes/qr";
import { DICA_ALERTA } from "@/lib/avaliacoes/alertas";
import { DicaCalculo } from "@/components/dica-calculo";
import { CriarPesquisa } from "@/components/avaliacoes/criar-pesquisa";
import { EditorMarca, Previa } from "@/components/avaliacoes/editor-marca";
import { EditorPerguntas } from "@/components/avaliacoes/editor-perguntas";
import { LogoUpload } from "@/components/avaliacoes/logo-upload";
import { DestinatarioAlerta } from "@/components/avaliacoes/destinatario-alerta";
import { TiposPesquisa } from "@/components/avaliacoes/tipos-pesquisa";
import { EditorExtras } from "@/components/avaliacoes/editor-extras";

const CARTAO = "flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4";
const TITULO = "font-display text-lg font-bold text-azul-noite";

/** Configurar (gestão com "editar"): endereço, marca, perguntas, alerta e o texto de
 * consentimento. Quem só vê é levado ao painel (`TELAS_DE_EDICAO`). */
export default async function ConfigurarAvaliacoesPage() {
  const acesso = await requireAvaliacoes();
  redirecionarSemEdicao(acesso, "/avaliacoes/configurar");
  const podeEditar = temPermissao(acesso, "avaliacoes", "editar");
  const pesquisa = await carregarPesquisa(acesso);
  if (!pesquisa) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Configurar as Avaliações</h1>
        <CriarPesquisa unidadeNome={acesso.unidadeNome} podeEditar={podeEditar} />
      </div>
    );
  }

  const supabase = await createClient();
  const [destinatarios, situacao, { data: termo }] = await Promise.all([
    carregarDestinatarios(acesso, pesquisa.alertaVinculoId),
    carregarSituacaoAlertas(acesso),
    supabase.from("avaliacoes_termos").select("versao, modelo").order("versao", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const base = urlBase();
  const logoUrl = urlPublicaLogo(pesquisa.logoPath);
  const termoAtual = termo as { versao: number; modelo: string } | null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Configurar as Avaliações</h1>
        <p className="text-sm text-cinza-medio">
          {pesquisa.nomeExibido} ·{" "}
          {pesquisa.ativa ? "pesquisa no ar" : <span className="font-semibold text-ambar">pesquisa pausada (o QR mostra um aviso)</span>}
        </p>
      </div>

      <section className={CARTAO}>
        <h2 className={TITULO}>Endereço da pesquisa</h2>
        <p className="text-sm text-cinza">Fixo: o QR impresso continua valendo mesmo se você trocar a logo, as cores ou as perguntas.</p>
        <ul className="flex flex-col gap-1 text-sm">
          {pesquisa.origens.map((o) => (
            <li key={o}>
              <span className="font-semibold text-azul-noite">{ROTULO_ORIGEM[o]}: </span>
              <a href={urlPublica(pesquisa.slug, o, base)} target="_blank" rel="noopener noreferrer" className="break-all text-azul-petroleo underline">
                {urlPublica(pesquisa.slug, o, base)}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/avaliacoes/qr" className="self-start rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco">
          Baixar a arte do QR para imprimir
        </Link>
      </section>

      <section className={CARTAO}>
        <h2 className={TITULO}>Tipos de pesquisa</h2>
        <p className="text-sm text-cinza">Cada tipo tem o próprio QR e aparece separado no painel. Desligue o que o restaurante não usa; o QR de um tipo desligado mostra que a pesquisa está pausada.</p>
        <TiposPesquisa ligadas={pesquisa.origens} podeEditar={podeEditar} />
      </section>

      <section className={CARTAO}>
        <h2 className={TITULO}>Marca</h2>
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                // Logo pública da unidade (bucket só de logos).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={`Logo da ${pesquisa.nomeExibido}`} className="h-16 w-auto max-w-[160px] rounded border border-cinza-claro object-contain p-1" />
              ) : (
                <span className="rounded border border-dashed border-cinza-claro px-3 py-4 text-xs text-cinza-medio">Sem logo: a página mostra o nome</span>
              )}
              {podeEditar && <LogoUpload temLogo={Boolean(logoUrl)} />}
            </div>
            <p>
              <span className="font-semibold text-azul-noite">Nome exibido: </span>
              {pesquisa.nomeExibido}
            </p>
            <p>
              <span className="font-semibold text-azul-noite">Cores: </span>
              principal {pesquisa.corPrincipal} · fundo {pesquisa.corFundo}
            </p>
            <p>
              <span className="font-semibold text-azul-noite">Tela de obrigado: </span>
              {pesquisa.textoAgradecimento}
            </p>
            <p>
              <span className="font-semibold text-azul-noite">Avaliar no Google: </span>
              {pesquisa.linkGoogle ? (
                <a href={pesquisa.linkGoogle} target="_blank" rel="noopener noreferrer" className="break-all text-azul-petroleo underline">
                  {pesquisa.linkGoogle}
                </a>
              ) : (
                <span className="text-cinza-medio">sem link (o botão não aparece)</span>
              )}
            </p>
            {podeEditar && (
              <EditorMarca
                atual={{
                  nomeExibido: pesquisa.nomeExibido,
                  corPrincipal: pesquisa.corPrincipal,
                  corFundo: pesquisa.corFundo,
                  textoAgradecimento: pesquisa.textoAgradecimento,
                  linkGoogle: pesquisa.linkGoogle,
                  ativa: pesquisa.ativa,
                }}
              />
            )}
          </div>
          <Previa nome={pesquisa.nomeExibido} principal={pesquisa.corPrincipal} fundo={pesquisa.corFundo} />
        </div>
      </section>

      <section className={CARTAO}>
        <h2 className={TITULO}>Perguntas (versão {pesquisa.versaoAtual})</h2>
        <p className="text-sm text-cinza">Cada tipo de pesquisa faz só as perguntas que fazem sentido para ele. Uma pergunta por tela; tocou na resposta, passa para a próxima.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {pesquisa.origens.map((o) => (
            <div key={o} className="rounded-md border border-cinza-claro p-3">
              <p className="text-sm font-bold text-azul-noite">{ROTULO_ORIGEM[o]}</p>
              <ol className="mt-1 list-decimal pl-5 text-sm">
                {perguntasDoTipo(pesquisa.perguntas, o, pesquisa.atendentes).map((p) => (
                  <li key={p.chave}>
                    <span className="font-semibold">{definicao(p.chave).nome}:</span> {p.texto}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        {pesquisa.perguntas.some((p) => !p.ativa) && (
          <p className="text-xs text-cinza-medio">
            Desligadas:{" "}
            {pesquisa.perguntas
              .filter((p) => !p.ativa)
              .map((p) => definicao(p.chave).nome)
              .join(", ")}
            .
          </p>
        )}
        <p className="text-xs text-cinza-medio">Quem dá nota baixa pode deixar o WhatsApp para a equipe falar com ele (opcional, com a autorização desmarcada).</p>
        {podeEditar && <EditorPerguntas atuais={pesquisa.perguntas} versao={pesquisa.versaoAtual} />}
      </section>

      <section className={CARTAO}>
        <h2 className={TITULO}>Quem atende e pedir direto</h2>
        <p className="text-sm">
          <span className="font-semibold text-azul-noite">Quem atende no salão: </span>
          {pesquisa.atendentes.length ? pesquisa.atendentes.join(", ") : <span className="text-cinza-medio">ninguém cadastrado</span>}
          {pesquisa.atendentes.length > 0 && !pesquisa.perguntas.find((p) => p.chave === "atendente")?.ativa ? (
            <span className="text-cinza-medio"> (a pergunta &quot;quem atendeu&quot; está desligada)</span>
          ) : null}
        </p>
        <p className="text-sm">
          <span className="font-semibold text-azul-noite">Link de pedir direto: </span>
          {pesquisa.linkPedidoDireto ? (
            <a href={pesquisa.linkPedidoDireto} target="_blank" rel="noopener noreferrer" className="break-all text-azul-petroleo underline">
              {pesquisa.linkPedidoDireto}
            </a>
          ) : (
            <span className="text-cinza-medio">sem link (o convite não aparece)</span>
          )}
        </p>
        {podeEditar && <EditorExtras atendentes={pesquisa.atendentes} linkPedidoDireto={pesquisa.linkPedidoDireto} />}
      </section>

      <section className={CARTAO}>
        <h2 className={`${TITULO} flex items-center gap-1`}>
          Alerta de nota baixa no WhatsApp
          <DicaCalculo rotulo="alerta de nota baixa" texto={DICA_ALERTA} />
        </h2>
        <DestinatarioAlerta unidadeNome={pesquisa.nomeExibido} atual={destinatarios.atual} candidatos={destinatarios.candidatos} podeEditar={podeEditar} />
        <p className="text-xs text-cinza-medio">
          Esperando envio: {situacao.pendentes} · enviados nos últimos 7 dias: {situacao.enviados7d}
          {situacao.incertosOuFalhos7d > 0 ? ` · sem confirmação ou vencidos: ${situacao.incertosOuFalhos7d}` : ""}
        </p>
      </section>

      <section className={CARTAO}>
        <h2 className={TITULO}>Dados de quem responde (LGPD)</h2>
        <p className="text-sm text-cinza">
          A pesquisa não pede nome nem e-mail. O WhatsApp é opcional e só é guardado se a pessoa marcar a autorização (que vem desmarcada). Guardamos a data, a versão e a
          cópia do texto que ela aceitou. O IP não é guardado: só um código embaralhado, usado para barrar envio repetido. A{" "}
          {acesso.organizacaoNome || "empresa"} é a controladora desses dados; a Zatti, a operadora.
        </p>
        {termoAtual && (
          <blockquote className="rounded-md bg-off-white p-3 text-sm text-azul-noite">
            Texto da autorização (versão {termoAtual.versao}): {termoAtual.modelo.replaceAll("{restaurante}", pesquisa.nomeExibido)}
          </blockquote>
        )}
      </section>
    </div>
  );
}
