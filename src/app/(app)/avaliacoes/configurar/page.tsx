import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirecionarSemEdicao, temPermissao } from "@/lib/acesso";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";
import { carregarDestinatarios, carregarPesquisa, carregarPremios, carregarSituacaoAlertas, urlPublicaLogo } from "@/lib/avaliacoes/servidor";
import { LIMITE_AGRADECIMENTO, LIMITE_NOME } from "@/lib/avaliacoes/marca";
import { ROTULO_ORIGEM } from "@/lib/avaliacoes/perguntas";
import { urlBase, urlPublica } from "@/lib/avaliacoes/qr";
import { DICA_ALERTA } from "@/lib/avaliacoes/alertas";
import { DicaCalculo } from "@/components/dica-calculo";
import { CriarPesquisa } from "@/components/avaliacoes/criar-pesquisa";
import { EditorCores, PausaPesquisa } from "@/components/avaliacoes/editor-marca";
import { EditorPerguntas } from "@/components/avaliacoes/editor-perguntas";
import { CampoSalvavel } from "@/components/avaliacoes/campo-salvavel";
import { LogoUpload } from "@/components/avaliacoes/logo-upload";
import { DestinatarioAlerta } from "@/components/avaliacoes/destinatario-alerta";
import { TiposPesquisa } from "@/components/avaliacoes/tipos-pesquisa";
import { EditorRoleta } from "@/components/avaliacoes/editor-roleta";
import { CARTAO } from "@/components/avaliacoes/ui";

