"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { salvarPecaAction } from "@/app/(app)/escritorio/conteudo/actions";
import { classeBotao, classeBotaoLeve, classeCampo } from "@/components/clientes/ui";
import { ModalPeca } from "@/components/conteudo/modal-peca";
import { DicaCalculo } from "@/components/dica-calculo";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import {
  STATUS_PECA,
  contarPorStatus,
  diasDaSemana,
  inicioDaSemana,
  nomeDoDia,
  ordenarLista,
  pecasDoDia,
  somarDias,
  type CamposPeca,
  type Peca,
  type StatusPeca,
} from "@/lib/conteudo/pecas";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";

/** Cor de cada status (borda do cartão e do seletor): ideia neutra, em produção âmbar, publicado verde. */
const COR_STATUS: Record<StatusPeca, string> = {
  Ideia: "border-l-cinza-claro",
  "Roteiro pronto": "border-l-ambar",
  Gravado: "border-l-azul-petroleo",
  Editado: "border-l-azul-petroleo",
  "Publicado Teste": "border-l-verde/60",
  "Publicado todos": "border-l-verde",
};

type ModalAberto = { peca: Peca | null; dataPadrao: string | null } | null;

/** Escritório > Conteúdo: calendário editorial do @viniciusczanetti. Semana em colunas por dia
 * (padrão; no celular os dias empilham), lista com filtro por status, criar/editar em modal e
 * mudar status direto no cartão. Toda gravação passa por `salvarPecaAction` (auditoria origem hub). */
