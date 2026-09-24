"use client";

import { useState } from "react";
import {
  excluirIndicadorAction,
  excluirLinkAction,
  salvarDiagnosticoAction,
  salvarIndicadorAction,
  salvarLinkAction,
} from "@/app/(app)/escritorio/clientes/actions";
import {
  ROTULO_DIMENSAO,
  ROTULO_SITUACAO_DIAGNOSTICO,
  SITUACOES_DIAGNOSTICO,
  type DimensaoDiagnostico,
  type Indicador,
  type LinkCliente,
  type SituacaoDiagnostico,
} from "@/lib/clientes/tipos";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { Campo, ModalFormulario, Secao, Selo, Vazio, classeBotaoLeve, classeCampo, useAcao } from "./ui";

const TOM_DIAG = { nao_iniciado: "neutro", em_andamento: "atencao", concluido: "bom" } as const;

export function Diagnostico({ acompanhamentoId, dimensoes }: { acompanhamentoId: string; dimensoes: DimensaoDiagnostico[] }) {
  const [aberta, setAberta] = useState<DimensaoDiagnostico | null>(null);
  const [f, setF] = useState({ situacao: "nao_iniciado" as SituacaoDiagnostico, resumo: "" });
  const { pendente, erro, executar } = useAcao();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-cinza">
        Dimensões da Fase 1 (Mapeia). O relatório completo fica no Drive, em Documentos e acessos. Diagnóstico e
        recomendação são de Vinícius.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {dimensoes.map((d) => (
          <Secao
            key={d.id}
            titulo={ROTULO_DIMENSAO[d.dimensao]}
            acao={
              <span className="flex items-center gap-2">
                <Selo tom={TOM_DIAG[d.situacao]}>{ROTULO_SITUACAO_DIAGNOSTICO[d.situacao]}</Selo>
                <button type="button" className={classeBotaoLeve} onClick={() => { setF({ situacao: d.situacao, resumo: d.resumo }); setAberta(d); }}>Editar</button>
              </span>
            }
          >
            {d.resumo ? <p className="whitespace-pre-line text-sm">{d.resumo}</p> : <Vazio>Sem leitura registrada.</Vazio>}
          </Secao>
        ))}
      </div>
      {aberta && (
        <ModalFormulario
          aberto
          titulo={`Diagnóstico: ${ROTULO_DIMENSAO[aberta.dimensao]}`}
          onFechar={() => setAberta(null)}
          onSalvar={() => executar(() => salvarDiagnosticoAction({ acompanhamentoId, dimensao: aberta.dimensao, ...f }), () => setAberta(null))}
          pendente={pendente}
          erro={erro}
        >
          <Campo rotulo="Situação">
            <select className={classeCampo} value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as SituacaoDiagnostico })}>
              {SITUACOES_DIAGNOSTICO.map((s) => <option key={s} value={s}>{ROTULO_SITUACAO_DIAGNOSTICO[s]}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Resumo"><textarea className={classeCampo} rows={6} value={f.resumo} onChange={(e) => setF({ ...f, resumo: e.target.value })} /></Campo>
        </ModalFormulario>
      )}
    </div>
  );
}

