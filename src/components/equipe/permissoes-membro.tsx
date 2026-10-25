"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { SeletorComBusca } from "@/components/financeiro-gerencial/seletor-com-busca";
import { salvarPermissoesMembroAction } from "@/app/(app)/equipe/actions";
import {
  ACOES,
  MODULOS,
  ROTULO_NIVEL,
  chaveLiberada,
  copiarNiveis,
  mudancas,
  nivelPadrao,
  niveisEfetivos,
  niveisPermitidos,
  rascunhoInicial,
  textoSalvarPermissoes,
  type ChavePermissao,
  type Excecoes,
  type NiveisCompletos,
  type NivelModulo,
} from "@/lib/permissoes/modulos";

type Papel = "gestao" | "operacional";

export type PessoaPermissoes = {
  vinculoId: string;
  nome: string;
  role: Papel;
  /** Vínculo sem unidade (dono). */
  orgInteira: boolean;
  excecoes: Excecoes;
};

const ROTULO_FUNCAO: Record<Papel, string> = { gestao: "Gestão", operacional: "Operacional" };

/** Botão "Permissões" + grade módulo x nível (Navegação V2, fase 6 - 25/10/2026). Tudo é
 * rascunho na tela: "Copiar de...", "Voltar ao padrão" e cada toque entram no histórico do
 * "Desfazer"; nada grava até o botão Salvar, que diz o efeito. A regra de quem pode e do que
 * pode é do banco (`salvar_permissoes_modulo`). */
