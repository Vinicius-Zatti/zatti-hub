"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { DicaCalculo } from "@/components/dica-calculo";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { removerCertificadoAction, salvarCertificadoAction } from "@/app/(app)/configuracoes/sefaz-actions";
import type { PainelSefaz } from "@/lib/sefaz/painel";

// Configurações > Unidade, só master (30/10/2026): certificado A1 de cada CNPJ da unidade para o
// Zatti Hub buscar sozinho as NF-e na SEFAZ uma vez por dia e pôr o XML na Caixa de Entrada.

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];
const cnpjFormatado = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export function CapturaNfe({ painel }: { painel: PainelSefaz }) {
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await salvarCertificadoAction(dados);
      setResultado(r);
      if (r.ok) setAberto(false);
    });
  }

  function remover(id: string, nome: string) {
    if (!window.confirm(`Parar a captura de NF-e de ${nome} e apagar o certificado guardado?`)) return;
    startTransition(async () => setResultado(await removerCertificadoAction(id)));
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-cinza-claro bg-branco p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-azul-noite">Captura de NF-e (SEFAZ)</h2>
          <p className="text-sm text-cinza-medio">
            Com o certificado A1 de cada CNPJ, o Zatti Hub busca sozinho, uma vez por dia, as NF-e emitidas contra a empresa e
            põe o XML na Caixa de Entrada. Ele só avisa a SEFAZ que viu a nota (Ciência da Operação); conferir e lançar continua
            com a equipe. Cupom fiscal (NFC-e) de mercado e atacarejo não vem por aqui. Só a equipe Zatti vê esta parte.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          disabled={!painel.ligada || isPending}
          title={painel.ligada ? "Guardar o certificado A1 de um CNPJ desta unidade (troca o antigo se for o mesmo CNPJ)" : "A chave do robô ainda não está no servidor"}
          className="rounded-md bg-ambar px-4 py-2 text-sm font-bold text-azul-noite hover:brightness-95 disabled:opacity-50"
        >
          Adicionar ou trocar certificado
        </button>
      </div>
      {!painel.ligada && <p className="text-sm font-semibold text-vermelho">A captura ainda não está ligada no servidor.</p>}
      {resultado && <p className={`text-sm font-semibold ${resultado.ok ? "text-verde" : "text-vermelho"}`}>{resultado.mensagem}</p>}

      {painel.certificados.length === 0 ? (
        <p className="text-sm text-cinza-medio">Nenhum certificado guardado nesta unidade.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-cinza-claro">
          {painel.certificados.map((c) => {
            const r = c.ultimaRodada;
            return (
              <li key={c.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-azul-noite" title={c.titular}>{c.titular}</p>
                  <p className="text-xs text-cinza-medio">
                    CNPJ {cnpjFormatado(c.cnpj)} · {c.uf} · válido até {formatarDataBr(c.validoAte)}
                    {c.diasParaVencer <= 30 && (
                      <span className="ml-1 font-bold text-vermelho">
                        {c.diasParaVencer < 0 ? "vencido" : `vence em ${c.diasParaVencer} dia(s)`}
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-cinza-medio">
                    {r
                      ? `Última busca ${formatarDataBr(r.dia)}: ${r.situacao === "ok" ? `${r.notasNovas} nota(s) nova(s)${r.filaZerou ? "" : ", fila continua amanhã"}` : `falhou (${r.erroCodigo ?? "erro"})`}`
                      : "Ainda não buscou."}
                    {" · "}
                    {c.notas.xmlSalvo} XML(s) na Caixa de Entrada, {c.notas.aguardando} aguardando a SEFAZ liberar
                    {c.notas.cancelada > 0 && `, ${c.notas.cancelada} cancelada(s) pelo fornecedor`}
                    {c.notas.erro > 0 && `, ${c.notas.erro} com erro`}
                    <DicaCalculo
                      rotulo="Contagem das notas"
                      texto="XMLs na Caixa de Entrada = notas deste CNPJ que o robô já entregou. Aguardando = notas que a SEFAZ só mostrou em resumo; depois da Ciência o XML completo chega numa das próximas buscas. Canceladas = notas que o fornecedor cancelou na SEFAZ (a entrada na Caixa ganha o aviso). Com erro = XML que a Caixa recusou ou que a SEFAZ não liberou depois de várias tentativas. Notas denegadas não entram na conta."
                    />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remover(c.id, c.titular)}
                  disabled={isPending}
                  title="Para a captura deste CNPJ e apaga o certificado guardado; as notas já recebidas ficam"
                  className="self-start rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio hover:border-vermelho hover:text-vermelho disabled:opacity-50 sm:self-center"
                >
                  Remover
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ModalFlutuante aberto={aberto} onFechar={() => !isPending && setAberto(false)}>
        <form onSubmit={enviar} className="flex flex-col gap-3">
          <h3 className="font-bold text-azul-noite">Certificado A1 da empresa</h3>
          <p className="text-xs text-cinza-medio">
            O arquivo e a senha ficam cifrados; nem esta tela consegue mostrá-los de novo. Mesmo CNPJ troca o certificado antigo
            sem perder o ponto em que a busca parou.
          </p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
            Arquivo (.pfx ou .p12)
            <input name="certificado" type="file" accept=".pfx,.p12,application/x-pkcs12" required className="text-sm font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
            Senha do certificado
            <input name="senha" type="password" autoComplete="off" required maxLength={200} className="rounded-md border border-cinza-claro px-3 py-2 font-normal" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
            UF da empresa
            <input
              name="uf"
              list="ufs-sefaz"
              required
              maxLength={2}
              defaultValue="MG"
              className="w-24 rounded-md border border-cinza-claro px-3 py-2 font-normal uppercase"
            />
            <datalist id="ufs-sefaz">
              {UFS.map((u) => <option key={u} value={u} />)}
            </datalist>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} disabled={isPending} className="rounded-md px-4 py-2 text-sm font-semibold text-cinza-medio">
              Cancelar
            </button>
            <button type="submit" disabled={isPending} title="Confere a senha, lê o CNPJ e a validade e guarda cifrado" className="rounded-md bg-ambar px-4 py-2 text-sm font-bold text-azul-noite disabled:opacity-50">
              {isPending ? "Conferindo..." : "Guardar certificado"}
            </button>
          </div>
        </form>
      </ModalFlutuante>
    </section>
  );
}
