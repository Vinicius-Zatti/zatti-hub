"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { acaoOperacaoAction } from "@/app/(app)/escritorio/operacao/actions";
import { Selo, classeCampo } from "@/components/clientes/ui";
import {
  AvisoMover,
  CampoFiltro,
  ColunaKanban,
  Indicador,
  QuadroColunas,
  propsCartaoArrastavel,
  useArrasteColunas,
  type ArrasteCartao,
} from "@/components/operacao/kanban";
import { FichaItemOperacao } from "@/components/operacao/ficha-item";
import {
  DIAS_PARADO_ALERTA,
  agruparPorColuna,
  diasParado,
  filtrarItens,
  indicadoresQuadro,
  opcoesCliente,
  rotuloSelo,
  textoDiasParado,
  type FiltroQuadro,
} from "@/lib/operacao/quadro";
import { ROTULO_COLUNA, ROTULO_TIPO, TIPOS_ITEM, type Coluna, type ItemOperacao } from "@/lib/operacao/tipos";

/** Aba "Quadro": demandas, atas, pautas, ações e alertas do Vini por coluna.
 * Arrastar muda a coluna na hora (otimista) e volta com aviso se o Vini
 * recusar. Soltar em Resolvida manda a coluna; o Vini resolve quando o item permite. No celular, lista
 * agrupada sem arrastar: mover fica na ficha. */
export function QuadroOperacao({ itens, hoje }: { itens: ItemOperacao[]; hoje: string }) {
  const [filtro, setFiltro] = useState<FiltroQuadro>({ tipo: "", cliente: "" });
  const [movidos, setMovidos] = useState<Record<string, { coluna: Coluna; em: number }>>({});
  const [base, setBase] = useState(itens);
  if (base !== itens) {
    setBase(itens);
    setMovidos({});
  }
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const fechar = useCallback(() => setAberto(null), []);

  const naTela = useMemo(
    () => itens.map((i) => {
        const m = movidos[i.chave];
        return m && m.coluna !== i.coluna ? { ...i, coluna: m.coluna, desdeEm: m.em } : i;
      }),
    [itens, movidos],
  );
  const visiveis = useMemo(() => filtrarItens(naTela, filtro), [naTela, filtro]);
  const grupos = agruparPorColuna(visiveis);
  const ind = indicadoresQuadro(visiveis, hoje);
  const clientes = useMemo(() => opcoesCliente(itens), [itens]);

  const { propsColuna, arrasteDe } = useArrasteColunas<Coluna>((chave, coluna) => {
    const item = naTela.find((i) => i.chave === chave);
    if (!item || item.coluna === coluna) return;
    setAviso(null);
    setMovidos((m) => ({ ...m, [chave]: { coluna, em: Date.now() } }));
    iniciar(async () => {
      const r = await acaoOperacaoAction({ chave, acao: "coluna", coluna });
      if (!r.ok) {
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[chave];
          return resto;
        });
        setAviso(`${item.codigo} não mudou de coluna: ${r.mensagem}`);
      }
    });
  });

  const itemAberto = aberto ? naTela.find((i) => i.chave === aberto) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-cinza-claro bg-branco p-3">
        <CampoFiltro rotulo="Tipo">
          <select className={classeCampo} value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value as FiltroQuadro["tipo"] })}>
            <option value="">Todos</option>
            {TIPOS_ITEM.map((t) => (
              <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Cliente">
          <select className={classeCampo} value={filtro.cliente} onChange={(e) => setFiltro({ ...filtro, cliente: e.target.value })}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.valor} value={c.valor}>{c.rotulo}</option>
            ))}
          </select>
        </CampoFiltro>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Indicador rotulo="Abertas" valor={ind.abertos} dica="Cartões que passam pelos filtros e não estão em Resolvida." />
        <Indicador
          rotulo="Esperando você"
          valor={ind.esperandoVoce}
          alerta
          dica="Cartões filtrados na coluna Esperando você: resposta, ata, pauta ou ação pronta, esperando o seu ok."
        />
        <Indicador
          rotulo={`Paradas há ${DIAS_PARADO_ALERTA}+ dias`}
          valor={ind.paradas}
          alerta
          dica={`Cartões abertos (fora de Resolvida) que estão na mesma coluna há ${DIAS_PARADO_ALERTA} dias ou mais. Conta = hoje menos o dia em que o cartão entrou na coluna, no horário de Brasília.`}
        />
      </div>

      <div className="hidden flex-col gap-2 md:flex">
        <AvisoMover texto={aviso} aoFechar={() => setAviso(null)} />
        <QuadroColunas ariaLabel="Quadro de operação">
          {grupos.map(({ coluna, itens: lista }) => {
            const { destacada, ...eventos } = propsColuna(coluna);
            return (
              <ColunaKanban key={coluna} titulo={ROTULO_COLUNA[coluna]} total={lista.length} destacada={destacada} {...eventos}>
                {lista.map((i) => (
                  <CartaoItem key={i.chave} item={i} hoje={hoje} aoAbrir={setAberto} arraste={arrasteDe(i.chave)} />
                ))}
              </ColunaKanban>
            );
          })}
        </QuadroColunas>
      </div>

      <div className="flex flex-col gap-4 md:hidden">
        <AvisoMover texto={aviso} aoFechar={() => setAviso(null)} />
        {grupos
          .filter((g) => g.itens.length > 0)
          .map(({ coluna, itens: lista }) => (
            <section key={coluna} className="flex flex-col gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-azul-noite">
                {ROTULO_COLUNA[coluna]} ({lista.length})
              </h2>
              {lista.map((i) => (
                <CartaoItem key={i.chave} item={i} hoje={hoje} aoAbrir={setAberto} />
              ))}
            </section>
          ))}
        {visiveis.length === 0 && <p className="text-sm text-cinza-medio">Nada com esses filtros.</p>}
      </div>

      {itemAberto && <FichaItemOperacao key={itemAberto.chave} item={itemAberto} aoFechar={fechar} />}
    </div>
  );
}

