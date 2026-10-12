"use client";

import { useState } from "react";
import { Campo, ModalFormulario, classeCampo } from "@/components/clientes/ui";
import {
  ETAPAS_FUNIL,
  FORMATOS_PECA,
  LIMITES_PECA,
  STATUS_PECA,
  type CamposPeca,
  type Peca,
} from "@/lib/conteudo/pecas";

type Formulario = {
  titulo: string;
  data: string;
  hora: string;
  status: string;
  formato: string;
  etapa_funil: string;
  roteiro: string;
  legenda: string;
  link_referencia: string;
  link_arquivos: string;
  observacao: string;
};

function inicial(peca: Peca | null, dataPadrao: string | null): Formulario {
  return {
    titulo: peca?.titulo ?? "",
    data: peca?.data ?? dataPadrao ?? "",
    hora: peca?.hora ?? "",
    status: peca?.status ?? "Ideia",
    formato: peca?.formato ?? "",
    etapa_funil: peca?.etapa_funil ?? "",
    roteiro: peca?.roteiro ?? "",
    legenda: peca?.legenda ?? "",
    link_referencia: peca?.link_referencia ?? "",
    link_arquivos: peca?.link_arquivos ?? "",
    observacao: peca?.observacao ?? "",
  };
}

const ORIGEM: Record<Peca["origem_ultima_mudanca"], string> = { hub: "Hub", vini: "Vini", import: "migração do Notion" };

function quando(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}`;
}

function LinkAbrir({ href }: { href: string }) {
  if (!/^https?:\/\//i.test(href)) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-azul-petroleo hover:underline">
      Abrir link
    </a>
  );
}

/** Criar e editar peça (sempre em `ModalFlutuante`, via `ModalFormulario`). A versão usada ao
 * salvar vem da peça atual (prop), então depois de um aviso de conflito a tela recarrega e o
 * segundo "Salvar" grava sobre a versão nova, de propósito. */
export function ModalPeca({
  peca,
  dataPadrao,
  pendente,
  erro,
  onFechar,
  onSalvar,
}: {
  peca: Peca | null;
  dataPadrao: string | null;
  pendente: boolean;
  erro: string | null;
  onFechar: () => void;
  onSalvar: (campos: CamposPeca) => void;
}) {
  const [f, setF] = useState<Formulario>(() => inicial(peca, dataPadrao));
  const muda = (k: keyof Formulario, v: string) => setF((atual) => ({ ...atual, [k]: v }));

  function salvar() {
    onSalvar({
      titulo: f.titulo,
      data: f.data || null,
      hora: f.data && f.hora ? f.hora : null,
      status: f.status,
      formato: f.formato,
      etapa_funil: f.etapa_funil,
      roteiro: f.roteiro,
      legenda: f.legenda,
      link_referencia: f.link_referencia,
      link_arquivos: f.link_arquivos,
      observacao: f.observacao,
    });
  }

  return (
    <ModalFormulario
      aberto
      titulo={peca ? "Editar peça" : "Nova peça"}
      onFechar={onFechar}
      onSalvar={salvar}
      pendente={pendente}
      erro={erro}
      rotuloSalvar={peca ? "Salvar" : "Criar"}
    >
      <Campo rotulo="Título">
        <input className={classeCampo} required maxLength={LIMITES_PECA.titulo} value={f.titulo}
          onChange={(e) => muda("titulo", e.target.value)} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Data">
          <input type="date" className={classeCampo} value={f.data} onChange={(e) => muda("data", e.target.value)} />
        </Campo>
        <Campo rotulo="Hora (opcional)">
          <input type="time" className={classeCampo} value={f.hora} disabled={!f.data}
            onChange={(e) => muda("hora", e.target.value)} />
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Status">
          <select className={classeCampo} value={f.status} onChange={(e) => muda("status", e.target.value)}>
            {STATUS_PECA.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Formato">
          <select className={classeCampo} value={f.formato} onChange={(e) => muda("formato", e.target.value)}>
            <option value="">Sem formato</option>
            {FORMATOS_PECA.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Etapa de funil">
          <select className={classeCampo} value={f.etapa_funil} onChange={(e) => muda("etapa_funil", e.target.value)}>
            <option value="">Sem etapa</option>
            {ETAPAS_FUNIL.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo rotulo="Roteiro">
        <textarea className={`${classeCampo} min-h-40`} maxLength={LIMITES_PECA.roteiro} value={f.roteiro}
          onChange={(e) => muda("roteiro", e.target.value)} />
      </Campo>
      <Campo rotulo="Legenda">
        <textarea className={`${classeCampo} min-h-28`} maxLength={LIMITES_PECA.legenda} value={f.legenda}
          onChange={(e) => muda("legenda", e.target.value)} />
      </Campo>
      <Campo rotulo="Link de referência">
        <input className={classeCampo} inputMode="url" maxLength={LIMITES_PECA.link_referencia} value={f.link_referencia}
          onChange={(e) => muda("link_referencia", e.target.value)} />
        <LinkAbrir href={f.link_referencia.trim()} />
      </Campo>
      <Campo rotulo="Link dos arquivos (Drive)">
        <input className={classeCampo} inputMode="url" maxLength={LIMITES_PECA.link_arquivos} value={f.link_arquivos}
          onChange={(e) => muda("link_arquivos", e.target.value)} />
        <LinkAbrir href={f.link_arquivos.trim()} />
      </Campo>
      <Campo rotulo="Observação">
        <textarea className={`${classeCampo} min-h-20`} maxLength={LIMITES_PECA.observacao} value={f.observacao}
          onChange={(e) => muda("observacao", e.target.value)} />
      </Campo>
      {peca && (
        <p className="text-xs text-cinza-medio">
          Versão {peca.versao}. Última mudança por {peca.atualizado_por || "-"} ({ORIGEM[peca.origem_ultima_mudanca]})
          {quando(peca.atualizado_em) ? ` em ${quando(peca.atualizado_em)}` : ""}.
        </p>
      )}
    </ModalFormulario>
  );
}
