"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { descartarPlanoAction, resolverPlanoAction } from "@/app/(app)/garante/actions";
import type { PlanoTela } from "@/app/(app)/garante/dados";
import { DICA_PLANOS, ordenarPlanos, situacaoPlanoNaTela, type SituacaoPlanoTela } from "@/lib/garante/planos";
import { hojeOperacao, horaOperacao } from "@/lib/garante/regras";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { DicaCalculo } from "@/components/dica-calculo";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";

const ESTILO: Record<SituacaoPlanoTela, { texto: string; classe: string }> = {
  atrasado: { texto: "Atrasado", classe: "bg-vermelho/10 text-vermelho" },
  aberto: { texto: "No prazo", classe: "bg-azul-petroleo/10 text-azul-petroleo" },
  resolvido: { texto: "Resolvido", classe: "bg-verde/10 text-verde" },
  descartado: { texto: "Descartado", classe: "bg-cinza-claro text-cinza" },
};
const SEM_RESPONSAVEL = "__gestao__";

type Janela = { tipo: "resolver" | "descartar"; plano: PlanoTela } | null;

/** Lista de planos (atrasados no topo, depois no prazo, depois os fechados nos
 * últimos 30 dias). Gestão filtra por responsável. Resolver e descartar abrem
 * um ModalFlutuante com o texto; o banco confere quem pode de novo. */