function CartaoItem({ item, hoje, aoAbrir, arraste }: { item: ItemOperacao; hoje: string; aoAbrir: (chave: string) => void; arraste?: ArrasteCartao }) {
  const dias = diasParado(item.desdeEm, hoje);
  const parado = item.coluna !== "resolvida" && (dias ?? 0) >= DIAS_PARADO_ALERTA;
  return (
    <div
      {...propsCartaoArrastavel(item.chave, arraste, "Arraste para outra coluna. Soltar em Resolvida marca como resolvido.")}
      className={`relative flex flex-col gap-1 rounded-lg border border-cinza-claro bg-branco p-3 text-sm hover:border-ambar ${
        arraste ? "cursor-grab active:cursor-grabbing" : ""
      } ${arraste?.ativo ? "opacity-40" : ""}`}
    >
      <span className="flex flex-wrap items-center gap-1">
        <Selo tom={item.tipo === "demanda" ? "neutro" : item.tipo === "alerta" ? "critico" : "atencao"}>{rotuloSelo(item)}</Selo>
        {(item.sigla || item.cliente) && (
          <span className="truncate text-xs font-semibold text-azul-petroleo" title={item.cliente ?? undefined}>
            {[item.sigla, item.cliente].filter(Boolean).join(" - ")}
          </span>
        )}
      </span>
      <button
        type="button"
        draggable={false}
        onClick={() => aoAbrir(item.chave)}
        className="text-left font-semibold text-azul-noite after:absolute after:inset-0 after:content-['']"
        title={item.titulo || item.codigo}
      >
        <span className="line-clamp-2">{item.titulo || item.codigo}</span>
      </button>
      {item.resumo && <span className="line-clamp-3 text-xs text-cinza">{item.resumo}</span>}
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-cinza-medio">
        <span>{item.codigo}</span>
        <span className={parado ? "font-semibold text-vermelho" : undefined}>{textoDiasParado(dias)}</span>
        {item.colunaManual && <span title="Você moveu este cartão; ele fica aqui até ser encerrado.">movido por você</span>}
      </span>
    </div>
  );
}
