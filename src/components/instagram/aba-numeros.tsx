"use client";

import { useState } from "react";
import { Secao, Vazio } from "@/components/clientes/ui";
import { DicaCalculo } from "@/components/dica-calculo";
import { CartaoNumero } from "@/components/instagram/cartao-numero";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import {
  SEM_DADO,
  diaMes,
  diaSemana,
  diasDoPeriodo,
  formatoQueMaisSalva,
  mediaPerfis,
  numeroBr,
  percentualBr,
  variacao,
} from "@/lib/instagram/painel";
import { dataHoraBr, diaBr } from "@/lib/operacao/quadro";
import { PERIODOS, type Concorrencia, type Metricas, type NumerosPerfil, type PecaSemana, type Periodo } from "@/lib/instagram/tipos";

/** Aba "Números": alcance, engajamento, salvamentos e seguidores do período,
 * alcance por dia, comparação com a concorrência e o que postar na semana. */
export function AbaNumeros({
  metricas,
  concorrencia,
  pecasSemana,
}: {
  metricas: Metricas | null;
  concorrencia: Concorrencia | null;
  pecasSemana: PecaSemana[] | null;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("7");

  return (
    <div className="flex flex-col gap-4">
      {metricas && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-cinza-medio">
              {metricas.atualizadoEm ? `Números da Meta lidos em ${dataHoraBr(metricas.atualizadoEm)}.` : "A Meta ainda não devolveu os números."}
            </p>
            <div role="group" aria-label="Período" className="flex gap-1 rounded-lg border border-cinza-claro bg-branco p-1">
              {PERIODOS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={periodo === p}
                  title={`Mostra os números dos últimos ${p} dias`}
                  onClick={() => setPeriodo(p)}
                  className={`rounded-md px-3 py-1 text-sm font-semibold ${periodo === p ? "bg-azul-noite text-branco" : "text-cinza-medio hover:text-azul-noite"}`}
                >
                  {p} dias
                </button>
              ))}
            </div>
          </div>
          <Cartoes metricas={metricas} periodo={periodo} />
          <AlcancePorDia metricas={metricas} periodo={periodo} />
          <VoceConcorrencia voce={metricas.voce} concorrencia={concorrencia} />
          <FormatoQueSalva metricas={metricas} />
        </>
      )}
      <OQuePostar pecas={pecasSemana} />
    </div>
  );
}

function Cartoes({ metricas, periodo }: { metricas: Metricas; periodo: Periodo }) {
  const d = metricas.periodos[periodo];
  const ant = d?.anterior;
  const somado = periodo === "90" && metricas.alcance90Somado;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CartaoNumero
        rotulo="Alcance"
        valor={numeroBr(d?.alcance ?? null)}
        variacao={variacao(d?.alcance ?? null, ant?.alcance)}
        dica={
          somado
            ? "Contas diferentes que viram seus posts nos últimos 90 dias. A Meta só entrega até 30 dias por vez, então os 90 dias são a soma de 3 blocos de 30: a mesma pessoa pode contar mais de uma vez. A variação compara com os 90 dias anteriores."
            : `Contas diferentes que viram seus posts nos últimos ${periodo} dias, segundo a Meta. A variação compara com os ${periodo} dias anteriores.`
        }
      />
      <CartaoNumero
        rotulo="Engajamento"
        valor={percentualBr(d?.engajamento ?? null)}
        variacao={variacao(d?.engajamento ?? null, ant?.engajamento, true)}
        dica={`Interações (curtidas, comentários, salvamentos, compartilhamentos) divididas pelo alcance, vezes 100, nos últimos ${periodo} dias. A variação é em pontos percentuais (p.p.) contra os ${periodo} dias anteriores.`}
      />
      <CartaoNumero
        rotulo="Salvamentos"
        valor={numeroBr(d?.salvamentos ?? null)}
        variacao={variacao(d?.salvamentos ?? null, ant?.salvamentos)}
        dica={`Soma das vezes que alguém salvou um post seu nos últimos ${periodo} dias. A variação compara com os ${periodo} dias anteriores.`}
      />
      <CartaoNumero
        rotulo="Novos seguidores"
        valor={numeroBr(d?.seguidoresNovos ?? null)}
        variacao={variacao(d?.seguidoresNovos ?? null, ant?.seguidoresNovos)}
        dica={`Contas que começaram a seguir você nos últimos ${periodo} dias, segundo a Meta. A Meta entrega esse número com até 2 dias de atraso, então os 2 dias mais recentes podem ainda não estar somados. A Meta só guarda 30 dias para trás: o de 90 dias aparece quando o Vini tiver juntado 90 dias de registro. A variação compara com os ${periodo} dias anteriores.`}
      />
    </div>
  );
}

