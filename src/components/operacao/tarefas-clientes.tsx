"use client";

import { useMemo, useState, useTransition } from "react";
import { estadoTarefaOperacaoAction } from "@/app/(app)/escritorio/operacao/actions";
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
import { agruparTarefasPorEstado, diaBr, filtrarTarefas, indicadoresTarefas, opcoesCliente, tarefaVencida, type FiltroTarefas } from "@/lib/operacao/quadro";
import { ESTADOS_TAREFA, ROTULO_ESTADO_TAREFA, ROTULO_LADO, type EstadoTarefa, type TarefaCliente } from "@/lib/operacao/tipos";

/** Aba "Tarefas dos clientes": tarefas das atas aprovadas, A fazer -> Fazendo
 * -> Feito. O estado fica no Vini. Desktop arrasta; celular troca o estado
 * pelo seletor do cartão. Prazo vencido em vermelho (só prazo com data). */
export function TarefasClientes({ tarefas, hoje }: { tarefas: TarefaCliente[]; hoje: string }) {
  const [filtro, setFiltro] = useState<FiltroTarefas>({ cliente: "", lado: "" });
  const [movidos, setMovidos] = useState<Record<string, EstadoTarefa>>({});
  const [base, setBase] = useState(tarefas);
  if (base !== tarefas) {
    setBase(tarefas);
    setMovidos({});
  }
  const [aviso, setAviso] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const naTela = useMemo(() => tarefas.map((t) => (movidos[t.id] && movidos[t.id] !== t.estado ? { ...t, estado: movidos[t.id] } : t)), [tarefas, movidos]);
  const visiveis = useMemo(() => filtrarTarefas(naTela, filtro), [naTela, filtro]);
  const grupos = agruparTarefasPorEstado(visiveis);
  const ind = indicadoresTarefas(visiveis, hoje);
  const clientes = useMemo(() => opcoesCliente(tarefas), [tarefas]);

  function mudarEstado(id: string, estado: EstadoTarefa) {
    const t = naTela.find((x) => x.id === id);
    if (!t || t.estado === estado) return;
    setAviso(null);
    setMovidos((m) => ({ ...m, [id]: estado }));
    iniciar(async () => {
      const r = await estadoTarefaOperacaoAction({ id, estado });
      if (!r.ok) {
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[id];
          return resto;
        });
        setAviso(`A tarefa "${t.tarefa.slice(0, 60)}" não mudou: ${r.mensagem}`);
      }
    });
  }

  const { propsColuna, arrasteDe } = useArrasteColunas<EstadoTarefa>(mudarEstado);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-cinza-claro bg-branco p-3">
        <CampoFiltro rotulo="Cliente">
          <select className={classeCampo} value={filtro.cliente} onChange={(e) => setFiltro({ ...filtro, cliente: e.target.value })}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.valor} value={c.valor}>{c.rotulo}</option>
            ))}
          </select>
        </CampoFiltro>
        <CampoFiltro rotulo="Lado">
          <select className={classeCampo} value={filtro.lado} onChange={(e) => setFiltro({ ...filtro, lado: e.target.value as FiltroTarefas["lado"] })}>
            <option value="">Cliente e Zatti</option>
            <option value="cliente">Cliente</option>
            <option value="zatti">Zatti</option>
            <option value="indefinido">Sem lado definido</option>
          </select>
        </CampoFiltro>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Indicador rotulo="Em aberto" valor={ind.abertas} dica="Tarefas filtradas em A fazer ou Fazendo." />
        <Indicador
          rotulo="Vencidas"
          valor={ind.vencidas}
          alerta
          dica="Tarefas filtradas que não estão em Feito e cujo prazo é uma data (ex.: 20/10 ou 20/10/2026) anterior a hoje. Prazo em texto livre, como 'semana que vem', não conta."
        />
      </div>

      <div className="hidden flex-col gap-2 md:flex">
        <AvisoMover texto={aviso} aoFechar={() => setAviso(null)} />
        <QuadroColunas ariaLabel="Tarefas dos clientes">
          {grupos.map(({ estado, tarefas: lista }) => {
            const { destacada, ...eventos } = propsColuna(estado);
            return (
              <ColunaKanban key={estado} titulo={ROTULO_ESTADO_TAREFA[estado]} total={lista.length} destacada={destacada} {...eventos}>
                {lista.map((t) => (
                  <CartaoTarefa key={t.id} tarefa={t} hoje={hoje} arraste={arrasteDe(t.id)} />
                ))}
              </ColunaKanban>
            );
          })}
        </QuadroColunas>
      </div>

      <div className="flex flex-col gap-4 md:hidden">
        <AvisoMover texto={aviso} aoFechar={() => setAviso(null)} />
        {grupos
          .filter((g) => g.tarefas.length > 0)
          .map(({ estado, tarefas: lista }) => (
            <section key={estado} className="flex flex-col gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-azul-noite">
                {ROTULO_ESTADO_TAREFA[estado]} ({lista.length})
              </h2>
              {lista.map((t) => (
                <CartaoTarefa key={t.id} tarefa={t} hoje={hoje} aoMudar={(e) => mudarEstado(t.id, e)} />
              ))}
            </section>
          ))}
        {visiveis.length === 0 && <p className="text-sm text-cinza-medio">Nenhuma tarefa com esses filtros.</p>}
      </div>
    </div>
  );
}

