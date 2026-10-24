import { EstruturaAplicativo } from "@/components/estrutura-aplicativo";
import { EstruturaAplicativoV2 } from "@/components/estrutura-aplicativo-v2";
import type { ItemNavegacao } from "@/lib/navegacao/tipos";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { escolherAtalhos } from "@/lib/navegacao/atalhos";
import {
  montarMenuRestaurante,
  montarMenuRestaurantePiloto,
  contextoMenuRestaurante,
} from "@/lib/navegacao/menu-restaurante";
import { UnidadeSuporteProvider } from "@/components/contexto-suporte";
import { GuardaContagemProvider } from "@/components/guarda-contagem";
import { GuardaEdicaoProvider } from "@/components/guarda-edicao";
import { getAcessoAtual } from "@/lib/acesso";
import { lerFlagsConciliacao } from "@/lib/banco/conciliacao";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CABECALHO_CAMINHO, ehCaminhoRestaurante } from "@/lib/area-interna/caminhos";
import { FaixaAssinatura } from "@/components/assinatura/faixa-assinatura";
import { getAssinaturaAtual } from "@/lib/assinatura/app";
import { faixaAssinatura } from "@/lib/assinatura/regras";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getAcessoAtual();
  // Zatti HUB (área do Vinícius) não tem tela de restaurante: link antigo ou
  // favorito de /painel, /estoque... volta para o Início dela.
  if (acesso.areaInterna && ehCaminhoRestaurante((await headers()).get(CABECALHO_CAMINHO) ?? "")) {
    redirect("/inicio");
  }
  const podeGerir = acesso.role !== "operacional";
  // Vigência anual (15/10/2026): depois da carência o cliente trava, sem perder dado. O master
  // nunca trava (vê a faixa para saber a situação do cliente).
  const [assinatura, conciliacaoHabilitada] = await Promise.all([
    acesso.areaInterna ? null : getAssinaturaAtual(acesso.organizacaoId),
    acesso.financeiroGerencialHabilitado && !acesso.areaInterna
      ? lerFlagsConciliacao(acesso.unidadeId).then((f) => f.habilitada)
      : false,
  ]);
  if (assinatura?.situacao.tipo === "bloqueada" && acesso.role !== "master") redirect("/assinatura-vencida");
  const faixa = assinatura ? faixaAssinatura(assinatura.situacao, podeGerir) : null;
  const nomeUnidadeSuporte =
    acesso.organizacaoNome && acesso.organizacaoNome !== acesso.unidadeNome
      ? `${acesso.organizacaoNome} - ${acesso.unidadeNome}`
      : acesso.unidadeNome;

  // Área de trabalho do Vinícius (organização "Zatti HUB", 15/10/2026): menu
  // próprio, sem módulos de restaurante. Esconder é só UX - a barreira é
  // `requireMaster()`/`requireEscritorio()` em cada layout e Server Action.
  const itensAreaInterna: ItemNavegacao[] = [
    { label: "Início", href: "/inicio", icone: "painel", activePrefix: "/inicio", disabled: false },
    {
      label: "Agenda",
      href: "/agenda/dia",
      icone: "agenda",
      activePrefix: "/agenda",
      disabled: false,
      sections: [
        {
          label: "Agenda",
          items: [
            { label: "Dia", href: "/agenda/dia" },
            { label: "Rotina da semana", href: "/agenda/semana" },
          ],
        },
      ],
    },
    // Painel de operação (16/10/2026): quadro do que vive no WhatsApp do Vini.
    { label: "Operação", href: "/escritorio/operacao", icone: "tarefas", activePrefix: "/escritorio/operacao", disabled: false },
    {
      label: "Meu Tempo",
      href: "/meu-tempo/hoje",
      icone: "meuTempo",
      activePrefix: "/meu-tempo",
      disabled: false,
      sections: [
        {
          label: "Meu Tempo",
          items: [
            { label: "Hoje", href: "/meu-tempo/hoje" },
            { label: "Painel mensal", href: "/meu-tempo/painel" },
            { label: "Histórico", href: "/meu-tempo/historico" },
            { label: "Configurações", href: "/meu-tempo/configuracoes" },
          ],
        },
      ],
    },
    { label: "Comercial", href: "/escritorio/comercial", icone: "financeiro", activePrefix: "/escritorio/comercial", disabled: false },
    { label: "Clientes", href: "/escritorio/clientes", icone: "organizacao", activePrefix: "/escritorio/clientes", disabled: false },
    { label: "Conteúdo", href: "/escritorio/conteudo", icone: "marketing", activePrefix: "/escritorio/conteudo", disabled: false },
    // "/escritorio" é prefixo das quatro (Operação, Comercial, Clientes, Conteúdo); o menu marca o prefixo mais longo.
    { label: "Time de IA", href: "/escritorio", icone: "escritorio", activePrefix: "/escritorio", disabled: false },
    { label: "Acessos", href: "/acessos", icone: "acessos", activePrefix: "/acessos", disabled: false },
  ];

  // Menu do restaurante: mesmas regras de papel e flags nos dois menus
  // (`lib/navegacao/menu-restaurante.ts`). A unidade piloto da Navegação V2
  // (`lib/navegacao/piloto.ts`) vê o menu em sanfona; as demais, o atual.
  const navegacaoV2 = usaNavegacaoV2(acesso);
  const contextoMenu = contextoMenuRestaurante(acesso, conciliacaoHabilitada);
  const itensRestaurante = navegacaoV2
    ? montarMenuRestaurantePiloto(contextoMenu)
    : montarMenuRestaurante(contextoMenu);
  const propsEstrutura = {
    items: acesso.areaInterna ? itensAreaInterna : itensRestaurante,
    organizacaoAtual: acesso.organizacaoId,
    organizacaoNome: acesso.organizacaoNome,
    organizacoes: acesso.organizacoesDisponiveis,
    usuarioEmail: acesso.usuarioEmail,
    usuarioNome: acesso.usuarioNome,
  };
  const conteudo = (
    // Nome da unidade para a mensagem de suporte do cartão de erro.
    <UnidadeSuporteProvider unidade={nomeUnidadeSuporte}>
      {faixa ? <FaixaAssinatura faixa={faixa} link={assinatura?.link ?? null} /> : null}
      {children}
    </UnidadeSuporteProvider>
  );

  return (
    <GuardaContagemProvider>
      <GuardaEdicaoProvider>
        {navegacaoV2 ? (
          // Barra inferior do celular e abas dos módulos: tirados do mesmo menu (papel e flags iguais).
          <EstruturaAplicativoV2
            {...propsEstrutura}
            atalhos={escolherAtalhos(itensRestaurante)}
            unidadeNome={acesso.unidadeNome}
          >
            {conteudo}
          </EstruturaAplicativoV2>
        ) : (
          <EstruturaAplicativo {...propsEstrutura}>{conteudo}</EstruturaAplicativo>
        )}
      </GuardaEdicaoProvider>
    </GuardaContagemProvider>
  );
}
