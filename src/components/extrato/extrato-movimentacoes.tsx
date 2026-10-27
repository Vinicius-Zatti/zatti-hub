"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { DicaVirarCelular } from "@/components/dica-virar-celular";
import { DicaCalculo } from "@/components/dica-calculo";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { exportarExtratoCsvAction } from "@/app/(app)/estoque/contagem/movimentacoes/actions";
import { formatarDataBr, hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { formatarQuantidade } from "@/lib/unidades";
import { baixarArquivo } from "@/lib/baixar-arquivo";
import { mensagemFalhaChamada } from "@/lib/erro-chamada";
import {
  DICA_EXCLUSOES_EXTRATO,
  DICA_SALDO,
  ROTULO_SITUACAO_SALDO,
  ROTULO_TIPO,
  TAMANHO_PAGINA_EXTRATO,
  TIPOS_FILTRO,
  rotuloMotivoPerda,
  situacaoLinha,
  textoInicioExtrato,
  totalPaginas,
  type FiltroExtrato,
  type LinhaExtrato,
  type SaldoSku,
} from "@/lib/extrato";

function moeda(v: number | null): string {
  return v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function paramsDoFiltro(f: FiltroExtrato, pagina?: number): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.de) p.de = f.de;
  if (f.ate) p.ate = f.ate;
  if (f.tipo) p.tipo = f.tipo;
  if (f.sku) p.sku = f.sku;
  if (f.incluirCancelados) p.cancelados = "1";
  if (pagina && pagina > 1) p.pagina = String(pagina);
  return p;
}

/** Explica, no "i" da célula, por que o saldo ficou sem número. */
function dicaSemSaldo(s: SaldoSku): string | null {
  if (s.situacao === "sem_historico_completo") {
    return `${textoInicioExtrato(s.inicioExtrato)} A última contagem completa é anterior a isso, então ` +
      "faltam compras e o saldo não seria confiável. Aparece com a primeira contagem completa a partir dessa data.";
  }
  if (s.situacao === "unidade_divergente") {
    return `A contagem está em ${s.unidadePosicao ?? "?"} e o cadastro ou algum lançamento está em outra ` +
      "unidade. Somar unidades diferentes daria um número errado.";
  }
  return null;
}

function CelulaSaldo({ saldo: s }: { saldo: SaldoSku }) {
  if (s.situacao === "calculado" && s.saldo !== null) {
    return <>{`${formatarQuantidade(s.saldo, s.unidadeBase)} ${s.unidadeBase}`}</>;
  }
  const dica = dicaSemSaldo(s);
  return (
    <span className="inline-flex items-center justify-end gap-1 font-normal text-cinza-medio">
      {s.situacao === "calculado" ? ROTULO_SITUACAO_SALDO.sem_posicao : ROTULO_SITUACAO_SALDO[s.situacao]}
      {dica && <DicaCalculo rotulo="Por que não tem saldo" texto={dica} />}
    </span>
  );
}

function detalheLinha(l: LinhaExtrato): string {
  if (l.tipo === "compra") return l.fornecedor ? `Recebimento · ${l.fornecedor}` : "Recebimento";
  if (l.tipo === "perda") return [rotuloMotivoPerda(l.motivo), l.observacao].filter(Boolean).join(" · ");
  if (l.natureza === "posicao") return "Contagem completa (abertura do dia)";
  return l.observacao ?? "";
}

