"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { acaoLeadAction } from "@/app/(app)/escritorio/comercial/actions";
import { Selo, classeCampo } from "@/components/clientes/ui";
import { ModalFichaLead } from "@/components/comercial/modal-ficha-lead";
import { NovoLead } from "@/components/comercial/novo-lead";
import { DicaCalculo } from "@/components/dica-calculo";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import {
  ETAPAS,
  ORIGENS,
  ROTULO_ETAPA,
  ROTULO_ORIGEM,
  calcularIndicadores,
  diasDesde,
  filtrarLeads,
  formatarWhatsapp,
  linkInstagram,
  linkWhatsapp,
  type FiltroComercial,
  type Etapa,
  type Lead,
} from "@/lib/comercial/funil";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";

/** Funil do Comercial: uma coluna por etapa no desktop, lista agrupada por
 * etapa no celular. Filtros e números rodam sobre os leads já carregados.
 * Clique no cartão abre a ficha em modal por cima do kanban (a rota
 * /escritorio/comercial/[id] continua valendo para link direto e nova aba).
 * O kanban do desktop usa o `TabelaRolavel`: mãozinha para arrastar, setas e
 * tela cheia com Esc, igual às tabelas do app.
 * Arrastar um cartão para outra coluna muda a etapa (16/10/2026), pela mesma
 * ação do "Mudar etapa" da ficha. Perdido pede motivo, então soltar em Perdido
 * abre a ficha em vez de mover. */
