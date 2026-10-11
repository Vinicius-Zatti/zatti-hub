"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  arquivarModeloAction,
  encerrarPublicacaoAction,
  moverItemAction,
  publicarAction,
  removerItemAction,
  salvarItemAction,
} from "@/app/(app)/garante/actions";
import type { ItemModelo, Pessoa, PublicacaoModelo } from "@/app/(app)/garante/dados";
import { DIAS_SEMANA, textoDias, textoMeta } from "@/lib/garante/regras";

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";
const TIPOS = [
  { v: "check", t: "Feito / não feito" },
  { v: "numero", t: "Número (com faixa)" },
  { v: "estrelas", t: "Estrelas (1 a 5)" },
  { v: "texto", t: "Texto" },
];

export function EditorModelo({
  modelo,
  itens,
  publicacoes,
  setores,
  pessoas,
}: {
  modelo: { id: string; nome: string; descricao: string | null };
  itens: ItemModelo[];
  publicacoes: PublicacaoModelo[];
  setores: { id: string; nome: string }[];
  pessoas: Pessoa[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function rodar(acao: () => Promise<{ ok: true } | { erro: string }>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      depois?.();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">{modelo.nome}</h1>
          {modelo.descricao && <p className="text-sm text-cinza-medio">{modelo.descricao}</p>}
        </div>
        <button
          type="button"
          disabled={pendente}
          onClick={() => {
            if (window.confirm("Arquivar este checklist? Ele sai da agenda agora; o histórico fica.")) {
              rodar(() => arquivarModeloAction(modelo.id), () => router.push("/garante/modelos"));
            }
          }}
          className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho"
        >
          Arquivar
        </button>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}

      <section className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <h2 className="font-display text-lg font-bold text-azul-noite">Quem faz e até que horas</h2>
        {publicacoes.length === 0 && <p className="text-sm text-cinza-medio">Ainda não publicado: ninguém vê este checklist.</p>}
        {publicacoes.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-cinza-claro pb-2 text-sm">
            <span>
              <strong>{textoDias(p.dias)}</strong> até <strong>{p.horario}</strong>
              {p.setorNome && ` · ${p.setorNome}`} · {p.responsavelNome ?? "qualquer pessoa da unidade"}
              {p.vigenteAte && <span className="text-cinza-medio"> · termina {p.vigenteAte.split("-").reverse().join("/")}</span>}
            </span>
            {!p.vigenteAte && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => encerrarPublicacaoAction(p.id))}
                className="text-xs font-semibold text-vermelho underline"
              >
                Encerrar depois de hoje
              </button>
            )}
          </div>
        ))}
        <form
          action={(fd) => rodar(() => publicarAction(modelo.id, fd))}
          className="grid gap-3 md:grid-cols-2"
        >
          <fieldset className="md:col-span-2">
            <legend className={ROTULO}>Dias</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {DIAS_SEMANA.map((d, i) => (
                <label key={d} className="flex items-center gap-1 rounded-md border border-cinza-claro px-2 py-1 text-sm">
                  <input type="checkbox" name="dias" value={i} defaultChecked={i >= 1 && i <= 6} /> {d}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={ROTULO}>
            Horário limite
            <input type="time" name="horario" required defaultValue="10:00" className={CAMPO} />
          </label>
          <label className={ROTULO}>
            Responsável
            <select name="responsavelId" className={CAMPO} defaultValue="">
              <option value="">Qualquer pessoa da unidade</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          {setores.length > 0 && (
            <label className={ROTULO}>
              Setor (opcional)
              <select name="setorId" className={CAMPO} defaultValue="">
                <option value="">Sem setor</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="submit"
            disabled={pendente || itens.length === 0}
            className="self-end rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60 md:col-span-2 md:justify-self-start"
          >
            Publicar
          </button>
          <p className="text-xs text-cinza-medio md:col-span-2">
            Para mudar dias, horário ou responsável: encerre a publicação e publique de novo (o histórico de atrasos fica como era).
          </p>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-azul-noite">Itens ({itens.length})</h2>
          <button
            type="button"
            onClick={() => setEditando("novo")}
            className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo"
          >
            Adicionar item
          </button>
        </div>
        {editando === "novo" && (
          <FormItem
            aoSalvar={(fd) => rodar(() => salvarItemAction(modelo.id, null, fd), () => setEditando(null))}
            aoCancelar={() => setEditando(null)}
            pendente={pendente}
          />
        )}
        {itens.map((item, i) =>
          editando === item.id ? (
            <FormItem
              key={item.id}
              item={item}
              aoSalvar={(fd) => rodar(() => salvarItemAction(modelo.id, item.id, fd), () => setEditando(null))}
              aoCancelar={() => setEditando(null)}
              pendente={pendente}
            />
          ) : (
            <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border border-cinza-claro bg-branco p-3">
              <div className="min-w-0 text-sm">
                {item.grupo && <p className="text-[11px] font-bold uppercase text-cinza-medio">{item.grupo}</p>}
                <p className="text-azul-noite">
                  {item.titulo}
                  {item.critico && <span className="ml-1 rounded bg-vermelho/10 px-1 text-[10px] font-bold uppercase text-vermelho">crítico</span>}
                  {item.fotoObrigatoria && <span className="ml-1 rounded bg-ambar/15 px-1 text-[10px] font-bold uppercase text-ambar">foto</span>}
                </p>
                <p className="text-xs text-cinza-medio">
                  {TIPOS.find((t) => t.v === item.tipo)?.t}
                  {textoMeta(item.tipo, item.metaMin, item.metaMax) && ` · ${textoMeta(item.tipo, item.metaMin, item.metaMax)}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-1 text-xs">
                <button type="button" disabled={pendente || i === 0} onClick={() => rodar(() => moverItemAction(modelo.id, item.id, "subir"))} className="rounded border border-cinza-claro px-2 py-1 disabled:opacity-30" aria-label="Subir">
                  ↑
                </button>
                <button type="button" disabled={pendente || i === itens.length - 1} onClick={() => rodar(() => moverItemAction(modelo.id, item.id, "descer"))} className="rounded border border-cinza-claro px-2 py-1 disabled:opacity-30" aria-label="Descer">
                  ↓
                </button>
                <button type="button" onClick={() => setEditando(item.id)} className="rounded border border-cinza-claro px-2 py-1">
                  Editar
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => window.confirm("Remover este item?") && rodar(() => removerItemAction(modelo.id, item.id))}
                  className="rounded border border-vermelho px-2 py-1 text-vermelho"
                >
                  Remover
                </button>
              </div>
            </div>
          ),
        )}
      </section>
    </div>
  );
}

function FormItem({
  item,
  aoSalvar,
  aoCancelar,
  pendente,
}: {
  item?: ItemModelo;
  aoSalvar: (fd: FormData) => void;
  aoCancelar: () => void;
  pendente: boolean;
}) {
  const [tipo, setTipo] = useState(item?.tipo ?? "check");
  const [critico, setCritico] = useState(item?.critico ?? false);
  const comMeta = tipo === "numero" || tipo === "estrelas";
  return (
    <form action={aoSalvar} className="grid gap-2 rounded-lg border border-azul-petroleo bg-branco p-3 md:grid-cols-2">
      <label className={`${ROTULO} md:col-span-2`}>
        Item
        <input name="titulo" required maxLength={200} defaultValue={item?.titulo} className={CAMPO} />
      </label>
      <label className={ROTULO}>
        Grupo (opcional)
        <input name="grupo" maxLength={80} defaultValue={item?.grupo ?? ""} className={CAMPO} />
      </label>
      <label className={ROTULO}>
        Tipo
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as ItemModelo["tipo"])} className={CAMPO}>
          {TIPOS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.t}
            </option>
          ))}
        </select>
      </label>
      {comMeta && (
        <>
          <label className={ROTULO}>
            Meta mínima
            <input name="metaMin" inputMode="decimal" defaultValue={item?.metaMin ?? ""} className={CAMPO} />
          </label>
          <label className={ROTULO}>
            Meta máxima
            <input name="metaMax" inputMode="decimal" defaultValue={item?.metaMax ?? ""} className={CAMPO} />
          </label>
        </>
      )}
      <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="critico" checked={critico} onChange={(e) => setCritico(e.target.checked)} /> Crítico
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="foto" defaultChecked={item?.fotoObrigatoria ?? false} /> Foto obrigatória
        </label>
        <label className={`flex items-center gap-1 ${critico ? "opacity-40" : ""}`}>
          <input type="checkbox" name="permiteNa" disabled={critico} defaultChecked={item ? item.permiteNa : true} /> Aceita &quot;não se aplica&quot;
        </label>
      </div>
      <div className="flex gap-2 md:col-span-2">
        <button type="submit" disabled={pendente} className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-60">
          Salvar item
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}
