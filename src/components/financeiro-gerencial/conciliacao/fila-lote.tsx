"use client";

import { Fragment, useState } from "react";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { DicaCalculo } from "@/components/dica-calculo";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { agruparFila, LIMITE_LOTE, paraCentavos, resumirLote } from "@/lib/conciliacao/decisao-tela";
import type { ItemFila } from "@/lib/banco/conciliacao";
import { brl, brlCentavos, MensagemErro, useEnvioDecisao, type ContextoDecisao } from "./comum";

const EXPLICACAO_GRUPO =
  "Movimentos desta página da fila com a mesma descrição (sem diferença de maiúsculas e sem números longos, como CPF, CNPJ ou código da transação) e a mesma direção. Total = soma dos valores do grupo.";
const EXPLICACAO_SELECAO = "Total selecionado = soma dos valores dos movimentos marcados.";

type Acao = "notas" | "ignorar" | null;

/** Fila agrupada por descrição, para decidir em lote (como a tela em lote do Nibo). */
export function FilaLote({ fila, contexto, aoConcluir }: { fila: ItemFila[]; contexto: ContextoDecisao; aoConcluir: (t: string) => void }) {
  const grupos = agruparFila(fila);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [acao, setAcao] = useState<Acao>(null);

  const selecionados = fila.filter((m) => marcados.has(m.id));
  const resumo = resumirLote(selecionados);

  function marcar(ids: string[], valor: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      for (const id of ids) {
        if (valor) novo.add(id);
        else novo.delete(id);
      }
      return novo;
    });
  }

  function alternarAberto(chave: string) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function concluir(texto: string) {
    setAcao(null);
    setMarcados(new Set());
    aoConcluir(texto);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-cinza-claro bg-branco p-2 text-sm">
        <span>
          {resumo.quantidade} selecionado(s) · {brlCentavos(resumo.totalCentavos)}
        </span>
        <DicaCalculo texto={EXPLICACAO_SELECAO} rotulo="Total selecionado" />
        {resumo.acimaDoLimite && <span className="text-xs text-vermelho">Máximo de {LIMITE_LOTE} por envio.</span>}
        {resumo.direcao === "mista" && <span className="text-xs text-cinza-medio">Para criar notas, marque só entradas ou só saídas.</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            disabled={resumo.quantidade === 0 || resumo.acimaDoLimite || resumo.direcao === "mista"}
            onClick={() => setAcao("notas")}
            className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite disabled:opacity-50"
          >
            Criar notas com um Plano de Contas
          </button>
          <button
            type="button"
            disabled={resumo.quantidade === 0 || resumo.acimaDoLimite}
            onClick={() => setAcao("ignorar")}
            className="rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho disabled:opacity-50"
          >
            Ignorar selecionados
          </button>
        </div>
      </div>

      <TabelaRolavel className="max-h-[75vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Fila agrupada por descrição">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="bg-azul-petroleo text-branco">
              <Th larguraFixa="44px"> </Th>
              <Th fixo>Descrição</Th>
              <Th>Direção</Th>
              <Th align="right">Quantidade</Th>
              <Th align="right">
                <span className="inline-flex items-center gap-1">Total <DicaCalculo texto={EXPLICACAO_GRUPO} rotulo="Total do grupo" /></span>
              </Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const ids = g.itens.map((i) => i.id);
              const qtdMarcados = ids.filter((id) => marcados.has(id)).length;
              const aberto = abertos.has(g.chave);
              return (
                <Fragment key={g.chave}>
                  <tr className="border-t border-cinza-claro">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Marcar o grupo"
                        checked={qtdMarcados === ids.length}
                        ref={(el) => {
                          if (el) el.indeterminate = qtdMarcados > 0 && qtdMarcados < ids.length;
                        }}
                        onChange={(e) => marcar(ids, e.target.checked)}
                      />
                    </td>
                    <td className="max-w-[360px] truncate px-3 py-2 font-semibold" title={g.descricao}>{g.descricao}</td>
                    <td className={`px-3 py-2 ${g.direcao === "saida" ? "text-vermelho" : "text-verde"}`}>{g.direcao === "saida" ? "Saída" : "Entrada"}</td>
                    <td className="px-3 py-2 text-right">{g.itens.length}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brlCentavos(g.totalCentavos)}</td>
                    <td className="px-3 py-2 text-xs">
                      <button type="button" onClick={() => alternarAberto(g.chave)} className="font-semibold text-azul-petroleo underline">
                        {aberto ? "Esconder" : "Ver movimentos"}
                      </button>
                    </td>
                  </tr>
                  {aberto &&
                    g.itens.map((m) => (
                      <tr key={m.id} className="bg-cinza-claro/20 text-xs">
                        <td className="px-3 py-1 pl-6">
                          <input type="checkbox" aria-label="Marcar o movimento" checked={marcados.has(m.id)} onChange={(e) => marcar([m.id], e.target.checked)} />
                        </td>
                        <td className="max-w-[360px] truncate px-3 py-1" title={m.descricaoOriginal}>
                          {formatarDataBr(m.data)} · {m.descricaoOriginal}
                        </td>
                        <td className="px-3 py-1"> </td>
                        <td className="px-3 py-1"> </td>
                        <td className="px-3 py-1 text-right whitespace-nowrap">{brl(m.valor)}</td>
                        <td className="px-3 py-1"> </td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TabelaRolavel>
      <p className="text-xs text-cinza-medio">Os grupos consideram só os movimentos desta página da fila.</p>

      <ModalFlutuante aberto={acao === "notas"} onFechar={() => setAcao(null)}>
        {acao === "notas" && resumo.direcao !== "mista" && resumo.direcao !== null && (
          <CriarNotasLote itens={selecionados} direcao={resumo.direcao} totalCentavos={resumo.totalCentavos} contexto={contexto} aoConcluir={concluir} onFechar={() => setAcao(null)} />
        )}
      </ModalFlutuante>
      <ModalFlutuante aberto={acao === "ignorar"} onFechar={() => setAcao(null)}>
        {acao === "ignorar" && <IgnorarLote itens={selecionados} totalCentavos={resumo.totalCentavos} aoConcluir={concluir} onFechar={() => setAcao(null)} />}
      </ModalFlutuante>
    </div>
  );
}

function Resumo({ quantidade, totalCentavos }: { quantidade: number; totalCentavos: number }) {
  return (
    <p className="flex items-center gap-1 rounded-md bg-cinza-claro/40 p-2 text-sm">
      {quantidade} movimento(s) · total <strong>{brlCentavos(totalCentavos)}</strong>
      <DicaCalculo texto={EXPLICACAO_SELECAO} rotulo="Total do lote" />
    </p>
  );
}

function CriarNotasLote({ itens, direcao, totalCentavos, contexto, aoConcluir, onFechar }: {
  itens: ItemFila[];
  direcao: "entrada" | "saida";
  totalCentavos: number;
  contexto: ContextoDecisao;
  aoConcluir: (t: string) => void;
  onFechar: () => void;
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [aprender, setAprender] = useState(false);
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);
  const entrada = direcao === "entrada";

  function confirmar() {
    enviar(
      itens.map((m) => ({
        movimentoId: m.id,
        acao: "criar_documento",
        contraparteId: null,
        numero: "",
        descricao: m.descricaoOriginal.slice(0, 200),
        linhas: [{ categoriaId, descricao: "", valorCentavos: paraCentavos(m.valor) }],
        aprender,
      })),
      `${itens.length} nota(s) de ${entrada ? "receita" : "despesa"} criada(s) e conciliada(s).`,
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <h2 className="font-display text-lg font-bold text-azul-noite">Criar notas em lote</h2>
      <p className="text-xs text-cinza-medio">
        Cada movimento vira uma {entrada ? "receita recebida" : "despesa paga"} com o valor e a descrição dele, no Plano de Contas escolhido.
      </p>
      <Resumo quantidade={itens.length} totalCentavos={totalCentavos} />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Plano de Contas</span>
        <SeletorComBusca value={categoriaId} opcoes={entrada ? contexto.planoReceita : contexto.planoDespesa} onChange={setCategoriaId} placeholder="Escolha o Plano de Contas" />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={aprender} onChange={(e) => setAprender(e.target.checked)} />
        <span>Aprender: os próximos movimentos com estas descrições chegam com este Plano de Contas sugerido (sempre como sugestão).</span>
      </label>
      <MensagemErro texto={erro} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-cinza-medio">Cancelar</button>
        <button type="button" disabled={pendente || !categoriaId} onClick={confirmar} className="rounded-md bg-ambar px-3 py-1.5 font-bold text-azul-noite disabled:opacity-50">
          {pendente ? "Gravando..." : `Criar ${itens.length} nota(s)`}
        </button>
      </div>
    </div>
  );
}

function IgnorarLote({ itens, totalCentavos, aoConcluir, onFechar }: { itens: ItemFila[]; totalCentavos: number; aoConcluir: (t: string) => void; onFechar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);
  const valido = motivo.trim().length >= 3;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <h2 className="font-display text-lg font-bold text-azul-noite">Ignorar em lote</h2>
      <Resumo quantidade={itens.length} totalCentavos={totalCentavos} />
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Motivo (obrigatório, vale para todos)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={3} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
      </label>
      {!valido && motivo.length > 0 && <p className="text-xs text-vermelho">Escreva pelo menos 3 caracteres.</p>}
      <MensagemErro texto={erro} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onFechar} className="rounded-md px-3 py-1.5 text-cinza-medio">Cancelar</button>
        <button
          type="button"
          disabled={pendente || !valido}
          onClick={() => enviar(itens.map((m) => ({ movimentoId: m.id, acao: "ignorar", motivo: motivo.trim() })), `${itens.length} movimento(s) ignorado(s).`)}
          className="rounded-md bg-vermelho px-3 py-1.5 font-bold text-branco disabled:opacity-50"
        >
          {pendente ? "Gravando..." : `Ignorar ${itens.length}`}
        </button>
      </div>
    </div>
  );
}