export function ExtratoMovimentacoes({
  filtro,
  linhas,
  total,
  saldos,
}: {
  filtro: FiltroExtrato;
  linhas: LinhaExtrato[];
  total: number;
  saldos: SaldoSku[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [de, setDe] = useState(filtro.de ?? "");
  const [ate, setAte] = useState(filtro.ate ?? "");
  const [tipo, setTipo] = useState(filtro.tipo ?? "");
  const [sku, setSku] = useState(filtro.sku ?? "");
  const [cancelados, setCancelados] = useState(filtro.incluirCancelados);
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState("");

  const paginas = totalPaginas(total);
  const opcoesSku = saldos.map((s) => ({ id: s.sku, label: `${s.sku} · ${s.nome}` }));

  function aplicar() {
    const p = new URLSearchParams();
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    if (tipo) p.set("tipo", tipo);
    if (sku) p.set("sku", sku);
    if (cancelados) p.set("cancelados", "1");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function hrefPagina(n: number): string {
    const qs = new URLSearchParams(paramsDoFiltro(filtro, n)).toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  async function baixarCsv() {
    setBaixando(true);
    setAviso("");
    try {
      const r = await exportarExtratoCsvAction(paramsDoFiltro(filtro));
      if ("erro" in r) {
        setAviso(r.erro);
        return;
      }
      baixarArquivo(new Blob([r.csv], { type: "text/csv;charset=utf-8" }), `extrato-estoque-${hojeIsoBrasil()}.csv`);
    } catch (erro) {
      setAviso(mensagemFalhaChamada(erro, "Não foi possível gerar o CSV do extrato."));
    } finally {
      setBaixando(false);
    }
  }

  const campo =
    "rounded-md border border-cinza-claro bg-branco px-3 py-1.5 text-sm text-cinza focus:border-ambar focus:outline-none";

  return (
    // `data-tabela-larga`: com o celular deitado o shell solta cabeçalho e barra inferior.
    <div className="flex flex-col gap-5 pb-10" data-tabela-larga>
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-cinza-claro bg-branco p-3.5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
            <option value="">Todos</option>
            {TIPOS_FILTRO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-cinza-medio">
          SKU
          <SeletorComBusca value={sku} opcoes={opcoesSku} onChange={setSku} vazioLabel="Todos os SKUs" />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-cinza-medio">
          <input type="checkbox" checked={cancelados} onChange={(e) => setCancelados(e.target.checked)} />
          Mostrar cancelados
        </label>
        <button
          type="button"
          onClick={aplicar}
          className="rounded-md bg-ambar px-3 py-1.5 text-xs font-bold text-azul-noite hover:bg-[#b07720]"
        >
          Filtrar extrato
        </button>
        <button
          type="button"
          onClick={baixarCsv}
          disabled={baixando}
          className="rounded-md border border-azul-noite px-3 py-1.5 text-xs font-bold text-azul-noite hover:bg-off-white disabled:opacity-40"
        >
          {baixando ? "Gerando..." : "Baixar CSV completo"}
        </button>
      </div>
      {aviso && <p className="text-xs text-vermelho">{aviso}</p>}
      <DicaVirarCelular />

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-azul-noite">
          Lançamentos e posições ({total.toLocaleString("pt-BR")})
        </h2>
        {linhas.length === 0 ? (
          <div className="rounded-lg border border-cinza-claro bg-branco p-6 text-center text-cinza-medio">
            Nada no extrato com esses filtros. As compras entram quando um pedido é marcado como recebido
            em Pedidos Feitos; as perdas, pela aba Perdas.
          </div>
        ) : (
          <TabelaRolavel ariaLabel="Extrato do estoque">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="96px">Data</Th>
                  <Th>Tipo</Th>
                  <Th>Produto</Th>
                  <Th align="right">Quantidade</Th>
                  <Th align="right">Custo unitário</Th>
                  <Th align="right">
                    <span className="inline-flex items-center gap-1">
                      Valor
                      <DicaCalculo
                        rotulo="Como o valor é calculado"
                        texto="Valor = quantidade × custo unitário. Compra: preço do pedido recebido. Perda: último preço pago do item até a data. Posição: soma dos totais da contagem. Sem custo conhecido, fica em branco (nunca R$ 0)."
                      />
                    </span>
                  </Th>
                  <Th>Detalhe</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const cancelado = l.canceladoEm !== null;
                  const qtd = l.natureza === "posicao" ? l.quantidade : (l.quantidadeSinal ?? l.quantidade);
                  return (
                    <tr
                      key={l.linhaId}
                      className={`border-t border-cinza-claro ${l.natureza === "posicao" ? "bg-off-white" : ""} ${
                        cancelado ? "text-cinza-medio line-through" : ""
                      }`}
                    >
                      <td className="px-3 py-2 tabular-nums">{formatarDataBr(l.data)}</td>
                      <td className="px-3 py-2 font-medium">{ROTULO_TIPO[l.tipo]}</td>
                      <td className="max-w-[260px] truncate px-3 py-2" title={`${l.sku} · ${l.nome}`}>
                        <span className="font-mono text-xs text-cinza-medio">{l.sku}</span> {l.nome}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.natureza === "movimento" && qtd > 0 ? "+" : ""}
                        {formatarQuantidade(qtd, l.unidadeBase)} {l.unidadeBase}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{moeda(l.custoUnitario)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{moeda(l.valor)}</td>
                      <td className="max-w-[260px] truncate px-3 py-2" title={detalheLinha(l)}>
                        {detalheLinha(l)}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-3 py-2 text-xs"
                        title={cancelado ? `Cancelado: ${l.motivoCancelamento ?? ""}` : situacaoLinha(l)}
                      >
                        {cancelado ? `Cancelado: ${l.motivoCancelamento ?? ""}` : situacaoLinha(l)}
                      </td>
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
              Página {filtro.pagina} de {paginas} · {TAMANHO_PAGINA_EXTRATO} por página
            </span>
            <div className="flex gap-2">
              {filtro.pagina > 1 && (
                <Link href={hrefPagina(filtro.pagina - 1)} className="rounded-md border border-cinza-claro px-3 py-1">
                  Página anterior
                </Link>
              )}
              {filtro.pagina < paginas && (
                <Link href={hrefPagina(filtro.pagina + 1)} className="rounded-md border border-cinza-claro px-3 py-1">
                  Próxima página
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-azul-noite">
          Saldo por SKU
          <DicaCalculo rotulo="Como o saldo é calculado" texto={DICA_SALDO} />
          <DicaCalculo rotulo="O que fica fora das compras do extrato" texto={DICA_EXCLUSOES_EXTRATO} />
        </h2>
        {saldos.length > 0 && <p className="text-xs text-cinza-medio">{textoInicioExtrato(saldos[0].inicioExtrato)}</p>}
        <TabelaRolavel ariaLabel="Saldo por SKU">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th>Produto</Th>
                <Th>Última posição</Th>
                <Th align="right">Entradas</Th>
                <Th align="right">Saídas</Th>
                <Th align="right">Saldo</Th>
                <Th align="right">
                  <span className="inline-flex items-center gap-1">
                    Último preço pago
                    <DicaCalculo
                      rotulo="Como o último preço pago é escolhido"
                      texto="Preço da compra recebida mais recente (pela data do recebimento) que tinha preço. Se essa compra for cancelada, volta a valer a anterior. Sem compra com preço, fica em branco."
                    />
                  </span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={s.produtoId} className="border-t border-cinza-claro">
                  <td className="max-w-[260px] truncate px-3 py-2" title={`${s.sku} · ${s.nome}`}>
                    <span className="font-mono text-xs text-cinza-medio">{s.sku}</span> {s.nome}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.dataPosicao
                      ? `${formatarQuantidade(s.quantidadePosicao, s.unidadePosicao ?? s.unidadeBase)} ${s.unidadePosicao ?? s.unidadeBase} em ${formatarDataBr(s.dataPosicao)}`
                      : "Sem contagem completa"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.dataPosicao ? formatarQuantidade(s.entradas, s.unidadeBase) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.dataPosicao ? formatarQuantidade(s.saidas, s.unidadeBase) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-azul-noite">
                    <CelulaSaldo saldo={s} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.ultimoPrecoPago === null
                      ? "—"
                      : `${moeda(s.ultimoPrecoPago)}${s.ultimoPrecoPagoEm ? ` (${formatarDataBr(s.ultimoPrecoPagoEm)})` : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      </section>
    </div>
  );
}
