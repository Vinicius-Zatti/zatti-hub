"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CampoBusca } from "@/components/campo-busca";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { normalizarBusca } from "@/lib/busca";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { conferirAction, desfazerAction, recusarAction } from "@/app/(app)/freelancers/actions";
import {
  formatarReais,
  formatarWhatsapp,
  horaBrasil,
  nomeDiferente,
  situacaoTitulo,
  valorSugerido,
  type Checkin,
} from "@/lib/freelancers/regras";

const ROTULO_ESTADO: Record<Checkin["estado"], { texto: string; classe: string }> = {
  pendente: { texto: "Aguardando conferência", classe: "bg-ambar/15 text-azul-noite" },
  conferido: { texto: "Conferido", classe: "bg-verde/15 text-verde" },
  recusado: { texto: "Recusado", classe: "bg-vermelho/10 text-vermelho" },
};

/** Busca por nome do cadastro, nome digitado, função ou WhatsApp. */
function casaBusca(c: Checkin, termo: string): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  const digitos = termo.replace(/\D/g, "");
  return (
    normalizarBusca(c.nome).includes(t) ||
    normalizarBusca(c.nomeDigitado ?? "").includes(t) ||
    normalizarBusca(c.funcao ?? "").includes(t) ||
    (digitos.length >= 3 && c.whatsapp.includes(digitos))
  );
}

