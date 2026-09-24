"use client";

import { useState } from "react";
import { salvarItemAction } from "@/app/(app)/escritorio/clientes/actions";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import {
  RESPONSAVEIS,
  ROTULO_RESPONSAVEL,
  ROTULO_TIPO_ITEM,
  TIPOS_ITEM,
  type ItemCliente,
  type Responsavel,
  type SituacaoItem,
  type TipoItem,
} from "@/lib/clientes/tipos";
import { Campo, ModalFormulario, Secao, Selo, Vazio, classeBotaoLeve, classeCampo, useAcao } from "./ui";

export function EditarItem({ acompanhamentoId, item, tipoInicial, reuniaoId, tiposPermitidos = TIPOS_ITEM, onFechar }: {
  acompanhamentoId: string;
  item: ItemCliente | null;
  tipoInicial: TipoItem;
  reuniaoId: string | null;
  tiposPermitidos?: readonly TipoItem[];
  onFechar: () => void;
}) {
  const { pendente, erro, executar } = useAcao();
  const [f, setF] = useState({
    tipo: item?.tipo ?? tipoInicial,
    texto: item?.texto ?? "",
    responsavel: (item?.responsavel ?? "") as Responsavel | "",
    prazo: item?.prazo ?? "",
    situacao: item?.situacao ?? ("aberta" as SituacaoItem),
  });
  const salvar = () =>
    executar(
      () =>
        salvarItemAction({
          acompanhamentoId,
          id: item?.id ?? null,
          reuniaoId: item ? item.reuniaoId : reuniaoId,
          tipo: f.tipo,
          texto: f.texto,
          responsavel: f.responsavel || null,
          prazo: f.prazo || null,
          situacao: f.situacao,
        }),
      onFechar,
    );

  return (
    <ModalFormulario aberto titulo={item ? "Editar registro" : "Novo registro"} onFechar={onFechar} onSalvar={salvar} pendente={pendente} erro={erro}>
      <Campo rotulo="Tipo">
        <select className={classeCampo} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoItem })}>
          {tiposPermitidos.map((t) => <option key={t} value={t}>{ROTULO_TIPO_ITEM[t]}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Texto"><textarea className={classeCampo} rows={3} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo={f.tipo === "tarefa" ? "Responsável (obrigatório)" : "Responsável"}>
          <select className={classeCampo} value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value as Responsavel | "" })}>
            <option value="">-</option>
            {RESPONSAVEIS.map((r) => <option key={r} value={r}>{ROTULO_RESPONSAVEL[r]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Prazo"><input type="date" className={classeCampo} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></Campo>
      </div>
      {item && (
        <Campo rotulo="Situação">
          <select className={classeCampo} value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as SituacaoItem })}>
            <option value="aberta">Aberta</option>
            <option value="concluida">Concluída</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </Campo>
      )}
    </ModalFormulario>
  );
}

export function LinhaItem({ item, hoje, onEditar, onConcluir }: {
  item: ItemCliente; hoje: string; onEditar: () => void; onConcluir?: () => void;
}) {
  const vencida = item.situacao === "aberta" && item.prazo !== null && item.prazo < hoje;
  return (
    <li className="flex items-start justify-between gap-2 border-t border-cinza-claro py-1.5 first:border-t-0">
      <button type="button" onClick={onEditar} className={`text-left text-sm ${item.situacao !== "aberta" ? "text-cinza-medio line-through" : ""}`}>
        {item.texto}
        <span className="block text-xs text-cinza-medio">
          {[item.responsavel && ROTULO_RESPONSAVEL[item.responsavel], item.prazo && `até ${formatarDataBr(item.prazo)}`].filter(Boolean).join(" · ")}
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-2">
        {vencida && <Selo tom="critico">Vencida</Selo>}
        {onConcluir && item.situacao === "aberta" && (
          <button type="button" onClick={onConcluir} className="text-xs font-semibold text-azul-petroleo hover:underline">Concluir</button>
        )}
      </span>
    </li>
  );
}

const GRUPOS: { titulo: string; filtro: (i: ItemCliente) => boolean; tipo: TipoItem }[] = [
  { titulo: "Tarefas de Vinícius", filtro: (i) => i.tipo === "tarefa" && i.responsavel === "vinicius", tipo: "tarefa" },
  { titulo: "Tarefas do cliente", filtro: (i) => i.tipo === "tarefa" && i.responsavel === "cliente", tipo: "tarefa" },
  { titulo: "Tarefas do Vini e do Eliandro", filtro: (i) => i.tipo === "tarefa" && (i.responsavel === "vini" || i.responsavel === "eliandro"), tipo: "tarefa" },
  { titulo: "Decisões", filtro: (i) => i.tipo === "decisao", tipo: "decisao" },
  { titulo: "Perguntas pendentes", filtro: (i) => i.tipo === "pergunta", tipo: "pergunta" },
  { titulo: "Riscos", filtro: (i) => i.tipo === "risco", tipo: "risco" },
  { titulo: "Fatos", filtro: (i) => i.tipo === "fato", tipo: "fato" },
];

export function TarefasDecisoes({ acompanhamentoId, itens, hoje }: { acompanhamentoId: string; itens: ItemCliente[]; hoje: string }) {
  const [aberto, setAberto] = useState<{ item: ItemCliente | null; tipo: TipoItem } | null>(null);
  const [mostrarFechados, setMostrarFechados] = useState(false);
  const { erro, executar } = useAcao();

  const concluir = (i: ItemCliente) =>
    executar(() => salvarItemAction({
      acompanhamentoId, id: i.id, reuniaoId: i.reuniaoId, tipo: i.tipo, texto: i.texto,
      responsavel: i.responsavel, prazo: i.prazo, situacao: "concluida",
    }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={classeBotaoLeve} onClick={() => setAberto({ item: null, tipo: "tarefa" })}>+ Novo registro</button>
        <label className="flex items-center gap-2 text-sm text-cinza-medio">
          <input type="checkbox" checked={mostrarFechados} onChange={(e) => setMostrarFechados(e.target.checked)} />
          Mostrar concluídos e cancelados
        </label>
      </div>
      {erro && <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erro}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {GRUPOS.map((g) => {
          const lista = itens.filter((i) => g.filtro(i) && (mostrarFechados || i.situacao === "aberta"));
          return (
            <Secao key={g.titulo} titulo={g.titulo}>
              {lista.length === 0 ? <Vazio>Nada aqui.</Vazio> : (
                <ul>
                  {lista.map((i) => (
                    <LinhaItem key={i.id} item={i} hoje={hoje} onEditar={() => setAberto({ item: i, tipo: i.tipo })} onConcluir={i.tipo === "tarefa" || i.tipo === "pergunta" || i.tipo === "risco" ? () => concluir(i) : undefined} />
                  ))}
                </ul>
              )}
            </Secao>
          );
        })}
      </div>
      {aberto && (
        <EditarItem acompanhamentoId={acompanhamentoId} item={aberto.item} tipoInicial={aberto.tipo} reuniaoId={null} onFechar={() => setAberto(null)} />
      )}
    </div>
  );
}
