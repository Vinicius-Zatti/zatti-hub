"use client";

import { useState } from "react";
import { abrirReuniaoAction, fecharReuniaoAction } from "@/app/(app)/escritorio/clientes/actions";
import type { PreparacaoReuniao } from "@/lib/clientes/jornada";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { ROTULO_ETAPA, ROTULO_TIPO_ITEM, type EtapaJornada, type Indicador, type ItemCliente, type Reuniao, type TipoItem } from "@/lib/clientes/tipos";
import { EditarItem, LinhaItem } from "./itens";
import { Campo, ModalFormulario, Secao, Vazio, classeBotao, classeBotaoLeve, classeCampo, useAcao } from "./ui";

const TIPOS_REUNIAO: readonly TipoItem[] = ["fato", "decisao", "tarefa", "pergunta"];

function TextoWhatsapp({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <textarea readOnly className={`${classeCampo} font-mono text-xs`} rows={12} value={texto} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={classeBotaoLeve}
          onClick={() => navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => setCopiado(false))}
        >
          {copiado ? "Copiado" : "Copiar texto"}
        </button>
        <span className="text-xs text-cinza-medio">Nada é enviado pelo app. Diagnóstico, preço ou recomendação só com aprovação de Vinícius.</span>
      </div>
    </div>
  );
}

function Preparacao({ prep, indicadores, hoje }: { prep: PreparacaoReuniao; indicadores: Indicador[]; hoje: string }) {
  const lista = (itens: ItemCliente[]) =>
    itens.length ? <ul>{itens.map((i) => <LinhaItem key={i.id} item={i} hoje={hoje} onEditar={() => {}} />)}</ul> : <Vazio>Nada.</Vazio>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Secao titulo="Última reunião">
        {prep.ultimaReuniao ? (
          <p className="text-sm"><b>{formatarDataBr(prep.ultimaReuniao.data)} - {prep.ultimaReuniao.titulo}.</b> {prep.ultimaReuniao.resumo || "Sem resumo."}</p>
        ) : <Vazio>Nenhuma reunião fechada.</Vazio>}
        <p className="text-sm text-cinza">Fase atual: {prep.faseAtual}</p>
      </Secao>
      <Secao titulo="Pauta sugerida">
        <ol className="list-decimal pl-5 text-sm">{prep.pautaSugerida.map((p) => <li key={p}>{p}</li>)}</ol>
      </Secao>
      <Secao titulo="Tarefas vencidas">{lista(prep.tarefasVencidas)}</Secao>
      <Secao titulo="Tarefas pendentes">{lista(prep.tarefasPendentes)}</Secao>
      <Secao titulo="O cliente ainda não enviou">
        {prep.faltaDoCliente.length ? (
          <ul className="text-sm">{prep.faltaDoCliente.map((o) => <li key={o.id}>{o.item}{o.resposta && <span className="text-cinza-medio"> - {o.resposta}</span>}</li>)}</ul>
        ) : <Vazio>Nada pendente no onboarding.</Vazio>}
      </Secao>
      <Secao titulo="Perguntas recomendadas">
        {prep.perguntasRecomendadas.length ? <ul className="list-disc pl-5 text-sm">{prep.perguntasRecomendadas.map((p) => <li key={p}>{p}</li>)}</ul> : <Vazio>Nenhuma pergunta aberta.</Vazio>}
      </Secao>
      <Secao titulo="Decisões anteriores">{lista(prep.decisoes)}</Secao>
      <Secao titulo="Indicadores disponíveis">
        {indicadores.length ? (
          <ul className="text-sm">{indicadores.map((i) => <li key={i.id}>{i.nome}: <b>{i.valor}</b>{i.referencia && ` (${i.referencia})`}</li>)}</ul>
        ) : <Vazio>Nenhum indicador registrado.</Vazio>}
      </Secao>
    </div>
  );
}