export function ListaPlanos({ planos, gestao, agoraIso }: { planos: PlanoTela[]; gestao: boolean; agoraIso: string }) {
  const router = useRouter();
  const agora = useMemo(() => new Date(agoraIso), [agoraIso]);
  const [filtro, setFiltro] = useState("");
  const [janela, setJanela] = useState<Janela>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const opcoes = useMemo(() => {
    const pessoas = new Map<string, string>();
    for (const p of planos) if (p.responsavelId) pessoas.set(p.responsavelId, p.responsavelNome ?? "Pessoa sem nome");
    return [
      ...(planos.some((p) => !p.responsavelId) ? [{ id: SEM_RESPONSAVEL, label: "Gestão da unidade (sem responsável)" }] : []),
      ...[...pessoas].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [planos]);

  const visiveis = ordenarPlanos(
    planos.filter((p) => !filtro || (filtro === SEM_RESPONSAVEL ? !p.responsavelId : p.responsavelId === filtro)),
    agora,
  );
  const grupos: { titulo: string; itens: PlanoTela[] }[] = [
    { titulo: "Atrasados", itens: visiveis.filter((p) => situacaoPlanoNaTela(p.situacao, p.prazo, agora) === "atrasado") },
    { titulo: "No prazo", itens: visiveis.filter((p) => situacaoPlanoNaTela(p.situacao, p.prazo, agora) === "aberto") },
    { titulo: "Resolvidos e descartados (últimos 30 dias)", itens: visiveis.filter((p) => p.situacao !== "aberto") },
  ];

  function abrir(j: NonNullable<Janela>) {
    setErro(null);
    setTexto("");
    setJanela(j);
  }

  function enviar() {
    if (!janela) return;
    setErro(null);
    startTransition(async () => {
      const r = janela.tipo === "resolver" ? await resolverPlanoAction(janela.plano.id, texto) : await descartarPlanoAction(janela.plano.id, texto);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setJanela(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {gestao && opcoes.length > 1 && (
        <div className="max-w-sm">
          <p className="text-xs font-semibold text-cinza-medio">Responsável</p>
          <SeletorComBusca value={filtro} opcoes={opcoes} onChange={setFiltro} vazioLabel="Todos" placeholder="Buscar responsável..." />
        </div>
      )}

      {planos.length === 0 && (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum plano de ação. Ele aparece aqui quando um checklist é concluído com item fora da meta, ou quando um item crítico fica fora da meta e o checklist
          vence sem ser concluído.
        </p>
      )}

      {grupos
        .filter((g) => g.itens.length > 0)
        .map((g) => (
          <section key={g.titulo} className="flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-azul-noite">
              {g.titulo} <span className="text-sm font-normal text-cinza-medio">({g.itens.length})</span>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {g.itens.map((p) => (
                <CartaoPlano key={p.id} plano={p} agora={agora} aoResolver={() => abrir({ tipo: "resolver", plano: p })} aoDescartar={() => abrir({ tipo: "descartar", plano: p })} />
              ))}
            </div>
          </section>
        ))}

      <ModalFlutuante aberto={janela !== null} onFechar={() => !pendente && setJanela(null)}>
        {janela && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
            className="flex flex-col gap-3"
          >
            <h2 className="font-display text-lg font-bold text-azul-noite">
              {janela.tipo === "resolver" ? "Resolver o plano" : "Descartar o plano"}
            </h2>
            <p className="text-sm text-cinza">
              {janela.plano.itemTitulo} · {janela.plano.modeloNome} de {formatarDataBr(janela.plano.data)}
            </p>
            <label className="text-xs font-semibold text-cinza-medio">
              {janela.tipo === "resolver" ? "O que foi feito para resolver" : "Por que este plano não precisa de ação"}
              <textarea
                required
                minLength={3}
                maxLength={500}
                rows={4}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="mt-1 w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm"
                placeholder={janela.tipo === "resolver" ? "Ex.: técnico regulou a câmara fria, temperatura voltou para 3 °C" : "Ex.: termômetro estava quebrado"}
              />
            </label>
            <p className="text-xs text-cinza-medio">
              {texto.trim().length} de 500 caracteres (mínimo 3). Depois de {janela.tipo === "resolver" ? "resolvido" : "descartado"}, o plano não muda mais.
            </p>
            {erro && <p className="text-sm text-vermelho">{erro}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pendente}
                className={`rounded-md px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60 ${janela.tipo === "resolver" ? "bg-azul-noite" : "bg-vermelho"}`}
              >
                {pendente ? "Salvando..." : janela.tipo === "resolver" ? "Marcar como resolvido" : "Descartar este plano"}
              </button>
              <button type="button" onClick={() => setJanela(null)} className="rounded-md border border-cinza-claro px-3 py-2 text-xs">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </ModalFlutuante>
    </div>
  );
}

function CartaoPlano({ plano, agora, aoResolver, aoDescartar }: { plano: PlanoTela; agora: Date; aoResolver: () => void; aoDescartar: () => void }) {
  const situacao = situacaoPlanoNaTela(plano.situacao, plano.prazo, agora);
  const estilo = ESTILO[situacao];
  return (
    <article className={`flex flex-col gap-2 rounded-lg border bg-branco p-4 text-sm ${situacao === "atrasado" ? "border-vermelho/50" : "border-cinza-claro"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-azul-noite">
            {plano.itemTitulo}
            {plano.critico && <span className="ml-2 rounded bg-vermelho/10 px-1.5 py-0.5 text-[11px] font-semibold text-vermelho">Crítico</span>}
          </p>
          <Link href={`/garante/execucao/${plano.execucaoId}`} className="text-xs text-azul-petroleo underline">
            {plano.modeloNome} de {formatarDataBr(plano.data)}
          </Link>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${estilo.classe}`}>{estilo.texto}</span>
      </div>
      <p className="text-cinza">
        Resposta: {plano.respostaTexto}
        <span className="text-xs text-cinza-medio">
          {" "}· {plano.origem === "conclusao" ? "fora da meta na conclusão" : "crítico fora da meta, checklist venceu sem concluir"}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-1 text-xs text-cinza-medio">
        Responsável: {plano.responsavelNome ?? "Gestão da unidade"}
        <DicaCalculo rotulo="responsável do plano" texto={DICA_PLANOS.responsavel} />
        <span>· Prazo: {horaOperacao(plano.prazo, hojeOperacao(agora))}</span>
        <DicaCalculo rotulo="prazo do plano" texto={DICA_PLANOS.prazo} />
      </p>
      {plano.situacao !== "aberto" && (
        <p className="rounded-md bg-off-white px-2 py-1.5 text-xs text-cinza">
          {plano.situacao === "resolvido" ? `Resolvido: ${plano.resolucao}` : `Descartado: ${plano.motivoDescarte}`}
          {plano.fechadoPorNome && ` · ${plano.fechadoPorNome}`}
          {plano.fechadoEm && ` · ${horaOperacao(plano.fechadoEm, hojeOperacao(agora))}`}
        </p>
      )}
      {(plano.podeResolver || plano.podeDescartar) && (
        <div className="flex flex-wrap gap-2">
          {plano.podeResolver && (
            <button type="button" onClick={aoResolver} className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco">
              Marcar como resolvido
            </button>
          )}
          {plano.podeDescartar && (
            <button type="button" onClick={aoDescartar} className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho hover:bg-vermelho/10">
              Descartar plano
            </button>
          )}
        </div>
      )}
    </article>
  );
}