function AlcancePorDia({ metricas, periodo }: { metricas: Metricas; periodo: Periodo }) {
  const dias = diasDoPeriodo(metricas.porDia, periodo);
  const maximo = Math.max(0, ...dias.map((d) => d.alcance ?? 0));
  const poucos = dias.length <= 10;
  return (
    <Secao titulo="Alcance por dia">
      {dias.length === 0 || maximo === 0 ? (
        <Vazio>Sem dado de alcance por dia neste período.</Vazio>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-cinza-medio">Maior dia: {numeroBr(maximo)}</p>
          <div className={`flex h-40 items-end ${poucos ? "gap-2" : "gap-px"}`} role="img" aria-label={`Alcance por dia nos últimos ${periodo} dias`}>
            {dias.map((d) => (
              <div
                key={d.dia}
                title={`${diaBr(d.dia)}: ${d.alcance == null ? SEM_DADO : numeroBr(d.alcance)}`}
                className={`flex-1 rounded-t-sm ${d.alcance == null ? "border border-dashed border-cinza-claro" : "bg-azul-petroleo"}`}
                style={{ height: d.alcance == null ? "100%" : `${Math.max(2, (d.alcance / maximo) * 100)}%` }}
              />
            ))}
          </div>
          {poucos ? (
            <div className="flex gap-2">
              {dias.map((d) => (
                <span key={d.dia} className="flex-1 text-center text-xs text-cinza-medio">
                  {diaSemana(d.dia)}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex justify-between text-xs text-cinza-medio">
              <span>{diaMes(dias[0].dia)}</span>
              <span>{diaMes(dias[dias.length - 1].dia)}</span>
            </div>
          )}
        </div>
      )}
    </Secao>
  );
}

const LINHAS: { campo: keyof NumerosPerfil; rotulo: string; casas: number }[] = [
  { campo: "postsPorSemana", rotulo: "Posts por semana", casas: 1 },
  { campo: "viewsPorPost", rotulo: "Views por post", casas: 0 },
  { campo: "interacoesPorPost", rotulo: "Interações por post", casas: 0 },
];

function VoceConcorrencia({ voce, concorrencia }: { voce: NumerosPerfil; concorrencia: Concorrencia | null }) {
  const perfis = concorrencia?.perfis ?? [];
  const lido = concorrencia?.lidoEm;
  return (
    <Secao titulo="Você x concorrência">
      {!lido ? (
        <Vazio>A primeira leitura da concorrência sai na rodada de segunda do Afonso.</Vazio>
      ) : (
        <>
          <p className="text-xs text-cinza-medio">Concorrência lida em {diaBr(lido)}, na rodada de segunda do Afonso.</p>
          <TabelaRolavel ariaLabel="Você x concorrência" className="max-h-[70vh] rounded-lg border border-cinza-claro bg-branco">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th fixo>Número</Th>
                  <Th align="right">Você</Th>
                  <Th align="right">
                    <span className="inline-flex items-center gap-1">
                      Média dos perfis
                      <DicaCalculo
                        rotulo="Média dos perfis"
                        texto="Média simples dos perfis concorrentes que têm o número: soma dos valores dividida pela quantidade de perfis com dado. Perfil sem dado fica de fora da conta."
                      />
                    </span>
                  </Th>
                  {perfis.map((p) => (
                    <Th key={p.perfil} align="right">
                      @{p.perfil}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LINHAS.map((l) => (
                  <tr key={l.campo} className="border-t border-cinza-claro">
                    <td className="sticky left-0 bg-branco px-3 py-2 text-azul-noite">{l.rotulo}</td>
                    <td className="px-3 py-2 text-right font-bold text-azul-noite tabular-nums">{numeroBr(voce[l.campo], l.casas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{numeroBr(mediaPerfis(perfis, l.campo), l.casas)}</td>
                    {perfis.map((p) => (
                      <td key={p.perfil} className="px-3 py-2 text-right tabular-nums text-cinza">
                        {numeroBr(p[l.campo], l.casas)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        </>
      )}
    </Secao>
  );
}

function FormatoQueSalva({ metricas }: { metricas: Metricas }) {
  const f = formatoQueMaisSalva(metricas.formatos);
  return (
    <p className="flex flex-wrap items-center gap-1 rounded-xl border border-cinza-claro bg-branco px-4 py-3 text-sm text-azul-noite">
      <span className="font-bold">Formato que mais salva:</span>
      {f ? (
        <span>
          {f.formato}, {numeroBr(f.salvamentosPorPost, 1)} salvamentos por post ({f.posts} post{f.posts === 1 ? "" : "s"})
        </span>
      ) : (
        <span className="text-cinza-medio">{SEM_DADO}</span>
      )}
      <DicaCalculo
        rotulo="Formato que mais salva"
        texto="Para cada formato (Reels, Carrossel, Foto) dos seus posts recentes que o Vini leu da Meta: salvamentos somados divididos pela quantidade de posts daquele formato. Aparece o formato com a maior média."
      />
    </p>
  );
}

function OQuePostar({ pecas }: { pecas: PecaSemana[] | null }) {
  return (
    <Secao titulo="O que postar essa semana">
      {pecas == null ? (
        <Vazio>Não consegui ler o Calendário de Conteúdo agora. Recarregue a página em instantes.</Vazio>
      ) : pecas.length === 0 ? (
        <Vazio>Nenhuma peça no Calendário de Conteúdo para os próximos 7 dias.</Vazio>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pecas.map((p) => (
            <li key={p.id} className="flex flex-col gap-1 rounded-lg border border-cinza-claro bg-off-white p-3">
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-azul-noite px-1.5 py-0.5 font-bold uppercase text-branco">
                  {diaSemana(p.data)} {diaMes(p.data)}
                </span>
                <span className="font-semibold text-azul-petroleo">{p.formato || "Formato não definido"}</span>
              </p>
              <p className="text-sm text-azul-noite">{p.titulo || "Sem título"}</p>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}