export function Funil({ leads, hoje }: { leads: Lead[]; hoje: string }) {
  const [filtro, setFiltro] = useState<FiltroComercial>({ origem: "", produto: "", desde: null });
  // Etapa já mudada na tela enquanto o servidor grava; some quando a lista nova chega.
  const [movidos, setMovidos] = useState<Record<string, Etapa>>({});
  const [leadsBase, setLeadsBase] = useState(leads);
  if (leadsBase !== leads) {
    setLeadsBase(leads);
    setMovidos({});
  }
  const [arrastado, setArrastado] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<Etapa | null>(null);
  const [avisoMover, setAvisoMover] = useState<string | null>(null);
  const [, iniciarTransicao] = useTransition();
  const leadsNaTela = useMemo(
    () => leads.map((l) => (movidos[l.id] && movidos[l.id] !== l.etapa ? { ...l, etapa: movidos[l.id], etapaDesde: hoje } : l)),
    [leads, movidos, hoje],
  );
  const visiveis = useMemo(() => filtrarLeads(leadsNaTela, filtro), [leadsNaTela, filtro]);
  const ind = calcularIndicadores(visiveis);
  const porEtapa = ETAPAS.map((etapa) => ({ etapa, leads: visiveis.filter((l) => l.etapa === etapa) }));
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  const fecharFicha = useCallback(() => setLeadAberto(null), []);

  function soltarEm(etapa: Etapa) {
    const id = arrastado;
    setArrastado(null);
    setColunaAlvo(null);
    const lead = id ? leadsNaTela.find((l) => l.id === id) : null;
    if (!lead || lead.etapa === etapa) return;
    if (etapa === "perdido") {
      setAvisoMover(`Para marcar ${lead.nome} como perdido, informe o motivo na ficha.`);
      setLeadAberto(lead.id);
      return;
    }
    setAvisoMover(null);
    setMovidos((m) => ({ ...m, [lead.id]: etapa }));
    iniciarTransicao(async () => {
      const r = await acaoLeadAction({ acao: "etapa", leadId: lead.id, paraEtapa: etapa });
      if (!r.ok) {
        setMovidos((m) => {
          const resto = { ...m };
          delete resto[lead.id];
          return resto;
        });
        setAvisoMover(`${lead.nome} não mudou de etapa: ${r.mensagem}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Comercial</h1>
          <p className="text-sm text-cinza">
            Leads do site, do WhatsApp e do Instagram. Cada formulário, compra e mudança fica na linha do tempo do lead.
          </p>
        </div>
        <NovoLead />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-cinza-claro bg-branco p-3">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
          Origem
          <select
            className={classeCampo}
            value={filtro.origem}
            onChange={(e) => setFiltro({ ...filtro, origem: e.target.value as FiltroComercial["origem"] })}
          >
            <option value="">Todas</option>
            {ORIGENS.map((o) => (
              <option key={o} value={o}>{ROTULO_ORIGEM[o]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
          Produto
          <select
            className={classeCampo}
            value={filtro.produto}
            onChange={(e) => setFiltro({ ...filtro, produto: e.target.value as FiltroComercial["produto"] })}
          >
            <option value="">Todos</option>
            <option value="zatti-hub">Zatti Hub</option>
            <option value="livro">Livro</option>
            <option value="consultoria">Consultoria</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
          Desde
          <input
            type="date"
            className={classeCampo}
            value={filtro.desde ?? ""}
            onChange={(e) => setFiltro({ ...filtro, desde: e.target.value || null })}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador
          rotulo="Leads"
          valor={String(ind.leadsNoPeriodo)}
          dica="Quantidade de leads que passam pelos filtros (origem, produto e data de entrada)."
        />
        <Indicador
          rotulo="Compraram"
          valor={String(ind.compraram)}
          dica="Leads filtrados que estão em Comprou livro, Comprou app ou etapa depois delas. Perdido não conta."
        />
        <Indicador
          rotulo="Conversão"
          valor={ind.conversao == null ? "-" : `${ind.conversao.toLocaleString("pt-BR")}%`}
          dica="Compraram ÷ Leads × 100, sobre os leads filtrados."
        />
        <Indicador
          rotulo="Por origem"
          valor={ind.porOrigem.length ? ind.porOrigem.map((o) => `${ROTULO_ORIGEM[o.origem]} ${o.total}`).join(" · ") : "-"}
          dica="Contagem de leads filtrados por canal de origem (o ?origem= do link ou o canal do SDR)."
          pequeno
        />
      </div>

      {/* Desktop: colunas por etapa */}
      <div className="hidden md:block">
        {avisoMover && (
          <p role="alert" className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-ambar bg-ambar/10 px-3 py-2 text-sm text-azul-noite">
            {avisoMover}
            <button type="button" className="text-xs font-semibold text-cinza-medio hover:underline" onClick={() => setAvisoMover(null)}>Fechar aviso</button>
          </p>
        )}
        <TabelaRolavel ariaLabel="Funil do Comercial" className="max-h-[75vh] rounded-lg border border-cinza-claro bg-branco">
          <div className="flex w-max gap-3 p-2">
            {porEtapa.map(({ etapa, leads: lista }) => (
              <section
                key={etapa}
                onDragOver={(e) => {
                  if (!arrastado) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (colunaAlvo !== etapa) setColunaAlvo(etapa);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null) && colunaAlvo === etapa) setColunaAlvo(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  soltarEm(etapa);
                }}
                className={`flex min-h-40 w-64 shrink-0 flex-col gap-2 rounded-xl p-2 transition-colors ${
                  colunaAlvo === etapa ? "bg-ambar/15 ring-2 ring-ambar" : "bg-azul-noite/5"
                }`}>
                <h2 className="flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wide text-azul-noite">
                  {ROTULO_ETAPA[etapa]}
                  <span className="rounded-full bg-branco px-2 text-cinza-medio">{lista.length}</span>
                </h2>
                {lista.map((l) => (
                  <CartaoLead
                    key={l.id}
                    lead={l}
                    hoje={hoje}
                    aoAbrir={setLeadAberto}
                    arraste={{
                      aoIniciar: () => setArrastado(l.id),
                      aoTerminar: () => {
                        setArrastado(null);
                        setColunaAlvo(null);
                      },
                      ativo: arrastado === l.id,
                    }}
                  />
                ))}
              </section>
            ))}
          </div>
        </TabelaRolavel>
      </div>

      {/* Celular: lista agrupada por etapa */}
      <div className="flex flex-col gap-4 md:hidden">
        {porEtapa
          .filter((g) => g.leads.length > 0)
          .map(({ etapa, leads: lista }) => (
            <section key={etapa} className="flex flex-col gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-azul-noite">
                {ROTULO_ETAPA[etapa]} ({lista.length})
              </h2>
              {lista.map((l) => (
                <CartaoLead key={l.id} lead={l} hoje={hoje} aoAbrir={setLeadAberto} />
              ))}
            </section>
          ))}
        {visiveis.length === 0 && <p className="text-sm text-cinza-medio">Nenhum lead com esses filtros.</p>}
      </div>

      {leadAberto && <ModalFichaLead key={leadAberto} leadId={leadAberto} aoFechar={fecharFicha} />}
    </div>
  );
}

function Indicador({ rotulo, valor, dica, pequeno }: { rotulo: string; valor: string; dica: string; pequeno?: boolean }) {
  return (
    <div className="rounded-xl border border-cinza-claro bg-branco p-3">
      <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
        {rotulo}
        <DicaCalculo rotulo={rotulo} texto={dica} />
      </p>
      <p className={`font-display font-bold text-azul-noite ${pequeno ? "text-sm" : "text-2xl"}`}>{valor}</p>
    </div>
  );
}

type Arraste = { aoIniciar: () => void; aoTerminar: () => void; ativo: boolean };

function CartaoLead({ lead, hoje, aoAbrir, arraste }: { lead: Lead; hoje: string; aoAbrir: (id: string) => void; arraste?: Arraste }) {
  const dias = diasDesde(lead.etapaDesde, hoje);
  const atrasada = lead.proximaAcaoEm != null && lead.proximaAcaoEm < hoje;
  // Cartão em <div>: os links do Instagram e do WhatsApp não podem ficar dentro
  // do link da ficha. O link do nome cobre o cartão todo (after:inset-0) e os
  // dois links de contato ficam por cima (relative z-10). Clique simples abre a
  // ficha em modal; Ctrl/Cmd/Shift ou botão do meio seguem o link (nova aba).
  return (
    <div
      draggable={arraste ? true : undefined}
      onDragStart={arraste ? (e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", lead.id);
        arraste.aoIniciar();
      } : undefined}
      onDragEnd={arraste?.aoTerminar}
      title={arraste ? "Arraste para outra coluna para mudar a etapa" : undefined}
      className={`relative flex flex-col gap-1 rounded-lg border border-cinza-claro bg-branco p-3 text-sm hover:border-ambar ${
        arraste ? "cursor-grab active:cursor-grabbing" : ""
      } ${arraste?.ativo ? "opacity-40" : ""}`}>
      <Link
        draggable={false}
        href={`/escritorio/comercial/${lead.id}`}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          aoAbrir(lead.id);
        }}
        className="truncate font-semibold text-azul-noite after:absolute after:inset-0 after:content-['']" title={lead.nome}>
        {lead.nome}
      </Link>
      {lead.negocio && <span className="truncate text-xs text-cinza" title={lead.negocio}>{lead.negocio}</span>}
      {(lead.instagram || lead.whatsapp) && (
        <span className="flex flex-wrap gap-x-2 text-xs">
          {lead.instagram && (
            <a draggable={false} href={linkInstagram(lead.instagram)} target="_blank" rel="noopener noreferrer"
              className="relative z-10 truncate font-semibold text-azul-petroleo hover:underline" title={`Abrir o perfil @${lead.instagram}`}>
              @{lead.instagram}
            </a>
          )}
          {lead.whatsapp && (
            <a draggable={false} href={linkWhatsapp(lead.whatsapp)} target="_blank" rel="noopener noreferrer"
              className="relative z-10 text-azul-petroleo hover:underline" title="Abrir o WhatsApp">
              {formatarWhatsapp(lead.whatsapp)}
            </a>
          )}
        </span>
      )}
      <span className="flex flex-wrap gap-1">
        <Selo>{ROTULO_ORIGEM[lead.origem]}</Selo>
        {lead.produtoInteresse && <Selo tom="atencao">{lead.produtoInteresse}</Selo>}
      </span>
      <span className="text-xs text-cinza-medio">
        {dias === 0 ? "Entrou na etapa hoje" : `${dias} dia${dias === 1 ? "" : "s"} na etapa`}
      </span>
      {lead.proximaAcao && (
        <span className={`truncate text-xs ${atrasada ? "font-semibold text-vermelho" : "text-cinza"}`} title={lead.proximaAcao}>
          {lead.proximaAcaoEm ? `${formatarDataBr(lead.proximaAcaoEm)}: ` : ""}
          {lead.proximaAcao}
        </span>
      )}
    </div>
  );
}