/** Tabela de check-ins com conferência (Hoje e Histórico). */
export function TabelaCheckins({
  checkins,
  diariaPadrao,
  podeEditar,
  mostrarDia = false,
}: {
  checkins: Checkin[];
  diariaPadrao: number | null;
  podeEditar: boolean;
  mostrarDia?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<Checkin | null>(null);
  const visiveis = useMemo(() => checkins.filter((c) => casaBusca(c, busca)), [checkins, busca]);

  return (
    <div className="flex flex-col gap-3" data-tour="freela-lista">
      <CampoBusca valor={busca} onChange={setBusca} rotulo="Buscar freelancer por nome, função ou WhatsApp" placeholder="Buscar por nome, função ou WhatsApp" />
      {checkins.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum check-in {mostrarDia ? "neste período" : "hoje"}. Quem chega para trabalhar lê o QR Code da loja e aparece aqui na hora.
        </p>
      ) : (
        <TabelaRolavel ariaLabel="Check-ins dos freelancers">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                {mostrarDia && <Th larguraFixa="96px">Dia</Th>}
                <Th larguraFixa="64px">Entrada</Th>
                <Th fixo>Freelancer</Th>
                <Th>Situação</Th>
                <Th align="right">Diária</Th>
                <Th>Contas a Pagar</Th>
                <Th align="center">Ação</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const estado = ROTULO_ESTADO[c.estado];
                const diferente = nomeDiferente(c.nome, c.nomeDigitado);
                return (
                  <tr key={c.id} className="border-b border-cinza-claro align-top last:border-0">
                    {mostrarDia && <td className="px-3 py-2 whitespace-nowrap">{formatarDataBr(c.dia)}</td>}
                    <td className="px-3 py-2 whitespace-nowrap">{c.origem === "manual" ? "À mão" : horaBrasil(c.entradaEm)}</td>
                    <td className="max-w-[260px] px-3 py-2">
                      <p className="truncate font-semibold text-azul-noite" title={c.nome}>
                        {c.nome}
                      </p>
                      <p className="truncate text-xs text-cinza-medio">
                        {[c.funcao, formatarWhatsapp(c.whatsapp)].filter(Boolean).join(" · ")}
                      </p>
                      {c.situacaoFreelancer === "novo" && c.estado === "pendente" && (
                        <p className="mt-1 text-xs font-semibold text-ambar">Primeira vez: sem cadastro aprovado</p>
                      )}
                      {c.situacaoFreelancer === "inativo" && c.estado === "pendente" && (
                        <p className="mt-1 text-xs font-semibold text-vermelho">Cadastro marcado como não trabalha mais</p>
                      )}
                      {diferente && <p className="mt-1 text-xs font-semibold text-vermelho">Digitou outro nome: {c.nomeDigitado}</p>}
                      {c.aparelhoRepetido && <p className="mt-1 text-xs font-semibold text-vermelho">Mesmo celular de outro check-in hoje</p>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${estado.classe}`}>{estado.texto}</span>
                      {c.estado !== "pendente" && c.conferidoPorNome && <p className="mt-1 text-xs text-cinza-medio">por {c.conferidoPorNome}</p>}
                      {c.motivoRecusa && <p className="mt-1 text-xs text-cinza-medio">{c.motivoRecusa}</p>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{c.valor !== null ? formatarReais(c.valor) : "-"}</td>
                    <td className="max-w-[240px] px-3 py-2 text-xs text-cinza">{situacaoTitulo(c)}</td>
                    <td className="px-3 py-2 text-center">
                      {podeEditar ? (
                        <button
                          type="button"
                          onClick={() => setAberto(c)}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                            c.estado === "pendente" ? "bg-azul-noite text-branco" : "border border-cinza-claro text-azul-noite"
                          }`}
                        >
                          {c.estado === "pendente" ? "Conferir" : "Ver ou desfazer"}
                        </button>
                      ) : (
                        <span className="text-xs text-cinza-medio">Só ver</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={mostrarDia ? 7 : 6} className="px-3 py-4 text-center text-sm text-cinza-medio">
                    Ninguém com esse nome, função ou WhatsApp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
      {aberto && <ModalConferencia checkin={aberto} diariaPadrao={diariaPadrao} onFechar={() => setAberto(null)} />}
    </div>
  );
}

function ModalConferencia({ checkin: c, diariaPadrao, onFechar }: { checkin: Checkin; diariaPadrao: number | null; onFechar: () => void }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [valor, setValor] = useState<number | null>(valorSugerido(c.diariaCadastro, diariaPadrao));
  const [pago, setPago] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const diferente = nomeDiferente(c.nome, c.nomeDigitado);

  function executar(acao: () => Promise<{ ok: true } | { erro: string }>) {
    startTransition(async () => {
      setErro(null);
      const r = await acao();
      if ("erro" in r) {
        setErro(r.erro);
        router.refresh();
      } else {
        onFechar();
        router.refresh();
      }
    });
  }

  return (
    <ModalFlutuante aberto onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-cinza-medio">
            {formatarDataBr(c.dia)} · {c.origem === "manual" ? "lançado à mão" : `check-in às ${horaBrasil(c.entradaEm)}`}
          </p>
          <h2 className="font-display text-2xl font-bold text-azul-noite">{c.nome}</h2>
          <p className="text-sm text-cinza">{[c.funcao, formatarWhatsapp(c.whatsapp)].filter(Boolean).join(" · ")}</p>
        </div>

        {(c.situacaoFreelancer === "novo" || diferente || c.aparelhoRepetido) && c.estado === "pendente" && (
          <ul className="flex flex-col gap-1 rounded-md border border-ambar/40 bg-ambar/10 px-3 py-2 text-sm text-azul-noite">
            {c.situacaoFreelancer === "novo" && <li>Primeira vez desta pessoa. Ao confirmar, o cadastro fica aprovado para os próximos dias.</li>}
            {diferente && <li>No QR ela digitou outro nome: {c.nomeDigitado}. Confira se é a mesma pessoa do cadastro.</li>}
            {c.aparelhoRepetido && <li>O mesmo celular fez check-in de outra pessoa hoje. Confira se as duas estão mesmo trabalhando.</li>}
          </ul>
        )}

        {c.estado === "pendente" && !recusando && (
          <>
            <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
              Valor da diária (R$)
              <CampoNumero value={valor} onChange={setValor} className="max-w-[200px]" />
              <span className="text-xs font-normal text-cinza-medio">
                {c.diariaCadastro !== null
                  ? "Sugestão: a diária combinada no cadastro desta pessoa."
                  : diariaPadrao !== null
                    ? "Sugestão: a diária padrão da unidade (Configurar)."
                    : "Sem diária no cadastro nem padrão da unidade: digite o valor combinado."}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-azul-noite">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                O caixa já pagou esta diária
                <span className="block text-xs text-cinza-medio">O título entra no Contas a Pagar já quitado, saindo da conta do caixa. Sem marcar, fica em aberto com vencimento no dia trabalhado.</span>
              </span>
            </label>
            <button
              type="button"
              disabled={pendente || valor === null}
              onClick={() => executar(() => conferirAction(c.id, valor, pago))}
              className="rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco disabled:opacity-60"
            >
              {pendente
                ? "Conferindo..."
                : `Confirmar que trabalhou e lançar ${valor !== null ? formatarReais(valor) : "a diária"} no Contas a Pagar${pago ? " (já pago)" : ""}`}
            </button>
            <button type="button" onClick={() => setRecusando(true)} className="self-start text-sm font-semibold text-vermelho underline">
              Não trabalhou? Recusar este check-in
            </button>
          </>
        )}

        {c.estado === "pendente" && recusando && (
          <>
            <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
              Por que está recusando?
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="Ex.: não veio trabalhar, check-in em dobro"
                className="rounded-md border border-cinza-claro bg-branco px-3 py-2 text-base font-normal sm:text-sm"
              />
            </label>
            <button
              type="button"
              disabled={pendente}
              onClick={() => executar(() => recusarAction(c.id, motivo))}
              className="rounded-md bg-vermelho px-4 py-2.5 text-sm font-semibold text-branco disabled:opacity-60"
            >
              {pendente ? "Recusando..." : "Recusar: não trabalhou, nada vai para o Contas a Pagar"}
            </button>
            <button type="button" onClick={() => setRecusando(false)} className="self-start text-sm font-semibold text-azul-noite underline">
              Voltar para a conferência
            </button>
          </>
        )}

        {c.estado !== "pendente" && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-cinza-medio">Situação</dt>
              <dd className="text-azul-noite">{ROTULO_ESTADO[c.estado].texto}{c.conferidoPorNome ? ` por ${c.conferidoPorNome}` : ""}</dd>
              {c.valor !== null && (
                <>
                  <dt className="text-cinza-medio">Diária</dt>
                  <dd className="text-azul-noite">{formatarReais(c.valor)}{c.pagoNoCaixa ? ", paga pelo caixa" : ""}</dd>
                </>
              )}
              {c.motivoRecusa && (
                <>
                  <dt className="text-cinza-medio">Motivo</dt>
                  <dd className="text-azul-noite">{c.motivoRecusa}</dd>
                </>
              )}
              <dt className="text-cinza-medio">Contas a Pagar</dt>
              <dd className="text-azul-noite">{situacaoTitulo(c)}</dd>
            </dl>
            <button
              type="button"
              disabled={pendente}
              onClick={() => executar(() => desfazerAction(c.id))}
              className="rounded-md border border-cinza-claro px-4 py-2.5 text-sm font-semibold text-azul-noite disabled:opacity-60"
            >
              {pendente ? "Desfazendo..." : "Desfazer: volta para conferir de novo e tira o título do Contas a Pagar"}
            </button>
            <p className="text-xs text-cinza-medio">Diária já paga, de mês fechado ou alterada no Financeiro não desfaz por aqui: fale com quem cuida do Financeiro.</p>
          </>
        )}

        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button type="button" onClick={onFechar} className="self-end text-sm font-semibold text-cinza underline">
          Fechar sem mudar nada
        </button>
      </div>
    </ModalFlutuante>
  );
}
