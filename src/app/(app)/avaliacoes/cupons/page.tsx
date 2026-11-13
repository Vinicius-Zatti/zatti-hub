import Link from "next/link";
import { temPermissao } from "@/lib/acesso";
import { requireAvaliacoes } from "@/lib/avaliacoes/acesso";
import { carregarCupons, carregarPesquisa, LIMITE_CUPONS_TELA } from "@/lib/avaliacoes/servidor";
import { dataHoraBr, intervaloPeriodo, lerPeriodo, PERIODOS } from "@/lib/avaliacoes/painel";
import { cupomVencido, resumirCupons } from "@/lib/avaliacoes/roleta";
import { DicaCalculo } from "@/components/dica-calculo";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { CriarPesquisa } from "@/components/avaliacoes/criar-pesquisa";
import { BaixaCupom } from "@/components/avaliacoes/baixa-cupom";

const PILULA = "rounded-md px-3 py-1.5 text-xs font-semibold";
const DICA_USO =
  "Cupons usados divididos pelos cupons sorteados no período. Mostra quantos clientes que pediram pelo app voltaram para pedir direto com vocês.";

/** Cupons da roleta (13/11/2026): dar baixa no código que o cliente informa no pedido direto e ver
 * quantos clientes dos apps voltaram pelo pedido direto. */
export default async function CuponsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const acesso = await requireAvaliacoes();
  const podeEditar = temPermissao(acesso, "avaliacoes", "editar");
  const pesquisa = await carregarPesquisa(acesso);
  if (!pesquisa) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Cupons da roleta</h1>
        <CriarPesquisa unidadeNome={acesso.unidadeNome} podeEditar={podeEditar} />
      </div>
    );
  }
  const periodo = lerPeriodo((await searchParams).periodo);
  const { desdeIso } = intervaloPeriodo(periodo);
  const cupons = await carregarCupons(acesso, desdeIso);
  const r = resumirCupons(cupons);

  const cartoes = [
    { rotulo: "Sorteados", valor: String(r.emitidos), extra: "cupons ganhos na roleta" },
    { rotulo: "Usados", valor: String(r.usados), extra: "viraram pedido direto" },
    { rotulo: "Uso", valor: r.taxaUso === null ? "-" : `${r.taxaUso}%`, extra: "dos sorteados", dica: DICA_USO },
    { rotulo: "Em aberto", valor: String(r.abertos), extra: `${r.vencidos} venceram sem uso` },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Cupons da roleta</h1>
        <p className="text-sm text-cinza-medio">
          {pesquisa.roletaAtiva ? "Roleta ligada no fim da pesquisa dos apps." : "Roleta desligada. Ligue em Configurar."} O cliente informa o código no pedido direto; confira aqui
          antes de dar o prêmio.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <h2 className="font-display text-lg font-bold text-azul-noite">Dar baixa</h2>
        <BaixaCupom podeEditar={podeEditar} />
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Período">
        {PERIODOS.map((p) => (
          <Link
            key={p}
            href={`/avaliacoes/cupons?periodo=${p}`}
            aria-current={p === periodo ? "page" : undefined}
            className={p === periodo ? `${PILULA} bg-azul-noite text-branco` : `${PILULA} border border-cinza-claro bg-branco text-azul-noite hover:border-azul-petroleo`}
          >
            Últimos {p} dias
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-cinza-claro bg-branco p-3">
            <p className="flex items-center gap-1 text-xs font-semibold text-cinza-medio">
              {c.rotulo}
              {c.dica ? <DicaCalculo rotulo={c.rotulo.toLowerCase()} texto={c.dica} /> : null}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-azul-noite">{c.valor}</p>
            <p className="text-xs text-cinza-medio">{c.extra}</p>
          </div>
        ))}
      </div>

      {cupons.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">Nenhum cupom sorteado neste período.</p>
      ) : (
        <TabelaRolavel ariaLabel="Cupons">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="128px">Sorteado em</Th>
                <Th larguraFixa="96px">Código</Th>
                <Th>Prêmio</Th>
                <Th larguraFixa="110px">WhatsApp</Th>
                <Th larguraFixa="128px">Vale até</Th>
                <Th larguraFixa="140px">Situação</Th>
              </tr>
            </thead>
            <tbody>
              {cupons.map((c) => (
                <tr key={c.id} className="border-b border-cinza-claro">
                  <td className="whitespace-nowrap px-3 py-2">{dataHoraBr(c.criadoEm)}</td>
                  <td className="px-3 py-2 font-mono font-semibold tracking-widest">{c.codigo}</td>
                  <td className="px-3 py-2">
                    {c.premio}
                    {c.regra ? <span className="block text-xs text-cinza-medio">{c.regra}</span> : null}
                  </td>
                  <td className="px-3 py-2">final {c.whatsappFinal}</td>
                  <td className="whitespace-nowrap px-3 py-2">{dataHoraBr(c.validoAte)}</td>
                  <td className="px-3 py-2">
                    {c.usadoEm ? (
                      <span className="font-semibold text-verde">Usado em {dataHoraBr(c.usadoEm)}</span>
                    ) : cupomVencido(c.validoAte) ? (
                      <span className="text-cinza-medio">Venceu</span>
                    ) : (
                      <span className="text-azul-noite">Em aberto</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
      {cupons.length >= LIMITE_CUPONS_TELA && <p className="text-xs text-cinza-medio">Mostrando os {LIMITE_CUPONS_TELA} mais recentes. Escolha um período menor.</p>}
    </div>
  );
}