export function PermissoesMembro({
  pessoa,
  outras,
  className,
}: {
  pessoa: PessoaPermissoes;
  /** Pessoas da mesma equipe para "Copiar de...". */
  outras: PessoaPermissoes[];
  className: string;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const salvo = useMemo(
    () => rascunhoInicial(pessoa.role, pessoa.orgInteira, pessoa.excecoes),
    [pessoa.role, pessoa.orgInteira, pessoa.excecoes],
  );
  const [rascunho, setRascunho] = useState<NiveisCompletos>(salvo);
  const [historico, setHistorico] = useState<NiveisCompletos[]>([]);
  const [somenteAlterados, setSomenteAlterados] = useState(false);
  const [copiadoDe, setCopiadoDe] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const padrao = (c: ChavePermissao) => nivelPadrao(pessoa.role, pessoa.orgInteira, c);
  const alteradas = mudancas(salvo, rascunho);
  const qtdExcecoes = MODULOS.filter((m) => rascunho[m.chave] !== padrao(m.chave)).length +
    ACOES.filter((a) => rascunho[a.modulo] === "editar" && rascunho[a.chave] !== padrao(a.chave)).length;

  function abrir() {
    setRascunho(salvo);
    setHistorico([]);
    setSomenteAlterados(false);
    setCopiadoDe("");
    setAviso(null);
    setErro(null);
    setAberto(true);
  }

  function aplicar(novo: NiveisCompletos, textoAviso: string | null = null) {
    setHistorico((h) => [...h, rascunho]);
    setRascunho(novo);
    setAviso(textoAviso);
    setErro(null);
  }

  function trocar(chave: ChavePermissao, nivel: NivelModulo) {
    if (rascunho[chave] === nivel) return;
    aplicar({ ...rascunho, [chave]: nivel });
  }

  function desfazer() {
    const anterior = historico[historico.length - 1];
    if (!anterior) return;
    setHistorico((h) => h.slice(0, -1));
    setRascunho(anterior);
    setAviso(null);
  }

  function voltarAoPadrao() {
    aplicar(rascunhoInicial(pessoa.role, pessoa.orgInteira, {}), "Tudo no padrão da função. Salve para valer.");
  }

  function copiar(vinculoId: string) {
    setCopiadoDe(vinculoId);
    const origem = outras.find((o) => o.vinculoId === vinculoId);
    if (!origem) return;
    const efetivos = niveisEfetivos(origem.role, origem.orgInteira, origem.excecoes);
    const copia = copiarNiveis({ role: pessoa.role, orgInteira: pessoa.orgInteira }, efetivos);
    const ajustou = MODULOS.some((m) => m.liberado && copia[m.chave] !== efetivos[m.chave]);
    aplicar(
      copia,
      `Copiado de ${origem.nome}.` +
        (ajustou ? ` Onde a função de ${pessoa.nome} não permite o mesmo nível, ficou o máximo que ela permite.` : "") +
        " Confira e salve.",
    );
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await salvarPermissoesMembroAction(pessoa.vinculoId, rascunho);
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  const visivel = (c: ChavePermissao) => !somenteAlterados || rascunho[c] !== padrao(c) || rascunho[c] !== salvo[c];
  const opcoesCopia = outras
    .filter((o) => o.vinculoId !== pessoa.vinculoId)
    .map((o) => ({ id: o.vinculoId, label: `${o.nome} (${ROTULO_FUNCAO[o.role]}${o.orgInteira ? ", todas as unidades" : ""})` }));

  return (
    <>
      <button type="button" onClick={abrir} className={className}>
        Permissões{qtdExcecoes > 0 && !aberto ? ` (${qtdExcecoes})` : ""}
      </button>

      <ModalFlutuante aberto={aberto} onFechar={() => setAberto(false)}>
        <h2 className="font-display text-xl font-bold text-azul-noite">Permissões</h2>
        <p className="mt-1 truncate text-sm text-cinza-medio" title={pessoa.nome}>
          {pessoa.nome} · {ROTULO_FUNCAO[pessoa.role]}
          {pessoa.orgInteira ? " em todas as unidades" : ""}
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <label className="text-xs font-semibold text-cinza-medio">
            Copiar de...
            <SeletorComBusca
              value={copiadoDe}
              opcoes={opcoesCopia}
              onChange={copiar}
              placeholder={opcoesCopia.length ? "Escolha uma pessoa da equipe" : "Ninguém para copiar"}
              className="mt-1"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-cinza">
              <input
                type="checkbox"
                checked={somenteAlterados}
                onChange={(e) => setSomenteAlterados(e.target.checked)}
                className="h-4 w-4 accent-azul-petroleo"
              />
              Somente alterados
            </label>
            <span className="flex-1" />
            <button
              type="button"
              onClick={desfazer}
              disabled={historico.length === 0 || pendente}
              className="rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-cinza disabled:opacity-40"
            >
              Desfazer
            </button>
            <button
              type="button"
              onClick={voltarAoPadrao}
              disabled={pendente}
              className="rounded-md border border-cinza-claro px-2 py-1 text-xs font-semibold text-cinza disabled:opacity-40"
            >
              Voltar ao padrão
            </button>
          </div>
          {aviso && <p className="rounded-md bg-azul-petroleo/10 px-3 py-2 text-xs text-azul-noite">{aviso}</p>}
        </div>

        <ul className="mt-3 flex flex-col divide-y divide-cinza-claro rounded-lg border border-cinza-claro bg-branco">
          {MODULOS.filter((m) => visivel(m.chave) || ACOES.some((a) => a.modulo === m.chave && rascunho[m.chave] === "editar" && visivel(a.chave))).map((m) => {
            const acoes = ACOES.filter(
              (a) => a.modulo === m.chave && rascunho[m.chave] === "editar" && niveisPermitidos(pessoa.role, pessoa.orgInteira, a.chave).length > 1 && visivel(a.chave),
            );
            return (
              <li key={m.chave} className="flex flex-col gap-2 p-3">
                <LinhaNivel
                  chave={m.chave}
                  nome={m.nome}
                  descricao={m.liberado ? m.descricao : "Ainda segue o padrão da função (chega na próxima etapa)."}
                  valor={rascunho[m.chave]}
                  padrao={padrao(m.chave)}
                  salvo={salvo[m.chave]}
                  permitidos={niveisPermitidos(pessoa.role, pessoa.orgInteira, m.chave)}
                  bloqueado={!chaveLiberada(m.chave)}
                  explicacaoBloqueio={
                    m.chave === "configuracoes"
                      ? "Ligar e desligar módulos fica com a Zatti (módulo pode ser pago)."
                      : `A função ${ROTULO_FUNCAO[pessoa.role]} não permite. Mude a função em "Editar acesso".`
                  }
                  onTrocar={(n) => trocar(m.chave, n)}
                  desabilitado={pendente}
                />
                {acoes.map((a) => (
                  <div key={a.chave} className="ml-3 border-l-2 border-cinza-claro pl-3">
                    <LinhaNivel
                      chave={a.chave}
                      nome={a.nome}
                      descricao={a.descricao}
                      valor={rascunho[a.chave]}
                      padrao={padrao(a.chave)}
                      salvo={salvo[a.chave]}
                      permitidos={niveisPermitidos(pessoa.role, pessoa.orgInteira, a.chave)}
                      bloqueado={false}
                      explicacaoBloqueio=""
                      onTrocar={(n) => trocar(a.chave, n)}
                      desabilitado={pendente}
                      acao
                    />
                  </div>
                ))}
              </li>
            );
          })}
          {somenteAlterados && MODULOS.every((m) => !visivel(m.chave)) && ACOES.every((a) => !visivel(a.chave)) && (
            <li className="p-3 text-sm text-cinza-medio">Nada fora do padrão da função.</li>
          )}
        </ul>

        <p className="mt-3 rounded-md border border-cinza-claro bg-branco p-3 text-xs text-cinza">
          Vale na próxima tela que a pessoa abrir, sem precisar sair. Início fica sempre visível.
        </p>

        {erro && <p className="mt-3 text-xs text-vermelho">{erro}</p>}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="rounded-md border border-cinza-claro px-3 py-1.5 text-xs font-semibold text-cinza-medio"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pendente || alteradas.length === 0}
            onClick={salvar}
            className="rounded-md bg-azul-noite px-3 py-1.5 text-left text-xs font-semibold text-branco hover:bg-azul-petroleo disabled:opacity-50 sm:text-center"
          >
            {pendente ? "Salvando..." : textoSalvarPermissoes(pessoa.nome, salvo, rascunho)}
          </button>
        </div>
      </ModalFlutuante>
    </>
  );
}

function LinhaNivel({
  chave,
  nome,
  descricao,
  valor,
  padrao,
  salvo,
  permitidos,
  bloqueado,
  explicacaoBloqueio,
  onTrocar,
  desabilitado,
  acao = false,
}: {
  chave: ChavePermissao;
  nome: string;
  descricao: string;
  valor: NivelModulo;
  padrao: NivelModulo;
  salvo: NivelModulo;
  permitidos: NivelModulo[];
  bloqueado: boolean;
  explicacaoBloqueio: string;
  onTrocar: (n: NivelModulo) => void;
  desabilitado: boolean;
  acao?: boolean;
}) {
  const opcoes: { nivel: NivelModulo; rotulo: string }[] = acao
    ? [
        { nivel: "sem_acesso", rotulo: "Bloqueado" },
        { nivel: "editar", rotulo: "Liberado" },
      ]
    : (["sem_acesso", "ver", "editar"] as NivelModulo[]).map((n) => ({ nivel: n, rotulo: ROTULO_NIVEL[n] }));
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-azul-noite">
          {nome}
          {valor !== padrao ? (
            <span className="rounded-full bg-ambar/15 px-2 py-0.5 text-[10px] font-semibold text-ambar">Alterado</span>
          ) : (
            <span className="rounded-full bg-cinza-claro px-2 py-0.5 text-[10px] font-semibold text-cinza-medio">Padrão</span>
          )}
          {valor !== salvo && (
            <span className="rounded-full bg-azul-petroleo/10 px-2 py-0.5 text-[10px] font-semibold text-azul-petroleo">
              Não salvo
            </span>
          )}
        </p>
        <p className="text-xs text-cinza-medio">{descricao}</p>
      </div>
      <div
        role="radiogroup"
        aria-label={`Nível de ${nome}`}
        className={`grid shrink-0 overflow-hidden rounded-md border border-cinza-claro ${acao ? "grid-cols-2" : "grid-cols-3"} sm:w-64`}
      >
        {opcoes.map((o) => {
          const permitido = !bloqueado && permitidos.includes(o.nivel);
          const ativo = valor === o.nivel;
          return (
            <button
              key={o.nivel}
              type="button"
              role="radio"
              aria-checked={ativo}
              data-chave={chave}
              data-nivel={o.nivel}
              disabled={desabilitado || !permitido}
              title={!permitido && !ativo ? explicacaoBloqueio || undefined : undefined}
              onClick={() => onTrocar(o.nivel)}
              className={`min-h-9 px-2 py-1.5 text-xs font-semibold transition-colors ${
                ativo
                  ? o.nivel === "sem_acesso"
                    ? "bg-vermelho text-branco"
                    : o.nivel === "ver"
                      ? "bg-azul-petroleo text-branco"
                      : "bg-verde text-branco"
                  : permitido
                    ? "bg-branco text-cinza hover:bg-off-white"
                    : "bg-off-white text-cinza-claro"
              } ${ativo && !permitido ? "opacity-70" : ""}`}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
