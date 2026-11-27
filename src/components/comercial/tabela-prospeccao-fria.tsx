"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Selo } from "@/components/clientes/ui";
import { BuscaLead, BuscaLeadSemResultado } from "@/components/comercial/busca-lead";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { ROTULO_ETAPA, buscarLeads, diasDesde, formatarWhatsapp, linkInstagram, linkWhatsapp } from "@/lib/comercial/funil";
import { ETAPAS_PAINEL, chegouEm, type ResumoProspeccao } from "@/lib/comercial/prospeccao-fria";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";

/** Tabela das lojas da prospecção fria, com a busca pelo @ ou pelo nome
 * (27/11/2026). A busca só esconde linhas: os quadros do topo seguem o período. */
export function TabelaProspeccaoFria({ lojas, hoje }: { lojas: ResumoProspeccao["lojas"]; hoje: string }) {
  const [termo, setTermo] = useState("");
  const visiveis = useMemo(() => buscarLeads(lojas, termo), [lojas, termo]);

  return (
    <div className="flex flex-col gap-3">
      <BuscaLead termo={termo} onChange={setTermo} encontrados={visiveis.length} total={lojas.length} singular="loja" plural="lojas" />
      {visiveis.length === 0 ? (
        <BuscaLeadSemResultado termo={termo} />
      ) : (
        <TabelaRolavel ariaLabel="Lojas da prospecção fria">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th fixo>Loja</Th>
                <Th>Contato</Th>
                <Th larguraFixa="96px">Contatada em</Th>
                {ETAPAS_PAINEL.slice(1).map((e) => (
                  <Th key={e.chave} align="center" larguraFixa="88px">{e.rotulo}</Th>
                ))}
                <Th>Etapa atual</Th>
                <Th larguraFixa="80px">Na etapa</Th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const dias = diasDesde(l.etapaDesde, hoje);
                return (
                  <tr key={l.id} className="border-b border-cinza-claro">
                    <td className="sticky left-0 max-w-56 truncate bg-branco px-3 py-2" title={l.nome}>
                      <Link href={`/escritorio/comercial/${l.id}`} className="font-semibold text-azul-noite hover:underline">
                        {l.nome}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {l.instagram && (
                        <a href={linkInstagram(l.instagram)} target="_blank" rel="noopener noreferrer" className="mr-2 font-semibold text-azul-petroleo hover:underline">
                          @{l.instagram}
                        </a>
                      )}
                      {l.whatsapp && (
                        <a href={linkWhatsapp(l.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-azul-petroleo hover:underline">
                          {formatarWhatsapp(l.whatsapp)}
                        </a>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatarDataBr(l.contatoEm)}</td>
                    {ETAPAS_PAINEL.slice(1).map((e) => (
                      <td key={e.chave} className="px-3 py-2 text-center">
                        {chegouEm(l, e.chave) ? <span className="font-semibold text-verde">Sim</span> : <span className="text-cinza-medio">-</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <Selo tom={l.etapa === "perdido" ? "critico" : chegouEm(l, "cliente") ? "bom" : "neutro"}>{ROTULO_ETAPA[l.etapa]}</Selo>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-cinza-medio">
                      {dias === 0 ? "Hoje" : `${dias} dia${dias === 1 ? "" : "s"}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
    </div>
  );
}
