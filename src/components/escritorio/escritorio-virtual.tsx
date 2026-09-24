"use client";

import { useMemo, useState } from "react";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { buscarPorAssunto, precisamDeVoce, type PosicaoMontada, type SalaMontada } from "@/lib/escritorio/escritorio";
import { DetalhePosicao } from "./detalhe-posicao";
import { SITUACAO, dataBr } from "./rotulos";
import { SalaEscritorio } from "./sala-escritorio";

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque && valor > 0 ? "border-ambar bg-ambar/10" : "border-cinza-claro bg-branco"}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">{rotulo}</p>
      <p className="font-mono text-2xl font-bold text-azul-noite">{valor}</p>
    </div>
  );
}

function LinhaPosicao({ posicao, salaNome, aoAbrir }: { posicao: PosicaoMontada; salaNome: string; aoAbrir: () => void }) {
  return (
    <button type="button" onClick={aoAbrir} className="flex w-full flex-col items-start rounded-md border border-cinza-claro bg-branco px-3 py-2 text-left hover:border-ambar sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-sm font-semibold text-azul-noite">{posicao.cargo}</span>
      <span className="text-xs text-cinza-medio">
        {salaNome} · {posicao.ocupante?.nome ?? "Vaga"} · {SITUACAO[posicao.estado.situacao].rotulo}
        {posicao.estado.motivo ? ` - ${posicao.estado.motivo}` : ""}
      </span>
    </button>
  );
}

export function EscritorioVirtual({ salas, atualizadoEm }: { salas: SalaMontada[]; atualizadoEm: string }) {
  const [aberta, setAberta] = useState<PosicaoMontada | null>(null);
  const [busca, setBusca] = useState("");

  const nomeSala = useMemo(() => new Map(salas.map((s) => [s.id, s.nome])), [salas]);
  const todas = salas.flatMap((s) => s.posicoes);
  const pendentes = precisamDeVoce(salas);
  const resultados = buscarPorAssunto(salas, busca);

  const topo = salas.filter((s) => s.tipo === "ceo" || s.tipo === "recepcao");
  const diretorias = salas.filter((s) => s.tipo === "diretoria");
  const horizzon = salas.filter((s) => s.empresa === "horizzon");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Escritório Virtual</h1>
        <p className="text-sm text-cinza">Fale com o Vini. Ele recebe o pedido e encaminha para a sala certa.</p>
        <p className="text-xs text-cinza-medio">
          Estado registrado em {dataBr(atualizadoEm)}. Atualização manual, não é tempo real.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Resumo rotulo="Posições" valor={todas.length} />
        <Resumo rotulo="Preenchidas" valor={todas.filter((p) => p.ocupanteId).length} />
        <Resumo rotulo="Vagas" valor={todas.filter((p) => !p.ocupanteId).length} />
        <Resumo rotulo="Precisam de você" valor={pendentes.length} destaque />
      </div>

      {pendentes.length > 0 && (
        <section aria-label="Precisam de você" className="flex flex-col gap-2 rounded-xl border-2 border-ambar bg-branco p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-azul-noite">Precisam de você</h2>
          {pendentes.map((p) => (
            <LinhaPosicao key={p.id} posicao={p} salaNome={nomeSala.get(p.salaId) ?? ""} aoAbrir={() => setAberta(p)} />
          ))}
        </section>
      )}

      <section aria-label="Quem cuida de" className="flex flex-col gap-2">
        <label htmlFor="busca-assunto" className="text-xs font-bold uppercase tracking-wide text-cinza-medio">Quem cuida de...?</label>
        <input
          id="busca-assunto"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Ex.: contrato, DRE, Instagram, onboarding, relatório"
          className="w-full rounded-lg border border-cinza-claro bg-branco px-3 py-2 text-sm focus:border-ambar focus:outline-none"
        />
        {busca.trim().length >= 2 && (
          resultados.length === 0 ? (
            <p className="text-sm text-cinza-medio">Nenhuma posição cuida desse assunto ainda. Leve ao Vini para ele decidir o destino.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {resultados.map((p) => (
                <LinhaPosicao key={p.id} posicao={p} salaNome={nomeSala.get(p.salaId) ?? ""} aoAbrir={() => setAberta(p)} />
              ))}
            </div>
          )
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {topo.map((s) => (
          <div key={s.id} className={s.tipo === "recepcao" ? "md:col-span-2" : ""}>
            <SalaEscritorio sala={s} aoAbrir={setAberta} />
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {diretorias.map((s) => <SalaEscritorio key={s.id} sala={s} aoAbrir={setAberta} />)}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-cinza-medio">
          Horizzon Work - empresa separada. Documentos, tarefas e indicadores não se misturam com a Zatti.
        </p>
        {horizzon.map((s) => <SalaEscritorio key={s.id} sala={s} aoAbrir={setAberta} />)}
      </div>

      <details className="rounded-lg border border-cinza-claro bg-branco p-3 text-sm text-cinza">
        <summary className="cursor-pointer font-semibold text-azul-noite">Como cada sala evolui</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Ocupação:</b> posições preenchidas sobre o total. Vaga deixa a sala incompleta.</li>
          <li><b>Maturidade:</b> média do nível das posições de IA (apenas definido, processo disponível, agente operacional). Só sobe com processo validado e evidência registrada.</li>
          <li><b>Entregas registradas:</b> atividades concluídas anotadas no estado da posição.</li>
          <li><b>Alertas:</b> erro recorrente, atraso ou problema aberto. Somem quando resolvidos.</li>
          <li>Posições ocupadas por Vinícius ficam fora da maturidade: ela mede o que o Time de IA já assume.</li>
        </ul>
      </details>

      <ModalFlutuante aberto={aberta !== null} onFechar={() => setAberta(null)}>
        {aberta && <DetalhePosicao posicao={aberta} salaNome={nomeSala.get(aberta.salaId) ?? ""} aoFechar={() => setAberta(null)} />}
      </ModalFlutuante>
    </div>
  );
}
