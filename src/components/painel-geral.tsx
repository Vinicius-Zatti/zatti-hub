import Link from "next/link";
import type { ReactNode } from "react";

export type DadosPainelGeral = {
  saudacao: string;
  nomeUsuario: string;
  dataHoje: string;
  organizacaoNome: string;
  unidadeNome: string;
  produtosAtivos: number;
  grupos: number;
  fornecedores: number | null;
  ultimaContagem: string | null;
  itensContados: number;
  valorEstoque: number;
  alertasCompra: number;
  possiveisErros: number;
  produtosSemPreco: number;
  pedidosPendentes: number;
  valorPedidosPendentes: number;
};

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function PainelGeral({ dados }: { dados: DadosPainelGeral }) {
  const temAtencao =
    dados.alertasCompra +
      dados.possiveisErros +
      dados.produtosSemPreco +
      dados.pedidosPendentes >
    0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="flex items-center gap-2 text-sm font-medium text-cinza-medio">
          <Icone nome="calendario" className="h-4 w-4" />
          {dados.dataHoje}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-azul-noite sm:text-4xl">
          {dados.saudacao}{dados.nomeUsuario ? `, ${dados.nomeUsuario}` : ""}
        </h1>
        <p className="mt-1 text-sm text-cinza-medio">
          Painel geral de {dados.organizacaoNome} - {dados.unidadeNome}
        </p>
      </header>

      <section aria-label="Resumo do dia" className="grid gap-3 md:grid-cols-3">
        <CartaoResumo
          titulo="Cadastro"
          descricao="Base pronta para a operação"
          icone={<Icone nome="caixa" />}
          href="/estoque/produtos"
        >
          <Metrica valor={String(dados.produtosAtivos)} rotulo="produtos ativos" />
          <Metrica valor={String(dados.grupos)} rotulo="grupos" />
          {dados.fornecedores !== null && (
            <Metrica valor={String(dados.fornecedores)} rotulo="fornecedores" />
          )}
        </CartaoResumo>

        <CartaoResumo
          titulo="Contagem de estoque"
          descricao={dados.ultimaContagem ? `Última em ${dados.ultimaContagem}` : "Ainda sem contagem"}
          icone={<Icone nome="lista" />}
          href="/estoque/contagem/visualizacao"
          destaque={dados.alertasCompra > 0}
        >
          <Metrica valor={String(dados.itensContados)} rotulo="itens contados" />
          <Metrica
            valor={String(dados.alertasCompra)}
            rotulo="pedem compra"
            alerta={dados.alertasCompra > 0}
          />
        </CartaoResumo>

        <CartaoResumo
          titulo="Compras"
          descricao="Pedidos fechados aguardando recebimento"
          icone={<Icone nome="carrinho" />}
          href="/estoque/pedidos/feitos"
          destaque={dados.pedidosPendentes > 0}
        >
          <Metrica
            valor={String(dados.pedidosPendentes)}
            rotulo="pedidos pendentes"
            alerta={dados.pedidosPendentes > 0}
          />
          <Metrica valor={moeda.format(dados.valorPedidosPendentes)} rotulo="valor estimado" />
        </CartaoResumo>
      </section>

      <section aria-labelledby="titulo-estoque">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="titulo-estoque" className="flex items-center gap-2 font-display text-2xl font-bold text-azul-noite">
            <Icone nome="caixa" className="h-6 w-6 text-ambar" />
            Estoque
          </h2>
          <Link href="/estoque/produtos" className="text-sm font-semibold text-azul-petroleo hover:text-ambar">
            Abrir módulo
          </Link>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <div className="rounded-xl border border-cinza-claro bg-branco p-5 shadow-sm sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-cinza-medio">
              Valor na última contagem
            </p>
            <p className="mt-2 break-words text-4xl font-bold tracking-tight text-azul-noite sm:text-5xl">
              {moeda.format(dados.valorEstoque)}
            </p>
            <p className="mt-2 text-sm text-cinza-medio">
              {dados.ultimaContagem
                ? `${dados.itensContados} itens registrados em ${dados.ultimaContagem}.`
                : "Faça a primeira contagem para formar esta visão."}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-cinza-claro pt-5 sm:grid-cols-3">
              <MetricaGrande valor={String(dados.produtosAtivos)} rotulo="Produtos ativos" />
              <MetricaGrande valor={String(dados.grupos)} rotulo="Grupos" />
              <MetricaGrande valor={String(dados.itensContados)} rotulo="Itens contados" />
            </div>
          </div>

          <div className={`rounded-xl border bg-branco p-5 shadow-sm ${temAtencao ? "border-ambar/70" : "border-cinza-claro"}`}>
            <h3 className="flex items-center gap-2 text-base font-bold text-azul-noite">
              <Icone nome="alerta" className={temAtencao ? "text-ambar" : "text-verde"} />
              Pontos de atenção
            </h3>
            {temAtencao ? (
              <div className="mt-4 flex flex-col gap-2.5">
                <LinhaAtencao valor={dados.alertasCompra} texto="itens abaixo do estoque mínimo" href="/estoque/contagem/visualizacao" />
                <LinhaAtencao valor={dados.pedidosPendentes} texto="pedidos aguardando recebimento" href="/estoque/pedidos/feitos" />
                <LinhaAtencao valor={dados.produtosSemPreco} texto="produtos ativos sem preço" href="/estoque/produtos" />
                <LinhaAtencao valor={dados.possiveisErros} texto="possíveis erros de contagem" href="/estoque/contagem/visualizacao" />
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-verde/10 px-3 py-3 text-sm font-medium text-verde">
                Nenhuma pendência encontrada nos dados atuais.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function CartaoResumo({ titulo, descricao, icone, href, destaque = false, children }: {
  titulo: string;
  descricao: string;
  icone: ReactNode;
  href: string;
  destaque?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={`group rounded-xl border bg-branco p-4 shadow-sm transition-colors hover:border-ambar ${destaque ? "border-ambar/70" : "border-cinza-claro"}`}>
      <div className="flex items-start justify-between gap-3 border-b border-cinza-claro pb-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ambar/10 text-ambar">{icone}</span>
          <div className="min-w-0">
            <h2 className="font-bold text-azul-noite">{titulo}</h2>
            <p className="truncate text-xs text-cinza-medio" title={descricao}>{descricao}</p>
          </div>
        </div>
        <Link href={href} aria-label={`Abrir ${titulo}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ambar/15 text-azul-noite transition-colors group-hover:bg-ambar">
          <Icone nome="seta" className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">{children}</div>
    </article>
  );
}

function Metrica({ valor, rotulo, alerta = false }: { valor: string; rotulo: string; alerta?: boolean }) {
  return <div><p className={`text-xl font-bold ${alerta ? "text-ambar" : "text-azul-noite"}`}>{valor}</p><p className="text-xs text-cinza-medio">{rotulo}</p></div>;
}

function MetricaGrande({ valor, rotulo }: { valor: string; rotulo: string }) {
  return <div><p className="text-2xl font-bold text-azul-noite">{valor}</p><p className="text-xs text-cinza-medio">{rotulo}</p></div>;
}

function LinhaAtencao({ valor, texto, href }: { valor: number; texto: string; href: string }) {
  if (valor === 0) return null;
  return <Link href={href} className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-off-white px-3 py-2 text-sm text-cinza transition-colors hover:bg-ambar/10"><span>{texto}</span><strong className="text-ambar">{valor}</strong></Link>;
}

function Icone({ nome, className = "h-5 w-5" }: { nome: "calendario" | "caixa" | "lista" | "carrinho" | "alerta" | "seta"; className?: string }) {
  const formas = {
    calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    caixa: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /><path d="M12 11v10" /></>,
    lista: <><path d="m4 7 2 2 4-4M4 14l2 2 4-4M13 7h7M13 14h7M13 19h7" /></>,
    carrinho: <><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.7a2 2 0 0 0 1.9-1.4L21 8H7" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    alerta: <><path d="M12 3 2.8 19a1.4 1.4 0 0 0 1.2 2h16a1.4 1.4 0 0 0 1.2-2L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
    seta: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  }[nome];
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{formas}</svg>;
}