function CartaoTarefa({
  tarefa,
  hoje,
  arraste,
  aoMudar,
}: {
  tarefa: TarefaCliente;
  hoje: string;
  arraste?: ArrasteCartao;
  aoMudar?: (estado: EstadoTarefa) => void;
}) {
  const vencida = tarefaVencida(tarefa, hoje);
  return (
    <div
      {...propsCartaoArrastavel(tarefa.id, arraste, "Arraste para outra coluna para mudar o estado")}
      className={`flex flex-col gap-1 rounded-lg border bg-branco p-3 text-sm ${vencida ? "border-vermelho" : "border-cinza-claro"} ${
        arraste ? "cursor-grab hover:border-ambar active:cursor-grabbing" : ""
      } ${arraste?.ativo ? "opacity-40" : ""}`}
    >
      <span className="flex flex-wrap items-center gap-1">
        <Selo tom={tarefa.lado === "cliente" ? "atencao" : "neutro"}>{ROTULO_LADO[tarefa.lado]}</Selo>
        {(tarefa.sigla || tarefa.cliente) && (
          <span className="truncate text-xs font-semibold text-azul-petroleo" title={tarefa.cliente ?? undefined}>
            {[tarefa.sigla, tarefa.cliente].filter(Boolean).join(" - ")}
          </span>
        )}
      </span>
      <span className="font-semibold text-azul-noite">{tarefa.tarefa}</span>
      {tarefa.responsavel && <span className="text-xs text-cinza">Responsável: {tarefa.responsavel}</span>}
      {tarefa.prazo && (
        <span className={`text-xs ${vencida ? "font-semibold text-vermelho" : "text-cinza"}`}>
          Prazo: {tarefa.prazo}
          {vencida ? " (vencido)" : ""}
        </span>
      )}
      <span className="text-xs text-cinza-medio">
        {tarefa.ataCodigo}
        {tarefa.reuniaoEm ? `, reunião de ${diaBr(tarefa.reuniaoEm)}` : ""}
      </span>
      {aoMudar && (
        <select
          aria-label="Mudar o estado da tarefa"
          className={`${classeCampo} mt-1`}
          value={tarefa.estado}
          onChange={(e) => aoMudar(e.target.value as EstadoTarefa)}
        >
          {ESTADOS_TAREFA.map((e) => (
            <option key={e} value={e}>{ROTULO_ESTADO_TAREFA[e]}</option>
          ))}
        </select>
      )}
    </div>
  );
}
