"use client";

import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  criarContraparteAction,
  criarDocumentoAction,
  listarContrapartesAction,
} from "@/app/(app)/financeiro-gerencial/lancamentos/documentos-actions";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { listarContasComCaminho } from "@/lib/financeiro-gerencial/categorias";
import { hojeIsoBrasil, somarMesesClampado } from "@/lib/financeiro-gerencial/datas";
import { dividirEmVencimentos, paraCentavos } from "@/lib/financeiro-gerencial/rateio";
import type { Contraparte } from "@/lib/banco/financeiro-documentos";
import type { CategoriaFinanceira, ContaFinanceira, TipoLancamento } from "@/lib/financeiro-gerencial/tipos";

/** Valores iniciais em reais (a Caixa de Entrada preenche com o que a IA leu da nota). */
export type ValoresIniciaisDocumento = {
  tipo?: TipoLancamento;
  contraparteId?: string | null;
  numero?: string;
  descricao?: string;
  dataEmissao?: string | null;
  dataCompetencia?: string;
  contaFinanceiraId?: string | null;
  observacao?: string;
  linhas?: { categoriaId: string; descricao: string; valor: number | null }[];
  vencimentos?: { dataPrevista: string; valor: number | null }[];
};

type LinhaForm = { categoriaId: string; descricao: string; valor: number | null };
type VencimentoForm = { dataPrevista: string; valor: number | null };

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function novaChave(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Plano de Contas permitido por tipo: despesa nunca usa conta de receita, receita só
 * `papel_dre = receita`, e as 3 contas de provisão ficam fora (já excluídas pelas lançáveis). */
export function opcoesPlanoDeContas(categorias: CategoriaFinanceira[], tipo: TipoLancamento) {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  return listarContasComCaminho(categorias)
    .filter((c) => {
      const papel = porId.get(c.id)?.papelDre ?? null;
      return tipo === "receita" ? papel === "receita" : papel !== "receita";
    })
    .map((c) => ({ id: c.id, label: c.rotulo }));
}

/** Gera N vencimentos mensais a partir da primeira data, dividindo o total ao centavo. */
function gerarVencimentos(totalCentavos: number, quantidade: number, primeiraData: string): VencimentoForm[] {
  const n = Math.max(1, Math.min(360, Math.floor(quantidade) || 1));
  const valores = totalCentavos > 0 ? dividirEmVencimentos(totalCentavos, n) : Array<number>(n).fill(0);
  return valores.map((c, i) => ({ dataPrevista: somarMesesClampado(primeiraData, i), valor: c > 0 ? c / 100 : null }));
}

/** Modal "Nota com vários Plano de Contas" (Financeiro V2). Reaproveitável: recebe valores
 * iniciais e devolve o id do documento salvo em `onSalvo`. */
export function DocumentoModal({
  aberto,
  onFechar,
  onSalvo,
  categorias,
  contas,
  valoresIniciais,
  tipoFixo = false,
}: {
  aberto: boolean;
  onFechar: () => void;
  onSalvo?: (documentoId: string) => void;
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  valoresIniciais?: ValoresIniciaisDocumento;
  /** Esconde a troca de tipo (ex.: aberto da tela de Despesas). */
  tipoFixo?: boolean;
}) {
  return (
    <ModalFlutuante aberto={aberto} onFechar={onFechar} larga>
      {aberto && (
        <FormularioDocumento
          categorias={categorias}
          contas={contas}
          valoresIniciais={valoresIniciais}
          tipoFixo={tipoFixo}
          onCancelar={onFechar}
          onSalvo={(id) => {
            onSalvo?.(id);
            onFechar();
          }}
        />
      )}
    </ModalFlutuante>
  );
}

const CAMPO = "w-full rounded-md border border-cinza-claro px-3 py-2 text-sm text-cinza";
const ROTULO = "flex flex-col gap-1 text-sm font-semibold text-cinza-medio";

function FormularioDocumento({
  categorias,
  contas,
  valoresIniciais: vi = {},
  tipoFixo,
  onCancelar,
  onSalvo,
}: {
  categorias: CategoriaFinanceira[];
  contas: ContaFinanceira[];
  valoresIniciais?: ValoresIniciaisDocumento;
  tipoFixo: boolean;
  onCancelar: () => void;
  onSalvo: (documentoId: string) => void;
}) {
  const router = useRouter();
  const hoje = hojeIsoBrasil();
  // Gerada uma vez ao abrir: clicar duas vezes em Salvar não duplica a nota.
  const [chave] = useState(novaChave);
  const [tipo, setTipo] = useState<TipoLancamento>(vi.tipo ?? "despesa");
  const [contraparteId, setContraparteId] = useState(vi.contraparteId ?? "");
  const [numero, setNumero] = useState(vi.numero ?? "");
  const [descricao, setDescricao] = useState(vi.descricao ?? "");
  const [dataEmissao, setDataEmissao] = useState(vi.dataEmissao ?? "");
  const [dataCompetencia, setDataCompetencia] = useState(vi.dataCompetencia ?? hoje);
  const [contaFinanceiraId, setContaFinanceiraId] = useState(vi.contaFinanceiraId ?? "");
  const [observacao, setObservacao] = useState(vi.observacao ?? "");
  const [linhas, setLinhas] = useState<LinhaForm[]>(
    vi.linhas && vi.linhas.length > 0 ? vi.linhas : [{ categoriaId: "", descricao: "", valor: null }],
  );
  const [quantidade, setQuantidade] = useState(Math.max(1, vi.vencimentos?.length ?? 1));
  const [primeiraData, setPrimeiraData] = useState(vi.vencimentos?.[0]?.dataPrevista ?? hoje);
  // null = vencimentos gerados automaticamente pelo total; lista = editados à mão.
  const [vencimentosEditados, setVencimentosEditados] = useState<VencimentoForm[] | null>(
    vi.vencimentos && vi.vencimentos.length > 0 ? vi.vencimentos : null,
  );
  const [contrapartes, setContrapartes] = useState<Contraparte[]>([]);
  const [criandoContraparte, setCriandoContraparte] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDocumento, setNovoDocumento] = useState("");
  const [erroContraparte, setErroContraparte] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [salvandoContraparte, startContraparte] = useTransition();

  useEffect(() => {
    let ativo = true;
    listarContrapartesAction()
      .then((lista) => {
        if (ativo) setContrapartes(lista);
      })
      .catch(() => {
        if (ativo) setErroContraparte("Não foi possível carregar fornecedores e clientes.");
      });
    return () => {
      ativo = false;
    };
  }, []);

  const rotuloContraparte = tipo === "receita" ? "Cliente" : "Fornecedor";
  const opcoesContraparte = useMemo(
    () =>
      contrapartes
        .filter((c) => c.tipo === "ambos" || c.tipo === (tipo === "receita" ? "cliente" : "fornecedor") || c.id === contraparteId)
        .map((c) => ({ id: c.id, label: c.documento ? `${c.nome} (${c.documento})` : c.nome })),
    [contrapartes, tipo, contraparteId],
  );
  const opcoesCategoria = useMemo(() => opcoesPlanoDeContas(categorias, tipo), [categorias, tipo]);
  const opcoesConta = useMemo(() => contas.map((c) => ({ id: c.id, label: c.nome })), [contas]);

  const totalLinhasC = linhas.reduce((a, l) => a + paraCentavos(l.valor ?? 0), 0);
  const vencimentos = vencimentosEditados ?? gerarVencimentos(totalLinhasC, quantidade, primeiraData);
  const totalVencC = vencimentos.reduce((a, v) => a + paraCentavos(v.valor ?? 0), 0);
  const diferencaC = totalLinhasC - totalVencC;

  function trocarTipo(novo: TipoLancamento) {
    setTipo(novo);
    // Plano de Contas de despesa não vale em receita (e vice-versa): limpa o que não serve.
    const validos = new Set(opcoesPlanoDeContas(categorias, novo).map((o) => o.id));
    setLinhas((atual) => atual.map((l) => (validos.has(l.categoriaId) ? l : { ...l, categoriaId: "" })));
  }

  function atualizarLinha(i: number, patch: Partial<LinhaForm>) {
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function atualizarVencimento(i: number, patch: Partial<VencimentoForm>) {
    setVencimentosEditados(vencimentos.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  function salvarContraparte() {
    setErroContraparte(null);
    startContraparte(async () => {
      const r = await criarContraparteAction({
        nome: novoNome,
        documento: novoDocumento,
        tipo: tipo === "receita" ? "cliente" : "fornecedor",
      });
      if (!r.ok) {
        setErroContraparte(r.mensagem);
        return;
      }
      setContrapartes((atual) => (atual.some((c) => c.id === r.contraparte.id) ? atual : [...atual, r.contraparte]));
      setContraparteId(r.contraparte.id);
      setCriandoContraparte(false);
      setNovoNome("");
      setNovoDocumento("");
    });
  }

  const linhasValidas = linhas.every((l) => l.categoriaId && paraCentavos(l.valor ?? 0) > 0);
  const vencimentosValidos = vencimentos.every((v) => v.dataPrevista && paraCentavos(v.valor ?? 0) > 0);
  const podeSalvar =
    !isPending && descricao.trim() !== "" && dataCompetencia !== "" && linhasValidas && vencimentosValidos && totalLinhasC > 0 && diferencaC === 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!podeSalvar) return;
    setErro(null);
    startTransition(async () => {
      const r = await criarDocumentoAction({
        chave,
        tipo,
        contraparteId: contraparteId || null,
        numero,
        descricao,
        dataEmissao: dataEmissao || null,
        dataCompetencia,
        contaFinanceiraId: contaFinanceiraId || null,
        observacao,
        linhas: linhas.map((l) => ({ categoriaId: l.categoriaId, descricao: l.descricao, valorCentavos: paraCentavos(l.valor ?? 0) })),
        vencimentos: vencimentos.map((v) => ({ dataPrevista: v.dataPrevista, valorCentavos: paraCentavos(v.valor ?? 0) })),
      });
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      router.refresh();
      onSalvo(r.documentoId);
    });
  }

  const rotuloData = tipo === "receita" ? "Data de Recebimento" : "Data de Pagamento";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-bold text-azul-noite">Nota com vários Plano de Contas</h2>

      {!tipoFixo && (
        <div className="flex gap-2" role="group" aria-label="Tipo">
          {(["despesa", "receita"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => trocarTipo(t)}
              className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-semibold ${
                tipo === t ? "border-azul-noite bg-azul-noite text-branco" : "border-cinza-claro text-cinza-medio"
              }`}
            >
              {t === "despesa" ? "Despesa" : "Receita"}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={ROTULO}>
          <div className="flex items-center justify-between">
            <span>{rotuloContraparte}</span>
            {!criandoContraparte && (
              <button type="button" onClick={() => setCriandoContraparte(true)} className="text-xs font-semibold text-azul-petroleo">
                + Novo {rotuloContraparte.toLowerCase()}
              </button>
            )}
          </div>
          <SeletorComBusca
            value={contraparteId}
            opcoes={opcoesContraparte}
            onChange={setContraparteId}
            placeholder="Selecionar..."
            vazioLabel={`Sem ${rotuloContraparte.toLowerCase()}`}
          />
        </div>
        <label className={ROTULO}>
          Número da nota
          <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} className={CAMPO} />
        </label>
      </div>

      {criandoContraparte && (
        <div className="flex flex-col gap-2 rounded-lg border border-ambar/60 bg-ambar/5 p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-cinza-medio">Novo {rotuloContraparte.toLowerCase()}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Nome
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={160} className={CAMPO} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              CPF/CNPJ (opcional)
              <input value={novoDocumento} onChange={(e) => setNovoDocumento(e.target.value)} maxLength={18} inputMode="numeric" className={CAMPO} />
            </label>
          </div>
          {erroContraparte && <p className="text-xs text-vermelho">{erroContraparte}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={salvarContraparte}
              disabled={salvandoContraparte || novoNome.trim() === ""}
              className="rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco disabled:opacity-50"
            >
              {salvandoContraparte ? "Salvando..." : `Salvar ${rotuloContraparte.toLowerCase()}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setCriandoContraparte(false);
                setErroContraparte(null);
              }}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <label className={ROTULO}>
        Descrição
        <input required value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} className={CAMPO} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={ROTULO}>
          Data de Emissão
          <input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className={CAMPO} />
        </label>
        <label className={ROTULO}>
          Data de Competência
          <input type="date" required value={dataCompetencia} onChange={(e) => setDataCompetencia(e.target.value)} className={CAMPO} />
        </label>
        <label className={ROTULO}>
          Conta financeira
          <SeletorComBusca
            value={contaFinanceiraId}
            opcoes={opcoesConta}
            onChange={setContaFinanceiraId}
            placeholder="Nenhuma (decidir na baixa)"
            vazioLabel="Nenhuma (decidir na baixa)"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Plano de Contas da nota</div>
        {linhas.map((linha, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Plano de Contas
              <SeletorComBusca
                value={linha.categoriaId}
                opcoes={opcoesCategoria}
                onChange={(v) => atualizarLinha(i, { categoriaId: v })}
                placeholder="Selecionar conta..."
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Descrição (opcional)
              <input
                value={linha.descricao}
                onChange={(e) => atualizarLinha(i, { descricao: e.target.value })}
                maxLength={200}
                className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Valor
              <CampoNumero value={linha.valor} onChange={(v) => atualizarLinha(i, { valor: v })} className="w-full" />
            </label>
            <button
              type="button"
              onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}
              disabled={linhas.length === 1}
              className="mb-1.5 text-xs font-semibold text-vermelho disabled:opacity-30"
            >
              Remover
            </button>
          </div>
        ))}
        {linhas.length < 50 && (
          <button
            type="button"
            onClick={() => setLinhas((atual) => [...atual, { categoriaId: "", descricao: "", valor: null }])}
            className="self-start text-xs font-semibold text-azul-petroleo"
          >
            + Adicionar Plano de Contas
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-cinza-claro p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-cinza-medio">Vencimentos</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex w-28 flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Parcelas
            <input
              type="number"
              min={1}
              max={360}
              value={quantidade}
              onChange={(e) => {
                setQuantidade(Math.max(1, Math.min(360, Number(e.target.value) || 1)));
                setVencimentosEditados(null);
              }}
              className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Primeira {rotuloData}
            <input
              type="date"
              value={primeiraData}
              onChange={(e) => {
                setPrimeiraData(e.target.value);
                setVencimentosEditados(null);
              }}
              className="rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
            />
          </label>
          <span className="pb-2 text-xs text-cinza-medio">Intervalo mensal</span>
          {vencimentosEditados && (
            <button
              type="button"
              onClick={() => setVencimentosEditados(null)}
              className="pb-2 text-xs font-semibold text-azul-petroleo"
            >
              Recalcular pelo total
            </button>
          )}
        </div>
        <div className="flex max-h-64 flex-col gap-2 overflow-auto">
          {vencimentos.map((v, i) => (
            <div key={i} className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                {vencimentos.length > 1 ? `${rotuloData} ${i + 1}/${vencimentos.length}` : rotuloData}
                <input
                  type="date"
                  required
                  value={v.dataPrevista}
                  onChange={(e) => atualizarVencimento(i, { dataPrevista: e.target.value })}
                  className="w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
                Valor
                <CampoNumero value={v.valor} onChange={(valor) => atualizarVencimento(i, { valor })} className="w-full" />
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-branco p-3 text-sm">
        <div className="flex flex-col">
          <span className="flex items-center gap-1 text-xs text-cinza-medio">
            Total do Plano de Contas
            <DicaCalculo rotulo="Total do Plano de Contas" texto="Soma dos valores de todas as linhas de Plano de Contas da nota." />
          </span>
          <span className="font-semibold text-azul-noite">R$ {formatarMoeda(totalLinhasC / 100)}</span>
        </div>
        <div className="flex flex-col">
          <span className="flex items-center gap-1 text-xs text-cinza-medio">
            Total dos vencimentos
            <DicaCalculo
              rotulo="Total dos vencimentos"
              texto="Soma dos valores de todos os vencimentos. Ao gerar, o total é dividido igualmente e os centavos que sobram vão para as primeiras parcelas."
            />
          </span>
          <span className="font-semibold text-azul-noite">R$ {formatarMoeda(totalVencC / 100)}</span>
        </div>
        <div className="flex flex-col">
          <span className="flex items-center gap-1 text-xs text-cinza-medio">
            Diferença
            <DicaCalculo rotulo="Diferença" texto="Total do Plano de Contas menos total dos vencimentos. Só dá para salvar com diferença zero." />
          </span>
          <span className={`font-semibold ${diferencaC === 0 ? "text-verde" : "text-vermelho"}`}>R$ {formatarMoeda(diferencaC / 100)}</span>
        </div>
      </div>

      <label className={ROTULO}>
        Observação
        <input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={2000} className={CAMPO} />
      </label>

      {erro && <p className="text-sm text-vermelho">{erro}</p>}
      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={!podeSalvar}
          className="flex-1 rounded-lg bg-azul-noite px-4 py-2.5 text-sm font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar nota"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isPending}
          className="flex-1 rounded-lg border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-cinza-medio"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
