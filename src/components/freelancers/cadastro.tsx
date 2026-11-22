"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CampoBusca } from "@/components/campo-busca";
import { CampoNumero } from "@/components/campo-numero";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { normalizarBusca } from "@/lib/busca";
import { salvarFreelancerAction } from "@/app/(app)/freelancers/actions";
import { FUNCOES_SUGERIDAS, formatarReais, formatarWhatsapp, type Freelancer } from "@/lib/freelancers/regras";

const ROTULO_SITUACAO: Record<Freelancer["situacao"], { texto: string; classe: string }> = {
  ativo: { texto: "Ativo", classe: "bg-verde/15 text-verde" },
  novo: { texto: "Novo, entrou pelo QR", classe: "bg-ambar/15 text-azul-noite" },
  inativo: { texto: "Não trabalha mais", classe: "bg-cinza-claro text-cinza" },
};

export function CadastroFreelancers({ freelancers, podeEditar }: { freelancers: Freelancer[]; podeEditar: boolean }) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Freelancer | "novo" | null>(null);
  const visiveis = useMemo(() => {
    const t = normalizarBusca(busca);
    const digitos = busca.replace(/\D/g, "");
    if (!t) return freelancers;
    return freelancers.filter(
      (f) => normalizarBusca(f.nome).includes(t) || normalizarBusca(f.funcao ?? "").includes(t) || (digitos.length >= 3 && f.whatsapp.includes(digitos)),
    );
  }, [freelancers, busca]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <CampoBusca valor={busca} onChange={setBusca} rotulo="Buscar freelancer por nome, função ou WhatsApp" placeholder="Buscar por nome, função ou WhatsApp" />
        {podeEditar && (
          <button
            type="button"
            onClick={() => setEditando("novo")}
            data-tour="freela-cadastrar"
            className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco"
          >
            Cadastrar freelancer
          </button>
        )}
      </div>
      {freelancers.length === 0 ? (
        <p className="rounded-lg border border-cinza-claro bg-branco p-4 text-sm text-cinza-medio">
          Nenhum freelancer ainda. Cadastre aqui ou deixe a pessoa fazer o primeiro check-in pelo QR: ela entra como nova e você aprova na conferência.
        </p>
      ) : (
        <TabelaRolavel ariaLabel="Freelancers cadastrados">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-azul-petroleo text-branco">
                <Th fixo>Nome</Th>
                <Th>Função</Th>
                <Th>WhatsApp</Th>
                <Th align="right">Diária combinada</Th>
                <Th>Situação</Th>
                {podeEditar && <Th align="center">Ação</Th>}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((f) => (
                <tr key={f.id} className="border-b border-cinza-claro last:border-0">
                  <td className="max-w-[240px] truncate px-3 py-2 font-semibold text-azul-noite" title={f.nome}>
                    {f.nome}
                  </td>
                  <td className="px-3 py-2">{f.funcao ?? "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatarWhatsapp(f.whatsapp)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{f.diaria !== null ? formatarReais(f.diaria) : "Padrão da unidade"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ROTULO_SITUACAO[f.situacao].classe}`}>
                      {ROTULO_SITUACAO[f.situacao].texto}
                    </span>
                  </td>
                  {podeEditar && (
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => setEditando(f)} className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-azul-noite">
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={podeEditar ? 6 : 5} className="px-3 py-4 text-center text-sm text-cinza-medio">
                    Ninguém com esse nome, função ou WhatsApp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TabelaRolavel>
      )}
      {editando && <ModalFreelancer freelancer={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function ModalFreelancer({ freelancer, onFechar }: { freelancer: Freelancer | null; onFechar: () => void }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [nome, setNome] = useState(freelancer?.nome ?? "");
  const [whatsapp, setWhatsapp] = useState(freelancer ? formatarWhatsapp(freelancer.whatsapp) : "");
  const [funcao, setFuncao] = useState(freelancer?.funcao ?? "");
  const [diaria, setDiaria] = useState<number | null>(freelancer?.diaria ?? null);
  const [ativo, setAtivo] = useState(freelancer ? freelancer.situacao !== "inativo" : true);
  const [erro, setErro] = useState<string | null>(null);
  const campo = "rounded-md border border-cinza-claro bg-branco px-3 py-2 text-base font-normal sm:text-sm";

  return (
    <ModalFlutuante aberto onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-bold text-azul-noite">{freelancer ? `Editar ${freelancer.nome}` : "Cadastrar freelancer"}</h2>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className={campo} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          WhatsApp com DDD
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="(16) 99999-0000" className={campo} />
          <span className="text-xs font-normal text-cinza-medio">É por ele que o check-in do QR reconhece a pessoa.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          Função
          <input value={funcao} onChange={(e) => setFuncao(e.target.value)} maxLength={40} list="funcoes-freela" placeholder="Ex.: Garçom" className={campo} />
          <datalist id="funcoes-freela">
            {FUNCOES_SUGERIDAS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noite">
          Diária combinada (R$)
          <CampoNumero value={diaria} onChange={setDiaria} className="max-w-[200px]" />
          <span className="text-xs font-normal text-cinza-medio">Deixe em branco para usar a diária padrão da unidade.</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-azul-noite">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            Ainda trabalha com a gente
            <span className="block text-xs text-cinza-medio">Desmarcado, some da lista de lançar à mão. O check-in pelo QR continua aparecendo para você conferir.</span>
          </span>
        </label>
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              setErro(null);
              const r = await salvarFreelancerAction({ id: freelancer?.id ?? null, nome, whatsapp, funcao, diaria, ativo });
              if ("erro" in r) setErro(r.erro);
              else {
                onFechar();
                router.refresh();
              }
            })
          }
          className="rounded-md bg-azul-noite px-4 py-2.5 text-sm font-semibold text-branco disabled:opacity-60"
        >
          {pendente ? "Salvando..." : freelancer ? "Salvar as mudanças" : "Cadastrar"}
        </button>
        {erro && <p className="text-sm text-vermelho">{erro}</p>}
        <button type="button" onClick={onFechar} className="self-end text-sm font-semibold text-cinza underline">
          Fechar sem salvar
        </button>
      </div>
    </ModalFlutuante>
  );
}