const ABAS = [
  { id: "perguntas", rotulo: "Perguntas" },
  { id: "aparencia", rotulo: "Aparência" },
  { id: "final", rotulo: "Fim da pesquisa" },
  { id: "alerta", rotulo: "Alerta de nota baixa" },
  { id: "qr", rotulo: "Tipos e QR" },
  { id: "dados", rotulo: "Dados (LGPD)" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

const TITULO = "font-display text-lg font-bold text-azul-noite";

function lerAba(valor: string | undefined): Aba {
  return ABAS.some((a) => a.id === valor) ? (valor as Aba) : "perguntas";
}

/** Configurar (gestão com "editar"), refeita em 14/11/2026: abas por assunto e cada bloco com o
 * próprio salvar. Perguntas por tipo de pesquisa, com criar, editar, ligar, desligar e ordenar.
 * Quem só vê é levado ao painel (`TELAS_DE_EDICAO`). */
export default async function ConfigurarAvaliacoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const acesso = await requireAvaliacoes();
  redirecionarSemEdicao(acesso, "/avaliacoes/configurar");
  const podeEditar = temPermissao(acesso, "avaliacoes", "editar");
  const aba = lerAba((await searchParams).aba);
  const pesquisa = await carregarPesquisa(acesso);
  if (!pesquisa) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Configurar as Avaliações</h1>
        <CriarPesquisa unidadeNome={acesso.unidadeNome} podeEditar={podeEditar} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Configurar as Avaliações</h1>
          <p className="text-sm text-cinza-medio">{pesquisa.nomeExibido}</p>
        </div>
        <PausaPesquisa ativa={pesquisa.ativa} podeEditar={podeEditar} />
      </div>

      <nav className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Partes da configuração">
        <div className="flex min-w-max gap-1 border-b border-cinza-claro">
          {ABAS.map((a) => (
            <Link
              key={a.id}
              href={a.id === "perguntas" ? "/avaliacoes/configurar" : `/avaliacoes/configurar?aba=${a.id}`}
              aria-current={a.id === aba ? "page" : undefined}
              scroll={false}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${a.id === aba ? "border-azul-noite text-azul-noite" : "border-transparent text-cinza hover:text-azul-noite"}`}
            >
              {a.rotulo}
            </Link>
          ))}
        </div>
      </nav>

      {aba === "perguntas" && (
        <section className={CARTAO}>
          <h2 className={TITULO}>Perguntas</h2>
          <EditorPerguntas perguntas={pesquisa.perguntas} origens={pesquisa.origens} atendentes={pesquisa.atendentes} podeEditar={podeEditar} />
        </section>
      )}

      {aba === "aparencia" && <AbaAparencia pesquisa={pesquisa} podeEditar={podeEditar} />}
      {aba === "final" && <AbaFinal pesquisa={pesquisa} podeEditar={podeEditar} acesso={acesso} />}
      {aba === "alerta" && <AbaAlerta pesquisa={pesquisa} podeEditar={podeEditar} acesso={acesso} />}
      {aba === "qr" && <AbaQr pesquisa={pesquisa} podeEditar={podeEditar} />}
      {aba === "dados" && <AbaDados pesquisa={pesquisa} organizacao={acesso.organizacaoNome} />}
    </div>
  );
}

type Pesquisa = NonNullable<Awaited<ReturnType<typeof carregarPesquisa>>>;
type Acesso = Awaited<ReturnType<typeof requireAvaliacoes>>;

function AbaAparencia({ pesquisa, podeEditar }: { pesquisa: Pesquisa; podeEditar: boolean }) {
  const logoUrl = urlPublicaLogo(pesquisa.logoPath);
  return (
    <>
      <section className={CARTAO}>
        <h2 className={TITULO}>Logo</h2>
        <div className="flex flex-wrap items-center gap-4">
          {logoUrl ? (
            // Logo pública da unidade (bucket só de logos).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`Logo da ${pesquisa.nomeExibido}`} className="h-20 w-20 rounded-full border border-cinza-claro bg-white object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-cinza-claro text-center text-[11px] text-cinza-medio">sem logo</span>
          )}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-cinza-medio">Aparece redonda na capa e no topo de cada pergunta. PNG ou JPEG, até 300 KB.</p>
            {podeEditar && <LogoUpload temLogo={Boolean(logoUrl)} />}
          </div>
        </div>
      </section>
      <section className={CARTAO}>
        <CampoSalvavel
          titulo="Nome do restaurante na página"
          explicacao={'Aparece na capa ("Como foi sua experiência na ...?") e nos botões.'}
          valor={pesquisa.nomeExibido}
          campo="nomeExibido"
          maximo={LIMITE_NOME}
          podeEditar={podeEditar}
        />
      </section>
      <section className={CARTAO}>
        <h2 className={TITULO}>Cores</h2>
        <EditorCores nome={pesquisa.nomeExibido} principal={pesquisa.corPrincipal} fundo={pesquisa.corFundo} podeEditar={podeEditar} />
      </section>
    </>
  );
}

async function AbaFinal({ pesquisa, podeEditar, acesso }: { pesquisa: Pesquisa; podeEditar: boolean; acesso: Acesso }) {
  const premios = pesquisa.origens.includes("app") ? await carregarPremios(acesso) : [];
  return (
    <>
      <p className="text-sm text-cinza">Depois de enviar, o cliente vê a mensagem de obrigado e, embaixo, os botões que você deixar ligados.</p>
      <section className={CARTAO}>
        <CampoSalvavel
          titulo="Mensagem de obrigado"
          valor={pesquisa.textoAgradecimento}
          campo="textoAgradecimento"
          multilinha
          maximo={LIMITE_AGRADECIMENTO}
          podeEditar={podeEditar}
        />
      </section>
      <section className={CARTAO}>
        <CampoSalvavel
          titulo="Botão Avaliar no Google"
          explicacao={
            <>
              No Perfil da Empresa no Google, toque em &quot;Pedir avaliações&quot; e cole o link aqui. O botão aparece para todos, qualquer nota (regra do Google), com o
              comentário já copiado. Sem link, sem botão.
            </>
          }
          valor={pesquisa.linkGoogle ?? ""}
          campo="linkGoogle"
          tipo="url"
          placeholder="https://g.page/r/.../review"
          podeEditar={podeEditar}
          vazio="Sem link: o botão não aparece."
        />
      </section>
      {pesquisa.origens.includes("app") && (
        <>
          <section className={CARTAO}>
            <CampoSalvavel
              titulo="Pedir direto com vocês (só apps de entrega)"
              explicacao="Site, cardápio digital ou WhatsApp de pedidos. Quem pediu pelo iFood ou 99 vê o convite para pedir direto da próxima vez."
              valor={pesquisa.linkPedidoDireto ?? ""}
              campo="linkPedidoDireto"
              tipo="url"
              placeholder="https://..."
              podeEditar={podeEditar}
              vazio="Sem link: o convite não aparece."
            />
          </section>
          <section className={CARTAO}>
            <h2 className={TITULO}>Roleta de prêmios (só apps de entrega)</h2>
            {pesquisa.roletaAtiva && !pesquisa.linkPedidoDireto && (
              <p className="text-xs font-semibold text-ambar">Sem o link de pedir direto, o cliente ganha o cupom mas não vê o botão para pedir. Preencha o campo acima.</p>
            )}
            <EditorRoleta
              ativa={pesquisa.roletaAtiva}
              validadeDias={pesquisa.cupomValidadeDias}
              premios={premios}
              podeEditar={podeEditar}
              marca={{ nome: pesquisa.nomeExibido, corPrincipal: pesquisa.corPrincipal, corFundo: pesquisa.corFundo, linkPedidoDireto: pesquisa.linkPedidoDireto }}
            />
            <p className="text-xs text-cinza-medio">
              A baixa do cupom fica na aba{" "}
              <Link href="/avaliacoes/cupons" className="font-semibold text-azul-petroleo underline">
                Cupons
              </Link>
              .
            </p>
          </section>
        </>
      )}
    </>
  );
}

async function AbaAlerta({ pesquisa, podeEditar, acesso }: { pesquisa: Pesquisa; podeEditar: boolean; acesso: Acesso }) {
  const [destinatarios, situacao] = await Promise.all([carregarDestinatarios(acesso, pesquisa.alertaVinculoId), carregarSituacaoAlertas(acesso)]);
  return (
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
  );
}

function AbaQr({ pesquisa, podeEditar }: { pesquisa: Pesquisa; podeEditar: boolean }) {
  const base = urlBase();
  return (
    <>
      <section className={CARTAO}>
        <h2 className={TITULO}>Tipos de pesquisa</h2>
        <p className="text-sm text-cinza">Cada tipo tem o próprio QR, as próprias perguntas e aparece separado no painel. Desligue o que o restaurante não usa.</p>
        <TiposPesquisa ligadas={pesquisa.origens} podeEditar={podeEditar} />
      </section>
      <section className={CARTAO}>
        <h2 className={TITULO}>Endereço de cada QR</h2>
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
    </>
  );
}

async function AbaDados({ pesquisa, organizacao }: { pesquisa: Pesquisa; organizacao: string | null }) {
  const supabase = await createClient();
  const { data: termo } = await supabase.from("avaliacoes_termos").select("versao, modelo").order("versao", { ascending: false }).limit(1).maybeSingle();
  const termoAtual = termo as { versao: number; modelo: string } | null;
  return (
    <section className={CARTAO}>
      <h2 className={TITULO}>Dados de quem responde (LGPD)</h2>
      <p className="text-sm text-cinza">
        A pesquisa não pede nome nem e-mail. O WhatsApp é opcional e só é guardado se a pessoa marcar a autorização (que vem desmarcada). Guardamos a data, a versão e a cópia
        do texto que ela aceitou. O IP não é guardado: só um código embaralhado, usado para barrar envio repetido. A {organizacao || "empresa"} é a controladora desses dados; a
        Zatti, a operadora.
      </p>
      {termoAtual && (
        <blockquote className="rounded-md bg-off-white p-3 text-sm text-azul-noite">
          Texto da autorização (versão {termoAtual.versao}): {termoAtual.modelo.replaceAll("{restaurante}", pesquisa.nomeExibido)}
        </blockquote>
      )}
    </section>
  );
}