export function Reunioes({ acompanhamentoId, reunioes, itens, prep, etapaAtual, indicadores, hoje }: {
  acompanhamentoId: string;
  reunioes: Reuniao[];
  itens: ItemCliente[];
  prep: PreparacaoReuniao;
  etapaAtual: EtapaJornada | null;
  indicadores: Indicador[];
  hoje: string;
}) {
  const aberta = reunioes.find((r) => r.situacao === "aberta") ?? null;
  const fechadas = reunioes.filter((r) => r.situacao === "fechada").sort((a, b) => b.data.localeCompare(a.data));
  const [preparando, setPreparando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [registro, setRegistro] = useState<{ item: ItemCliente | null; tipo: TipoItem } | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const { pendente, erro, setErro, executar } = useAcao();
  const [nova, setNova] = useState({ data: hoje, titulo: "" });
  const [fecho, setFecho] = useState({ resumo: "", pautaProxima: "", checklistFeitos: [] as number[] });

  const itensDaAberta = aberta ? itens.filter((i) => i.reuniaoId === aberta.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={classeBotaoLeve} onClick={() => setPreparando((v) => !v)}>
          {preparando ? "Esconder preparação" : "Preparar reunião"}
        </button>
        {!aberta && (
          <button type="button" className={classeBotao} onClick={() => { setErro(null); setAbrindo(true); }}>Abrir reunião</button>
        )}
      </div>

      {preparando && <Preparacao prep={prep} indicadores={indicadores} hoje={hoje} />}

      {aberta && (
        <Secao
          titulo={`Reunião em andamento: ${formatarDataBr(aberta.data)} - ${aberta.titulo}`}
          acao={
            <button
              type="button"
              className={classeBotao}
              onClick={() => {
                setErro(null);
                setFecho({ resumo: "", pautaProxima: prep.pautaSugerida.map((p, i) => `${i + 1}. ${p}`).join("\n"), checklistFeitos: [] });
                setFechando(true);
              }}
            >
              Fechar reunião
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {TIPOS_REUNIAO.map((t) => (
              <button key={t} type="button" className={classeBotaoLeve} onClick={() => setRegistro({ item: null, tipo: t })}>
                + {ROTULO_TIPO_ITEM[t]}
              </button>
            ))}
          </div>
          {itensDaAberta.length === 0 ? <Vazio>Nada registrado ainda nesta reunião.</Vazio> : (
            <ul>
              {itensDaAberta.map((i) => (
                <LinhaItem key={i.id} item={{ ...i, texto: `${ROTULO_TIPO_ITEM[i.tipo]}: ${i.texto}` }} hoje={hoje} onEditar={() => setRegistro({ item: i, tipo: i.tipo })} />
              ))}
            </ul>
          )}
        </Secao>
      )}

      {whatsapp && (
        <Secao titulo="Resumo pronto para o WhatsApp">
          <TextoWhatsapp texto={whatsapp} />
        </Secao>
      )}

      <Secao titulo="Reuniões anteriores">
        {fechadas.length === 0 ? <Vazio>Nenhuma reunião fechada.</Vazio> : (
          <ul className="flex flex-col gap-3">
            {fechadas.map((r) => (
              <li key={r.id} className="border-t border-cinza-claro pt-2 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold text-azul-noite">{formatarDataBr(r.data)} - {r.titulo}</p>
                {r.resumo && <p className="text-sm text-cinza">{r.resumo}</p>}
                {r.pautaProxima && <p className="whitespace-pre-line text-xs text-cinza-medio"><b>Pauta da próxima:</b> {r.pautaProxima}</p>}
                {r.resumoWhatsapp && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-xs font-semibold text-azul-petroleo">Texto para o WhatsApp</summary>
                    <TextoWhatsapp texto={r.resumoWhatsapp} />
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <ModalFormulario
        aberto={abrindo}
        titulo="Abrir reunião"
        onFechar={() => setAbrindo(false)}
        onSalvar={() => executar(() => abrirReuniaoAction({ acompanhamentoId, ...nova }), () => setAbrindo(false))}
        pendente={pendente}
        erro={erro}
        rotuloSalvar="Abrir"
      >
        <Campo rotulo="Data"><input type="date" className={classeCampo} value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} /></Campo>
        <Campo rotulo="Título"><input className={classeCampo} value={nova.titulo} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder="Ex.: Onboarding financeiro" /></Campo>
      </ModalFormulario>

      {aberta && (
        <ModalFormulario
          aberto={fechando}
          titulo="Fechar reunião"
          onFechar={() => setFechando(false)}
          onSalvar={() =>
            executar(() => fecharReuniaoAction({ acompanhamentoId, reuniaoId: aberta.id, ...fecho }), (r) => {
              setFechando(false);
              setWhatsapp(r.texto ?? null);
            })
          }
          pendente={pendente}
          erro={erro}
          rotuloSalvar="Fechar e preparar resumo"
        >
          <p className="text-xs text-cinza-medio">
            Tarefas, decisões e perguntas registradas na reunião já estão gravadas. Perguntas continuam abertas até serem respondidas.
          </p>
          <Campo rotulo="Resumo da reunião"><textarea className={classeCampo} rows={4} value={fecho.resumo} onChange={(e) => setFecho({ ...fecho, resumo: e.target.value })} /></Campo>
          <Campo rotulo="Pauta da próxima reunião" dica="Sugestão montada a partir das pendências. Ajuste à vontade.">
            <textarea className={classeCampo} rows={5} value={fecho.pautaProxima} onChange={(e) => setFecho({ ...fecho, pautaProxima: e.target.value })} />
          </Campo>
          {etapaAtual && etapaAtual.checklist.some((c) => !c.feito) && (
            <fieldset className="flex flex-col gap-1">
              <legend className="text-xs font-bold uppercase tracking-wide text-cinza-medio">Concluído nesta reunião ({ROTULO_ETAPA[etapaAtual.etapa]})</legend>
              {etapaAtual.checklist.map((c, i) => !c.feito && (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fecho.checklistFeitos.includes(i)}
                    onChange={(e) => setFecho({ ...fecho, checklistFeitos: e.target.checked ? [...fecho.checklistFeitos, i] : fecho.checklistFeitos.filter((x) => x !== i) })}
                  />
                  {c.texto}
                </label>
              ))}
            </fieldset>
          )}
        </ModalFormulario>
      )}

      {registro && aberta && (
        <EditarItem
          acompanhamentoId={acompanhamentoId}
          item={registro.item}
          tipoInicial={registro.tipo}
          reuniaoId={aberta.id}
          tiposPermitidos={TIPOS_REUNIAO}
          onFechar={() => setRegistro(null)}
        />
      )}
    </div>
  );
}
