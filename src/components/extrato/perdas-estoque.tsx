"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaCalculo } from "@/components/dica-calculo";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { CampoNumero } from "@/components/campo-numero";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import {
  cancelarMovimentacaoAction,
  registrarPerdaAction,
} from "@/app/(app)/estoque/contagem/perdas/actions";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { formatarQuantidade } from "@/lib/unidades";
import { mensagemFalhaChamada } from "@/lib/erro-chamada";
import {
  DICA_CUSTO_PERDA,
  MOTIVOS_PERDA,
  rotuloMotivoPerda,
  totalPaginas,
  type LinhaExtrato,
  type MotivoPerda,
  type ProdutoParaPerda,
} from "@/lib/extrato";

function moeda(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CAMPO =
  "rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none";

export function PerdasEstoque({
  linhas,
  total,
  pagina,
  produtos,
  hoje,
  podeCancelar,
}: {
  linhas: LinhaExtrato[];
  total: number;
  pagina: number;
  produtos: ProdutoParaPerda[];
  hoje: string;
  podeCancelar: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const paginas = totalPaginas(total);

  const [registrando, setRegistrando] = useState(false);
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState<number | null>(null);
  const [data, setData] = useState(hoje);
  const [motivo, setMotivo] = useState<MotivoPerda | "">("");
  const [observacao, setObservacao] = useState("");
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [cancelando, setCancelando] = useState<LinhaExtrato | null>(null);
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [erroCancelar, setErroCancelar] = useState("");
  const [aviso, setAviso] = useState("");

  const produtoEscolhido = produtos.find((p) => p.id === produtoId);
  const opcoes = produtos.map((p) => ({ id: p.id, label: `${p.sku} · ${p.nome} (${p.unidadeBase})` }));

  function abrirRegistro() {
    setProdutoId("");
    setQuantidade(null);
    setData(hoje);
    setMotivo("");
    setObservacao("");
    setErroForm("");
    setRegistrando(true);
  }

  async function registrar() {
    if (!produtoId) return setErroForm("Escolha o produto.");
    if (quantidade === null || quantidade <= 0) return setErroForm("Informe a quantidade perdida.");
    if (!data || data > hoje) return setErroForm("A data não pode ser no futuro.");
    if (!motivo) return setErroForm("Escolha o motivo.");
    if (motivo === "outro" && observacao.trim().length < 3) return setErroForm("Descreva o motivo.");
    setSalvando(true);
    setErroForm("");
    try {
      const r = await registrarPerdaAction({
        produtoId,
        quantidade,
        data,
        motivo,
        observacao: observacao.trim() || null,
      });
      if ("erro" in r) return setErroForm(r.erro);
      setRegistrando(false);
      setAviso("Perda registrada no extrato.");
      router.refresh();
    } catch (erro) {
      setErroForm(mensagemFalhaChamada(erro, "Não foi possível registrar a perda."));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelando?.movimentacaoId) return;
    if (motivoCancelamento.trim().length < 3) return setErroCancelar("Escreva o motivo do cancelamento.");
    setSalvando(true);
    setErroCancelar("");
    try {
      const r = await cancelarMovimentacaoAction({
        movimentacaoId: cancelando.movimentacaoId,
        motivo: motivoCancelamento.trim(),
      });
      if ("erro" in r) return setErroCancelar(r.erro);
      setCancelando(null);
      setAviso("Perda cancelada. Ela continua no histórico, riscada.");
      router.refresh();
    } catch (erro) {
      setErroCancelar(mensagemFalhaChamada(erro, "Não foi possível cancelar a perda."));
    } finally {
      setSalvando(false);
    }
  }

  function hrefPagina(n: number): string {
    return n > 1 ? `${pathname}?pagina=${n}` : pathname;
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={abrirRegistro}
          className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:bg-[#b07720]"
        >
          Registrar perda
        </button>
        {aviso && <span className="text-xs text-cinza-medio">{aviso}</span>}
      </div>

      {linhas.length === 0 ? (
        <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
          Nenhuma perda registrada ainda.
        </div>
      ) : (
        <TabelaRolavel ariaLabel="Perdas registradas">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th larguraFixa="96px">Data</Th>
                <Th>Produto</Th>
                <Th align="right">Quantidade</Th>
                <Th>Motivo</Th>
                <Th align="right">
                  <span className="inline-flex items-center gap-1">
                    Custo
                    <DicaCalculo rotulo="Como o custo da perda é calculado" texto={DICA_CUSTO_PERDA} />
                  </span>
                </Th>
                <Th>Situação</Th>
                {podeCancelar && <Th />}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const cancelada = l.canceladoEm !== null;
                const textoMotivo = [rotuloMotivoPerda(l.motivo), l.observacao].filter(Boolean).join(" · ");
                return (
                  <tr key={l.linhaId} className={`border-t border-cinza-claro ${cancelada ? "text-cinza-medio" : ""}`}>
                    <td className={`px-3 py-2 tabular-nums ${cancelada ? "line-through" : ""}`}>{formatarDataBr(l.data)}</td>
                    <td className={`max-w-[260px] truncate px-3 py-2 ${cancelada ? "line-through" : ""}`} title={`${l.sku} · ${l.nome}`}>
                      <span className="font-mono text-xs text-cinza-medio">{l.sku}</span> {l.nome}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${cancelada ? "line-through" : ""}`}>
                      {formatarQuantidade(l.quantidade, l.unidadeBase)} {l.unidadeBase}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2" title={textoMotivo}>
                      {textoMotivo}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.valor === null ? "Desconhecido" : moeda(l.valor)}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-xs" title={l.motivoCancelamento ?? ""}>
                      {cancelada ? `Cancelada: ${l.motivoCancelamento ?? ""}` : "Ativa"}
                    </td>
                    {podeCancelar && (
                      <td className="px-3 py-2 text-right">
                        {!cancelada && l.movimentacaoId && (
                          <button
                            type="button"
                            onClick={() => {
                              setMotivoCancelamento("");
                              setErroCancelar("");
                              setCancelando(l);
                            }}
                            className="rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-vermelho hover:bg-off-white"
                          >
                            Cancelar perda
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabelaRolavel>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between text-xs text-cinza-medio">
          <span>
            Página {pagina} de {paginas}
          </span>
          <div className="flex gap-2">
            {pagina > 1 && (
              <Link href={hrefPagina(pagina - 1)} className="rounded-md border border-cinza-claro px-3 py-1">
                Página anterior
              </Link>
            )}
            {pagina < paginas && (
              <Link href={hrefPagina(pagina + 1)} className="rounded-md border border-cinza-claro px-3 py-1">
                Próxima página
              </Link>
            )}
          </div>
        </div>
      )}

      <ModalFlutuante aberto={registrando} onFechar={() => !salvando && setRegistrando(false)}>
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold text-azul-noite">Registrar perda</h2>
          <div className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Produto
            <SeletorComBusca value={produtoId} opcoes={opcoes} onChange={setProdutoId} placeholder="Buscar produto..." />
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Quantidade{produtoEscolhido ? ` (${produtoEscolhido.unidadeBase})` : ""}
              <CampoNumero value={quantidade} onChange={setQuantidade} decimais={3} className="w-32 py-1.5 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
              Data
              <input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} className={CAMPO} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoPerda | "")} className={CAMPO}>
              <option value="">Escolha o motivo</option>
              {MOTIVOS_PERDA.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            {motivo === "outro" ? "Descreva o motivo" : "Observação (opcional)"}
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              maxLength={500}
              className={CAMPO}
            />
          </label>
          <p className="text-xs text-cinza-medio">O custo é calculado pelo último preço pago do produto.</p>
          {erroForm && <p className="text-xs text-vermelho">{erroForm}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRegistrando(false)}
              disabled={salvando}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Fechar sem registrar
            </button>
            <button
              type="button"
              onClick={registrar}
              disabled={salvando}
              className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:bg-[#b07720] disabled:opacity-40"
            >
              {salvando ? "Registrando..." : "Registrar perda no extrato"}
            </button>
          </div>
        </div>
      </ModalFlutuante>

      <ModalFlutuante aberto={cancelando !== null} onFechar={() => !salvando && setCancelando(null)}>
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-bold text-azul-noite">Cancelar perda</h2>
          {cancelando && (
            <p className="text-sm text-cinza">
              {cancelando.sku} · {cancelando.nome}: {formatarQuantidade(cancelando.quantidade, cancelando.unidadeBase)}{" "}
              {cancelando.unidadeBase} em {formatarDataBr(cancelando.data)}. A perda continua no histórico, riscada, e
              deixa de contar no saldo.
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            Motivo do cancelamento
            <textarea
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              rows={2}
              maxLength={500}
              className={CAMPO}
            />
          </label>
          {erroCancelar && <p className="text-xs text-vermelho">{erroCancelar}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCancelando(null)}
              disabled={salvando}
              className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
            >
              Manter a perda
            </button>
            <button
              type="button"
              onClick={confirmarCancelamento}
              disabled={salvando}
              className="rounded-md bg-vermelho px-3 py-1.5 text-xs font-bold text-branco disabled:opacity-40"
            >
              {salvando ? "Cancelando..." : "Cancelar esta perda"}
            </button>
          </div>
        </div>
      </ModalFlutuante>
    </div>
  );
}