export function Indicadores({ acompanhamentoId, indicadores }: { acompanhamentoId: string; indicadores: Indicador[] }) {
  const vazio = { nome: "", valor: "", referencia: "", fonte: "" };
  const [aberto, setAberto] = useState<{ id: string | null } | null>(null);
  const [f, setF] = useState(vazio);
  const { pendente, erro, executar } = useAcao();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-cinza">
        Valor informado com referência e fonte. Dado financeiro só o mínimo necessário para a leitura da reunião.
      </p>
      <button type="button" className={`${classeBotaoLeve} self-start`} onClick={() => { setF(vazio); setAberto({ id: null }); }}>+ Novo indicador</button>
      {indicadores.length === 0 ? <Vazio>Nenhum indicador registrado.</Vazio> : (
        <TabelaRolavel ariaLabel="Indicadores do cliente">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th>Indicador</Th><Th align="right">Valor</Th><Th>Referência</Th><Th>Fonte</Th><Th> </Th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map((i) => (
                <tr key={i.id} className="border-t border-cinza-claro">
                  <td className="max-w-[220px] truncate px-3 py-2" title={i.nome}>{i.nome}</td>
                  <td className="px-3 py-2 text-right font-mono">{i.valor}</td>
                  <td className="px-3 py-2">{i.referencia || "-"}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={i.fonte}>{i.fonte || "-"}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="text-xs font-semibold text-azul-petroleo hover:underline" onClick={() => { setF(i); setAberto({ id: i.id }); }}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
      {aberto && (
        <ModalFormulario
          aberto
          titulo={aberto.id ? "Editar indicador" : "Novo indicador"}
          onFechar={() => setAberto(null)}
          onSalvar={() => executar(() => salvarIndicadorAction({ acompanhamentoId, id: aberto.id, nome: f.nome, valor: f.valor, referencia: f.referencia, fonte: f.fonte }), () => setAberto(null))}
          pendente={pendente}
          erro={erro}
        >
          <Campo rotulo="Indicador"><input className={classeCampo} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: CMV" /></Campo>
          <Campo rotulo="Valor"><input className={classeCampo} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="Ex.: 34%" /></Campo>
          <Campo rotulo="Referência"><input className={classeCampo} value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} placeholder="Ex.: 09/2026" /></Campo>
          <Campo rotulo="Fonte"><input className={classeCampo} value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} placeholder="Ex.: DRE de setembro" /></Campo>
          {aberto.id && (
            <button type="button" className="self-start text-xs font-semibold text-vermelho hover:underline" onClick={() => executar(() => excluirIndicadorAction({ acompanhamentoId, id: aberto.id! }), () => setAberto(null))}>
              Excluir indicador
            </button>
          )}
        </ModalFormulario>
      )}
    </div>
  );
}

export function Documentos({ acompanhamentoId, links }: { acompanhamentoId: string; links: LinkCliente[] }) {
  const vazio = { tipo: "documento" as LinkCliente["tipo"], titulo: "", url: "", observacao: "" };
  const [aberto, setAberto] = useState<{ id: string | null } | null>(null);
  const [f, setF] = useState(vazio);
  const { pendente, erro, executar } = useAcao();

  const grupo = (tipo: LinkCliente["tipo"], titulo: string) => (
    <Secao titulo={titulo}>
      {links.filter((l) => l.tipo === tipo).length === 0 ? <Vazio>Nada registrado.</Vazio> : (
        <ul className="flex flex-col gap-2">
          {links.filter((l) => l.tipo === tipo).map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-2 text-sm">
              <span>
                {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-azul-petroleo hover:underline">{l.titulo}</a> : <b>{l.titulo}</b>}
                {l.observacao && <span className="block text-xs text-cinza-medio">{l.observacao}</span>}
              </span>
              <button type="button" className="text-xs font-semibold text-azul-petroleo hover:underline" onClick={() => { setF(l); setAberto({ id: l.id }); }}>Editar</button>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-cinza">
        Só links (Google Drive) e onde cada acesso está. Nunca senha, token, chave ou dado bancário; o app recusa texto com cara de credencial.
      </p>
      <button type="button" className={`${classeBotaoLeve} self-start`} onClick={() => { setF(vazio); setAberto({ id: null }); }}>+ Novo link</button>
      <div className="grid gap-3 lg:grid-cols-2">
        {grupo("documento", "Documentos")}
        {grupo("acesso", "Acessos")}
      </div>
      {aberto && (
        <ModalFormulario
          aberto
          titulo={aberto.id ? "Editar link" : "Novo link"}
          onFechar={() => setAberto(null)}
          onSalvar={() => executar(() => salvarLinkAction({ acompanhamentoId, id: aberto.id, tipo: f.tipo, titulo: f.titulo, url: f.url.trim(), observacao: f.observacao }), () => setAberto(null))}
          pendente={pendente}
          erro={erro}
        >
          <Campo rotulo="Tipo">
            <select className={classeCampo} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as LinkCliente["tipo"] })}>
              <option value="documento">Documento</option>
              <option value="acesso">Acesso</option>
            </select>
          </Campo>
          <Campo rotulo="Título"><input className={classeCampo} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
          <Campo rotulo="Link (https)" dica="Opcional para acesso: descreva onde está, sem a credencial.">
            <input className={classeCampo} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://drive.google.com/..." />
          </Campo>
          <Campo rotulo="Observação"><input className={classeCampo} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Campo>
          {aberto.id && (
            <button type="button" className="self-start text-xs font-semibold text-vermelho hover:underline" onClick={() => executar(() => excluirLinkAction({ acompanhamentoId, id: aberto.id! }), () => setAberto(null))}>
              Excluir link
            </button>
          )}
        </ModalFormulario>
      )}
    </div>
  );
}
