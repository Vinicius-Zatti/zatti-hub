"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  encerrarPublicacaoAction,
  moverItemAction,
  pararDeUsarModeloAction,
  publicarAction,
  removerItemAction,
  salvarItemAction,
} from "@/app/(app)/garante/actions";
import type { ItemModelo, Pessoa, PublicacaoModelo } from "@/app/(app)/garante/dados";
import { DIAS_SEMANA, textoDias, textoMeta } from "@/lib/garante/regras";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { CampoNumero } from "@/components/campo-numero";

const CAMPO = "mt-1 w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm";
const ROTULO = "text-xs font-semibold text-cinza-medio";
const TIPOS = [
  { v: "check", t: "Feito / não feito" },
  { v: "numero", t: "Número (com faixa)" },
  { v: "estrelas", t: "Estrelas (1 a 5)" },
  { v: "texto", t: "Texto" },
];

type Resultado = { ok: true } | { erro: string };

/** O que está aberto por cima da tela (sempre `ModalFlutuante`). */
type Janela =
  | { tipo: "item"; item?: ItemModelo }
  | { tipo: "publicar" }
  | { tipo: "parar_modelo" }
  | { tipo: "parar_programacao"; publicacao: PublicacaoModelo }
  | { tipo: "tirar_item"; item: ItemModelo }
  | null;

/** Edição do checklist pela gestão (a página só abre para gestão e master,
 * `requireGestaoGarante`). Criar, editar, publicar e parar abrem modal com o
 * texto do que acontece e do que não acontece com o histórico. */
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
  const [janela, setJanela] = useState<Janela>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroJanela, setErroJanela] = useState<string | null>(null);

  function abrir(j: Janela) {
    setErroJanela(null);
    setJanela(j);
  }

  /** Roda a ação; erro fica dentro do modal aberto (ou na página, sem modal). */
  function rodar(acao: () => Promise<Resultado>, depois?: () => void) {
    setErro(null);
    setErroJanela(null);
    startTransition(async () => {
      const r = await acao();
      if ("erro" in r) {
        if (janela) setErroJanela(r.erro);
        else setErro(r.erro);
        return;
      }
      setJanela(null);
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
          onClick={() => abrir({ tipo: "parar_modelo" })}
          className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho"
        >
          Parar de usar este checklist
        </button>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}

      <section className="flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-azul-noite">Quem faz e até que horas</h2>
            <p className="text-xs text-cinza-medio">
              Publicar coloca este checklist na lista de Hoje de quem vai fazer, nos dias escolhidos, a partir de hoje.
            </p>
          </div>
          <button
            type="button"
            disabled={pendente || itens.length === 0}
            onClick={() => abrir({ tipo: "publicar" })}
            className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco disabled:opacity-60"
          >
            Publicar
          </button>
        </div>
        {itens.length === 0 && <p className="text-xs text-vermelho">Adicione pelo menos um item antes de publicar.</p>}
        {publicacoes.length === 0 && <p className="text-sm text-cinza-medio">Ainda não publicado: ninguém recebe este checklist.</p>}
        {publicacoes.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-cinza-claro pb-2 text-sm">
            <span>
              <strong>{textoDias(p.dias)}</strong> até <strong>{p.horario}</strong>
              {p.setorNome && ` · ${p.setorNome}`} · {p.responsavelNome ?? "qualquer pessoa da unidade"}
              {p.vigenteAte && <span className="text-cinza-medio"> · último dia {formatarDataBr(p.vigenteAte)}</span>}
            </span>
            {!p.vigenteAte && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => abrir({ tipo: "parar_programacao", publicacao: p })}
                className="text-xs font-semibold text-vermelho underline"
              >
                Parar esta programação
              </button>
            )}
          </div>
        ))}
        <p className="text-xs text-cinza-medio">
          Para mudar dias, horário ou responsável: pare a programação atual e publique outra. Assim o histórico de atrasos fica como era.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-azul-noite">Itens ({itens.length})</h2>
          <button
            type="button"
            onClick={() => abrir({ tipo: "item" })}
            className="rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo"
          >
            Adicionar item
          </button>
        </div>
        <p className="text-xs text-cinza-medio">Mudanças nos itens valem para os próximos checklists. Os que já começaram guardam os itens como eram.</p>
        {itens.map((item, i) => (
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
              <button type="button" onClick={() => abrir({ tipo: "item", item })} className="rounded border border-cinza-claro px-2 py-1">
                Editar
              </button>
              <button type="button" disabled={pendente} onClick={() => abrir({ tipo: "tirar_item", item })} className="rounded border border-vermelho px-2 py-1 text-vermelho">
                Tirar item
              </button>
            </div>
          </div>
        ))}
      </section>

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela?.tipo === "item" && (
          <FormItem
            key={janela.item?.id ?? "novo"}
            item={janela.item}
            erro={erroJanela}
            pendente={pendente}
            aoSalvar={(fd) => rodar(() => salvarItemAction(modelo.id, janela.item?.id ?? null, fd))}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "publicar" && (
          <FormPublicar
            setores={setores}
            pessoas={pessoas}
            erro={erroJanela}
            pendente={pendente}
            aoPublicar={(dados) => rodar(() => publicarAction(modelo.id, dados))}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "parar_modelo" && (
          <Confirmacao
            titulo="Parar de usar este checklist?"
            acontece={[
              "Ele some da lista de Hoje, de hoje em diante, para todo mundo.",
              "Sai da sua lista de checklists em Modelos e publicação.",
              "Se alguém já começou o de hoje, ainda pode terminar.",
            ]}
            naoAcontece={[
              "Nada do histórico é apagado: checklists feitos, fotos (guardadas por 40 dias) e dias que ficaram sem fazer continuam no Quadro do dia.",
              "Para voltar a usar, crie de novo a partir do POP.",
            ]}
            confirmar="Parar de usar"
            erro={erroJanela}
            pendente={pendente}
            aoConfirmar={() => rodar(() => pararDeUsarModeloAction(modelo.id), () => router.push("/garante/modelos"))}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "parar_programacao" && (
          <Confirmacao
            titulo="Parar esta programação?"
            acontece={[
              `${textoDias(janela.publicacao.dias)} até ${janela.publicacao.horario}: hoje ainda vale; a partir de amanhã ninguém recebe mais este checklist por esta programação.`,
              "Outras programações deste checklist continuam valendo.",
            ]}
            naoAcontece={["O que já foi feito, e os dias que ficaram sem fazer, continuam no Quadro do dia."]}
            confirmar="Parar a partir de amanhã"
            erro={erroJanela}
            pendente={pendente}
            aoConfirmar={() => rodar(() => encerrarPublicacaoAction(janela.publicacao.id))}
            aoCancelar={() => setJanela(null)}
          />
        )}
        {janela?.tipo === "tirar_item" && (
          <Confirmacao
            titulo="Tirar este item?"
            acontece={[`"${janela.item.titulo}" sai dos próximos checklists.`]}
            naoAcontece={["Os checklists que já começaram ou foram feitos guardam este item e a resposta como eram."]}
            confirmar="Tirar item"
            erro={erroJanela}
            pendente={pendente}
            aoConfirmar={() => rodar(() => removerItemAction(modelo.id, janela.item.id))}
            aoCancelar={() => setJanela(null)}
          />
        )}
      </ModalFlutuante>
    </div>
  );
}