export function CalendarioConteudo({ pecas, hoje }: { pecas: Peca[]; hoje: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<"semana" | "lista">("semana");
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hoje));
  const [modal, setModal] = useState<ModalAberto>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  // A peça do modal vem sempre da lista atual: depois de um conflito a tela recarrega e o
  // modal passa a usar a versão nova.
  const pecaDoModal = modal?.peca ? (pecas.find((p) => p.id === modal.peca!.id) ?? modal.peca) : null;

  function gravar(peca: Peca | null, campos: CamposPeca, aoConcluir?: () => void) {
    setErro(null);
    setSalvandoId(peca?.id ?? "nova");
    iniciar(async () => {
      const r = await salvarPecaAction({ id: peca?.id ?? null, versao: peca?.versao ?? null, campos });
      setSalvandoId(null);
      router.refresh();
      if (!r.ok) {
        setErro(r.mensagem);
        return;
      }
      aoConcluir?.();
    });
  }

  function mudarStatus(peca: Peca, status: StatusPeca) {
    if (status !== peca.status) gravar(peca, { status });
  }

  function abrir(peca: Peca | null, dataPadrao: string | null = null) {
    setErro(null);
    setModal({ peca, dataPadrao });
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-azul-noite">Conteúdo</h1>
          <p className="text-sm text-cinza">Calendário editorial do @viniciusczanetti. O Vini lê e grava aqui também.</p>
        </div>
        <button type="button" className={classeBotao} onClick={() => abrir(null)}>
          Nova peça
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-azul-noite p-1" role="tablist" aria-label="Modo de ver">
          {(["semana", "lista"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${modo === m ? "bg-ambar text-azul-noite" : "text-branco/75 hover:text-branco"}`}
            >
              {m === "semana" ? "Semana" : "Lista"}
            </button>
          ))}
        </div>
      </div>

      {erro && !modal && (
        <p role="alert" className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erro}</p>
      )}

      {modo === "semana" ? (
        <Semana
          pecas={pecas}
          hoje={hoje}
          segunda={segunda}
          setSegunda={setSegunda}
          salvandoId={pendente ? salvandoId : null}
          aoAbrir={abrir}
          aoMudarStatus={mudarStatus}
          aoVerLista={() => setModo("lista")}
        />
      ) : (
        <Lista pecas={pecas} salvandoId={pendente ? salvandoId : null} aoAbrir={abrir} aoMudarStatus={mudarStatus} />
      )}

      {modal && (
        <ModalPeca
          key={modal.peca?.id ?? `nova-${modal.dataPadrao ?? ""}`}
          peca={pecaDoModal}
          dataPadrao={modal.dataPadrao}
          pendente={pendente}
          erro={erro}
          onFechar={() => {
            setModal(null);
            setErro(null);
          }}
          onSalvar={(campos) => gravar(pecaDoModal, campos, () => setModal(null))}
        />
      )}
    </div>
  );
}

function Semana({
  pecas,
  hoje,
  segunda,
  setSegunda,
  salvandoId,
  aoAbrir,
  aoMudarStatus,
  aoVerLista,
}: {
  pecas: Peca[];
  hoje: string;
  segunda: string;
  setSegunda: (s: string) => void;
  salvandoId: string | null;
  aoAbrir: (p: Peca | null, dataPadrao?: string | null) => void;
  aoMudarStatus: (p: Peca, s: StatusPeca) => void;
  aoVerLista: () => void;
}) {
  const dias = diasDaSemana(segunda);
  const porDia = dias.map((dia) => ({ dia, lista: pecasDoDia(pecas, dia) }));
  const naSemana = porDia.reduce((t, d) => t + d.lista.length, 0);
  const publicadas = porDia.reduce((t, d) => t + d.lista.filter((p) => p.status.startsWith("Publicado")).length, 0);
  const semData = pecas.filter((p) => !p.data).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={classeBotaoLeve} onClick={() => setSegunda(somarDias(segunda, -7))} aria-label="Semana anterior">
          ‹ Anterior
        </button>
        <button type="button" className={classeBotaoLeve} onClick={() => setSegunda(inicioDaSemana(hoje))}>
          Hoje
        </button>
        <button type="button" className={classeBotaoLeve} onClick={() => setSegunda(somarDias(segunda, 7))} aria-label="Próxima semana">
          Próxima ›
        </button>
        <span className="text-sm font-semibold text-azul-noite">
          {formatarDataBr(dias[0])} a {formatarDataBr(dias[6])}
        </span>
      </div>
      <p className="flex flex-wrap items-center gap-1 text-sm text-cinza">
        {naSemana} {naSemana === 1 ? "peça" : "peças"} na semana, {publicadas} {publicadas === 1 ? "publicada" : "publicadas"}
        <DicaCalculo
          rotulo="Peças na semana"
          texto="Peças com data entre segunda e domingo desta semana. Publicadas = status Publicado Teste ou Publicado todos."
        />
        {semData > 0 && (
          <button type="button" onClick={aoVerLista} className="font-semibold text-azul-petroleo hover:underline">
            · {semData} sem data (ver na Lista)
          </button>
        )}
      </p>

      {/* Desktop: colunas por dia */}
      <div className="hidden md:block">
        <TabelaRolavel ariaLabel="Semana do calendário de conteúdo" className="max-h-[75vh] rounded-lg border border-cinza-claro bg-branco">
          <div className="grid min-w-[980px] grid-cols-7 gap-2 p-2">
            {porDia.map(({ dia, lista }) => (
              <section key={dia} className={`flex min-w-0 flex-col gap-2 rounded-xl p-2 ${dia === hoje ? "bg-ambar/15" : "bg-azul-noite/5"}`}>
                <CabecalhoDia dia={dia} hoje={hoje} total={lista.length} aoNova={() => aoAbrir(null, dia)} />
                {lista.map((p) => (
                  <Cartao key={p.id} peca={p} salvando={salvandoId === p.id} aoAbrir={aoAbrir} aoMudarStatus={aoMudarStatus} />
                ))}
              </section>
            ))}
          </div>
        </TabelaRolavel>
      </div>

      {/* Celular: dias empilhados */}
      <div className="flex flex-col gap-4 md:hidden">
        {porDia.map(({ dia, lista }) => (
          <section key={dia} className={`flex flex-col gap-2 rounded-xl p-2 ${dia === hoje ? "bg-ambar/15" : ""}`}>
            <CabecalhoDia dia={dia} hoje={hoje} total={lista.length} aoNova={() => aoAbrir(null, dia)} />
            {lista.length === 0 && <p className="px-1 text-xs text-cinza-medio">Nada planejado.</p>}
            {lista.map((p) => (
              <Cartao key={p.id} peca={p} salvando={salvandoId === p.id} aoAbrir={aoAbrir} aoMudarStatus={aoMudarStatus} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function CabecalhoDia({ dia, hoje, total, aoNova }: { dia: string; hoje: string; total: number; aoNova: () => void }) {
  return (
    <h2 className="flex items-center justify-between gap-1 px-1 text-xs font-bold uppercase tracking-wide text-azul-noite">
      <span className="truncate">
        {nomeDoDia(dia)} {formatarDataBr(dia).slice(0, 5)}
        {dia === hoje && <span className="ml-1 text-ambar">hoje</span>}
      </span>
      <span className="flex items-center gap-1">
        <span className="rounded-full bg-branco px-2 text-cinza-medio">{total}</span>
        <button type="button" onClick={aoNova} title={`Nova peça em ${formatarDataBr(dia)}`} aria-label={`Nova peça em ${formatarDataBr(dia)}`}
          className="rounded-full bg-branco px-2 text-azul-petroleo hover:bg-ambar hover:text-azul-noite">
          +
        </button>
      </span>
    </h2>
  );
}

function SeletorStatus({ peca, salvando, aoMudar }: { peca: Peca; salvando: boolean; aoMudar: (p: Peca, s: StatusPeca) => void }) {
  return (
    <select
      aria-label={`Status de ${peca.titulo}`}
      className={`${classeCampo} border-l-4 !py-1 text-xs ${COR_STATUS[peca.status] ?? ""}`}
      value={peca.status}
      disabled={salvando}
      onChange={(e) => aoMudar(peca, e.target.value as StatusPeca)}
    >
      {STATUS_PECA.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function Cartao({
  peca,
  salvando,
  aoAbrir,
  aoMudarStatus,
}: {
  peca: Peca;
  salvando: boolean;
  aoAbrir: (p: Peca) => void;
  aoMudarStatus: (p: Peca, s: StatusPeca) => void;
}) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border border-l-4 border-cinza-claro bg-branco p-2 text-sm ${COR_STATUS[peca.status] ?? ""} ${salvando ? "opacity-60" : ""}`}>
      <button type="button" onClick={() => aoAbrir(peca)} className="flex flex-col gap-0.5 text-left">
        {peca.hora && <span className="text-xs font-bold text-azul-petroleo">{peca.hora}</span>}
        <span className="line-clamp-3 font-semibold text-azul-noite" title={peca.titulo}>{peca.titulo}</span>
        {(peca.formato || peca.etapa_funil) && (
          <span className="truncate text-xs text-cinza" title={[peca.formato, peca.etapa_funil].filter(Boolean).join(" · ")}>
            {[peca.formato, peca.etapa_funil].filter(Boolean).join(" · ")}
          </span>
        )}
      </button>
      <SeletorStatus peca={peca} salvando={salvando} aoMudar={aoMudarStatus} />
    </div>
  );
}

function Lista({
  pecas,
  salvandoId,
  aoAbrir,
  aoMudarStatus,
}: {
  pecas: Peca[];
  salvandoId: string | null;
  aoAbrir: (p: Peca) => void;
  aoMudarStatus: (p: Peca, s: StatusPeca) => void;
}) {
  const [status, setStatus] = useState<StatusPeca | "">("");
  const [busca, setBusca] = useState("");
  const contagem = useMemo(() => contarPorStatus(pecas), [pecas]);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return ordenarLista(
      pecas.filter((p) => (!status || p.status === status) && (!termo || p.titulo.toLocaleLowerCase("pt-BR").includes(termo))),
    );
  }, [pecas, status, busca]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-cinza-claro bg-branco p-3">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
          <span className="flex items-center gap-1">
            Status
            <DicaCalculo rotulo="Contagem por status" texto="O número ao lado de cada status é a quantidade de peças com aquele status, em todo o calendário." />
          </span>
          <select className={classeCampo} value={status} onChange={(e) => setStatus(e.target.value as StatusPeca | "")}>
            <option value="">Todos ({pecas.length})</option>
            {STATUS_PECA.map((s) => (
              <option key={s} value={s}>{s} ({contagem[s]})</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
          Buscar no título
          <input className={classeCampo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: carrossel" />
        </label>
      </div>

      {visiveis.length === 0 && <p className="text-sm text-cinza-medio">Nenhuma peça com esse filtro.</p>}

      {/* Desktop: tabela padrão do app */}
      {visiveis.length > 0 && (
        <div className="hidden md:block">
          <TabelaRolavel ariaLabel="Lista de peças de conteúdo">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
                  <Th larguraFixa="96px">Data</Th>
                  <Th larguraFixa="56px">Hora</Th>
                  <Th>Título</Th>
                  <Th larguraFixa="170px">Status</Th>
                  <Th>Formato</Th>
                  <Th larguraFixa="64px">Funil</Th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((p) => (
                  <tr key={p.id} className="border-b border-cinza-claro last:border-0 hover:bg-azul-noite/5">
                    <td className="whitespace-nowrap px-3 py-2">{p.data ? formatarDataBr(p.data) : "Sem data"}</td>
                    <td className="px-3 py-2">{p.hora ?? "-"}</td>
                    <td className="max-w-[420px] px-3 py-2">
                      <button type="button" onClick={() => aoAbrir(p)} className="block w-full truncate text-left font-semibold text-azul-noite hover:underline" title={p.titulo}>
                        {p.titulo}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <SeletorStatus peca={p} salvando={salvandoId === p.id} aoMudar={aoMudarStatus} />
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={p.formato}>{p.formato || "-"}</td>
                    <td className="px-3 py-2">{p.etapa_funil || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaRolavel>
        </div>
      )}

      {/* Celular: cartões */}
      <div className="flex flex-col gap-2 md:hidden">
        {visiveis.map((p) => (
          <div key={p.id} className="flex flex-col gap-1">
            <span className="px-1 text-xs font-bold uppercase tracking-wide text-cinza-medio">
              {p.data ? `${nomeDoDia(p.data)} ${formatarDataBr(p.data)}` : "Sem data"}
            </span>
            <Cartao peca={p} salvando={salvandoId === p.id} aoAbrir={aoAbrir} aoMudarStatus={aoMudarStatus} />
          </div>
        ))}
      </div>
    </div>
  );
}
