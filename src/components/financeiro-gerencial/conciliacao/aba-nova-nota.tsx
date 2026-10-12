"use client";

import { useEffect, useState, useTransition } from "react";
import { criarContraparteAction, listarContrapartesAction } from "@/app/(app)/financeiro-gerencial/lancamentos/documentos-actions";
import { DicaCalculo } from "@/components/dica-calculo";
import { CampoNumero } from "@/components/campo-numero";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { faltaNaNota, paraCentavos, umUnicoPlano } from "@/lib/conciliacao/decisao-tela";
import type { Contraparte } from "@/lib/banco/financeiro-documentos";
import type { ItemFila } from "@/lib/banco/conciliacao";
import { BotoesConfirmar, brl, brlCentavos, MensagemErro, useEnvioDecisao, type ContextoDecisao } from "./comum";

type Linha = { chave: number; categoriaId: string; descricao: string; valor: number | null };

const EXPLICACAO_FALTA = "Falta = valor do extrato - soma dos valores das linhas. A nota só grava quando falta zero.";

/** Aba "Nova nota": cria a nota já paga a partir do extrato. */
export function AbaNovaNota({ movimento, contexto, aoConcluir }: { movimento: ItemFila; contexto: ContextoDecisao; aoConcluir: (t: string) => void }) {
  const entrada = movimento.direcao === "entrada";
  const planos = entrada ? contexto.planoReceita : contexto.planoDespesa;
  const sugerida = movimento.sugestao?.categoriaId && planos.some((p) => p.id === movimento.sugestao?.categoriaId) ? movimento.sugestao.categoriaId : "";
  const extrato = paraCentavos(movimento.valor);

  const [contrapartes, setContrapartes] = useState<Contraparte[] | null>(null);
  const [contraparteId, setContraparteId] = useState("");
  const [numero, setNumero] = useState("");
  const [descricao, setDescricao] = useState(movimento.descricaoOriginal.slice(0, 200));
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: 1, categoriaId: sugerida, descricao: "", valor: movimento.valor }]);
  const [novaAberta, setNovaAberta] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDoc, setNovoDoc] = useState("");
  const [erroNova, setErroNova] = useState<string | null>(null);
  const [criando, iniciarCriacao] = useTransition();
  const { enviar, pendente, erro } = useEnvioDecisao(aoConcluir);

  useEffect(() => {
    let ativo = true;
    listarContrapartesAction()
      .then((l) => ativo && setContrapartes(l))
      .catch(() => ativo && setContrapartes([]));
    return () => {
      ativo = false;
    };
  }, []);

  const tipoAceito = entrada ? "cliente" : "fornecedor";
  const opcoesContraparte = (contrapartes ?? [])
    .filter((c) => c.tipo === tipoAceito || c.tipo === "ambos")
    .map((c) => ({ id: c.id, label: c.documento ? `${c.nome} (${c.documento})` : c.nome }));

  const falta = faltaNaNota(extrato, linhas.map((l) => paraCentavos(l.valor)));
  const linhasValidas = linhas.every((l) => l.categoriaId && paraCentavos(l.valor) > 0);
  const podeConfirmar = linhasValidas && falta === 0 && descricao.trim().length > 0;
  const podeAprender = linhas.length === 1 && umUnicoPlano(linhas.map((l) => l.categoriaId));

  function mudarLinha(chave: number, parcial: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...parcial } : l)));
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, { chave: Math.max(...atual.map((l) => l.chave)) + 1, categoriaId: "", descricao: "", valor: falta > 0 ? falta / 100 : null }]);
  }

  function criarContraparte() {
    setErroNova(null);
    iniciarCriacao(async () => {
      const r = await criarContraparteAction({ nome: novoNome.trim(), documento: novoDoc.trim(), tipo: tipoAceito });
      if (!r.ok) {
        setErroNova(r.mensagem);
        return;
      }
      setContrapartes((atual) => [...(atual ?? []), r.contraparte]);
      setContraparteId(r.contraparte.id);
      setNovaAberta(false);
      setNovoNome("");
      setNovoDoc("");
    });
  }

  function confirmar(aprender: boolean) {
    enviar(
      [
        {
          movimentoId: movimento.id,
          acao: "criar_documento",
          contraparteId: contraparteId || null,
          numero: numero.trim(),
          descricao: descricao.trim(),
          linhas: linhas.map((l) => ({ categoriaId: l.categoriaId, descricao: l.descricao.trim(), valorCentavos: paraCentavos(l.valor) })),
          aprender,
        },
      ],
      `Nota ${entrada ? "de receita" : "de despesa"} criada e conciliada com ${brl(movimento.valor)}.`,
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-xs text-cinza-medio">
        Cria uma {entrada ? "receita" : "despesa"} já {entrada ? "recebida" : "paga"} na data do extrato, nesta conta financeira.
      </p>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{entrada ? "Cliente" : "Fornecedor"} (opcional)</span>
        <SeletorComBusca
          value={contraparteId}
          opcoes={opcoesContraparte}
          onChange={setContraparteId}
          vazioLabel="Sem fornecedor ou cliente"
          placeholder={contrapartes === null ? "Carregando..." : "Escolha"}
        />
      </label>
      {!novaAberta ? (
        <button type="button" onClick={() => setNovaAberta(true)} className="self-start text-xs font-semibold text-azul-petroleo underline">
          + Cadastrar {entrada ? "cliente" : "fornecedor"} novo
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-cinza-claro p-2">
          <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome" maxLength={160} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
          <input value={novoDoc} onChange={(e) => setNovoDoc(e.target.value)} placeholder="CPF ou CNPJ (opcional)" maxLength={18} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
          <MensagemErro texto={erroNova} />
          <div className="flex justify-end gap-2 text-xs">
            <button type="button" onClick={() => setNovaAberta(false)} className="px-2 py-1 text-cinza-medio">Cancelar</button>
            <button type="button" disabled={criando || novoNome.trim().length === 0} onClick={criarContraparte} className="rounded-md bg-azul-petroleo px-2 py-1 font-semibold text-branco disabled:opacity-50">
              {criando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Número (opcional)</span>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="font-semibold">Descrição</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} className="rounded-md border border-cinza-claro bg-branco px-2 py-1.5" />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-semibold">Plano de Contas</span>
        {linhas.map((l, i) => (
          <div key={l.chave} className="flex flex-col gap-1 rounded-md border border-cinza-claro p-2">
            <SeletorComBusca value={l.categoriaId} opcoes={planos} onChange={(id) => mudarLinha(l.chave, { categoriaId: id })} placeholder="Escolha o Plano de Contas" />
            {i === 0 && sugerida && l.categoriaId === sugerida && <span className="text-xs text-cinza-medio">Sugerido pela classificação da linha</span>}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={l.descricao}
                onChange={(e) => mudarLinha(l.chave, { descricao: e.target.value })}
                maxLength={200}
                placeholder="Detalhe da linha (opcional)"
                className="min-w-0 flex-1 rounded-md border border-cinza-claro bg-branco px-2 py-1"
              />
              <CampoNumero value={l.valor} onChange={(v) => mudarLinha(l.chave, { valor: v })} className="w-28" />
              {linhas.length > 1 && (
                <button type="button" onClick={() => setLinhas((a) => a.filter((x) => x.chave !== l.chave))} className="text-xs text-vermelho underline">
                  Remover
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="button" onClick={adicionarLinha} disabled={linhas.length >= 50} className="self-start text-xs font-semibold text-azul-petroleo underline disabled:opacity-50">
          + Dividir em outro Plano de Contas
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-cinza-claro/40 p-2">
        <span>Extrato <strong>{brlCentavos(extrato)}</strong></span>
        <span>|</span>
        <span className={falta === 0 ? "text-verde" : "text-vermelho"}>
          {falta >= 0 ? "Falta" : "Passou"} <strong>{brlCentavos(Math.abs(falta))}</strong>
        </span>
        <DicaCalculo texto={EXPLICACAO_FALTA} rotulo="Falta" />
      </div>

      <MensagemErro texto={erro} />
      <BotoesConfirmar
        pendente={pendente}
        podeConfirmar={podeConfirmar}
        podeAprender={podeAprender}
        motivoSemAprender={linhas.length > 1 ? "Nota dividida em mais de um Plano de Contas não ensina regra." : undefined}
        aoConfirmar={confirmar}
      />
    </div>
  );
}