function Confirmacao({
  titulo,
  acontece,
  naoAcontece,
  confirmar,
  erro,
  pendente,
  aoConfirmar,
  aoCancelar,
}: {
  titulo: string;
  acontece: string[];
  naoAcontece: string[];
  confirmar: string;
  erro: string | null;
  pendente: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">{titulo}</h2>
      <div>
        <p className="text-xs font-bold uppercase text-cinza-medio">O que acontece</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-cinza">
          {acontece.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-xs font-bold uppercase text-cinza-medio">O que não acontece</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-cinza">
          {naoAcontece.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pendente} onClick={aoConfirmar} className="rounded-md bg-vermelho px-3 py-2 text-xs font-semibold text-branco disabled:opacity-60">
          {pendente ? "Salvando..." : confirmar}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function FormPublicar({
  setores,
  pessoas,
  erro,
  pendente,
  aoPublicar,
  aoCancelar,
}: {
  setores: { id: string; nome: string }[];
  pessoas: Pessoa[];
  erro: string | null;
  pendente: boolean;
  aoPublicar: (dados: { dias: string[]; horario: string; setorId: string; responsavelId: string }) => void;
  aoCancelar: () => void;
}) {
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [horario, setHorario] = useState("10:00");
  const [responsavelId, setResponsavelId] = useState("");
  const [setorId, setSetorId] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoPublicar({ dias: dias.map(String), horario, setorId, responsavelId });
      }}
      className="flex flex-col gap-3"
    >
      <h2 className="font-display text-lg font-bold text-azul-noite">Publicar checklist</h2>
      <p className="text-xs text-cinza-medio">Entra na lista de Hoje de quem vai fazer, a partir de hoje, nos dias marcados.</p>
      <fieldset>
        <legend className={ROTULO}>Dias</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {DIAS_SEMANA.map((d, i) => (
            <label key={d} className="flex items-center gap-1 rounded-md border border-cinza-claro bg-branco px-2 py-1 text-sm">
              <input
                type="checkbox"
                checked={dias.includes(i)}
                onChange={(e) => setDias((atual) => (e.target.checked ? [...atual, i] : atual.filter((x) => x !== i)))}
              />{" "}
              {d}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={ROTULO}>
        Horário limite
        <input type="time" required value={horario} onChange={(e) => setHorario(e.target.value)} className={CAMPO} />
      </label>
      <div className={ROTULO}>
        Responsável
        <SeletorComBusca
          className="mt-1"
          value={responsavelId}
          onChange={setResponsavelId}
          vazioLabel="Qualquer pessoa da unidade"
          opcoes={pessoas.map((p) => ({ id: p.id, label: p.nome }))}
        />
        <span className="mt-1 block font-normal">Só aparece quem tem acesso a esta unidade (cadastro em Equipe).</span>
      </div>
      {setores.length > 0 && (
        <div className={ROTULO}>
          Setor (opcional)
          <SeletorComBusca
            className="mt-1"
            value={setorId}
            onChange={setSetorId}
            vazioLabel="Sem setor"
            opcoes={setores.map((s) => ({ id: s.id, label: s.nome }))}
          />
        </div>
      )}
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendente || dias.length === 0} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
          {pendente ? "Publicando..." : "Publicar"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormItem({
  item,
  erro,
  aoSalvar,
  aoCancelar,
  pendente,
}: {
  item?: ItemModelo;
  erro: string | null;
  aoSalvar: (fd: FormData) => void;
  aoCancelar: () => void;
  pendente: boolean;
}) {
  const [tipo, setTipo] = useState(item?.tipo ?? "check");
  const [critico, setCritico] = useState(item?.critico ?? false);
  const [metaMin, setMetaMin] = useState<number | null>(item?.metaMin ?? null);
  const [metaMax, setMetaMax] = useState<number | null>(item?.metaMax ?? null);
  const comMeta = tipo === "numero" || tipo === "estrelas";
  const decimais = tipo === "estrelas" ? 0 : 1;
  return (
    <form action={aoSalvar} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">{item ? "Editar item" : "Novo item"}</h2>
      <label className={ROTULO}>
        Item
        <input name="titulo" required maxLength={200} defaultValue={item?.titulo} className={CAMPO} />
      </label>
      <label className={ROTULO}>
        Grupo (opcional)
        <input name="grupo" maxLength={80} defaultValue={item?.grupo ?? ""} className={CAMPO} />
      </label>
      <label className={ROTULO}>
        Tipo de resposta
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as ItemModelo["tipo"])} className={CAMPO}>
          {TIPOS.map((t) => (
            <option key={t.v} value={t.v}>
              {t.t}
            </option>
          ))}
        </select>
      </label>
      {comMeta && (
        <div className="grid grid-cols-2 gap-2">
          <label className={ROTULO}>
            Meta mínima
            <CampoNumero value={metaMin} onChange={setMetaMin} decimais={decimais} className="mt-1 w-full px-2 py-1.5 text-sm" />
          </label>
          <label className={ROTULO}>
            Meta máxima
            <CampoNumero value={metaMax} onChange={setMetaMax} decimais={decimais} className="mt-1 w-full px-2 py-1.5 text-sm" />
          </label>
          <input type="hidden" name="metaMin" value={metaMin ?? ""} />
          <input type="hidden" name="metaMax" value={metaMax ?? ""} />
          <p className="col-span-2 text-xs text-cinza-medio">Resposta fora dessa faixa aparece em vermelho como &quot;fora da meta&quot;. Deixe em branco o lado sem limite.</p>
        </div>
      )}
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="critico" checked={critico} onChange={(e) => setCritico(e.target.checked)} className="mt-1" />
          <span>
            Crítico <span className="text-xs text-cinza-medio">(nunca aceita &quot;não se aplica&quot;)</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="foto" defaultChecked={item?.fotoObrigatoria ?? false} className="mt-1" />
          <span>
            Foto obrigatória <span className="text-xs text-cinza-medio">(sem a foto, o item não conta como feito)</span>
          </span>
        </label>
        <label className={`flex items-start gap-2 ${critico ? "opacity-40" : ""}`}>
          <input type="checkbox" name="permiteNa" disabled={critico} defaultChecked={item ? item.permiteNa : true} className="mt-1" />
          <span>
            Aceita &quot;não se aplica&quot; <span className="text-xs text-cinza-medio">(com motivo escrito)</span>
          </span>
        </label>
      </div>
      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pendente} className="rounded-md bg-azul-noite px-3 py-2 text-xs font-semibold text-branco disabled:opacity-60">
          {pendente ? "Salvando..." : "Salvar item"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
          Cancelar
        </button>
      </div>
    </form>
  );
}
