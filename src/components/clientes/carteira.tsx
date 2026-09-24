"use client";

import Link from "next/link";
import { iniciarAcompanhamentoAction } from "@/app/(app)/escritorio/clientes/actions";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import type { Saude } from "@/lib/clientes/tipos";
import { ROTULO_SAUDE, TOM_SAUDE } from "@/lib/clientes/tipos";
import { Selo, useAcao } from "./ui";

export type LinhaCarteira = {
  organizacaoId: string;
  nome: string;
  acompanhamentoId: string | null;
  fase: string;
  progresso: number;
  saude: Saude;
  proximaReuniao: string;
  proximoMarco: string;
  pendenciasCliente: number;
  pendenciasVinicius: number;
  alertas: string[];
};

export function Carteira({ linhas, avisoCalendario }: { linhas: LinhaCarteira[]; avisoCalendario: string | null }) {
  const { pendente, erro, executar } = useAcao();

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Clientes</h1>
        <p className="text-sm text-cinza">
          Clientes de consultoria e híbridos. Responsável técnico: Vinícius. Diretor de Clientes, implantação e
          sucesso do cliente: Vini.
        </p>
        {avisoCalendario && <p className="text-xs text-vermelho">Próxima reunião indisponível: {avisoCalendario}</p>}
      </div>
      {erro && <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erro}</p>}

      {linhas.length === 0 ? (
        <p className="text-sm text-cinza-medio">Nenhum cliente de consultoria ou híbrido cadastrado no Painel de Acessos.</p>
      ) : (
        <TabelaRolavel ariaLabel="Carteira de clientes">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th>Cliente</Th>
                <Th>Fase</Th>
                <Th align="right">Progresso</Th>
                <Th>Saúde</Th>
                <Th>Próxima reunião</Th>
                <Th>Próximo marco</Th>
                <Th align="right">Pend. cliente</Th>
                <Th align="right">Pend. Vinícius</Th>
                <Th>Alertas</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.organizacaoId} className="border-t border-cinza-claro align-top">
                  <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-azul-noite" title={l.nome}>
                    {l.acompanhamentoId ? (
                      <Link href={`/escritorio/clientes/${l.acompanhamentoId}`} className="hover:underline">
                        {l.nome}
                      </Link>
                    ) : (
                      l.nome
                    )}
                  </td>
                  {l.acompanhamentoId ? (
                    <>
                      <td className="px-3 py-2">{l.fase}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.progresso}%</td>
                      <td className="px-3 py-2">
                        <Selo tom={TOM_SAUDE[l.saude]}>{ROTULO_SAUDE[l.saude]}</Selo>
                      </td>
                      <td className="px-3 py-2">{l.proximaReuniao}</td>
                      <td className="max-w-[220px] truncate px-3 py-2" title={l.proximoMarco}>{l.proximoMarco || "-"}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.pendenciasCliente}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.pendenciasVinicius}</td>
                      <td className="px-3 py-2 text-xs text-cinza">
                        {l.alertas.length ? (
                          <ul className="flex flex-col gap-0.5">
                            {l.alertas.map((a) => (
                              <li key={a} className="max-w-[260px] truncate" title={a}>{a}</li>
                            ))}
                          </ul>
                        ) : (
                          "-"
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={8} className="px-3 py-2">
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => executar(() => iniciarAcompanhamentoAction({ organizacaoId: l.organizacaoId }))}
                        className="text-sm font-semibold text-azul-petroleo hover:underline disabled:opacity-50"
                      >
                        Iniciar acompanhamento
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
    </div>
  );
}
