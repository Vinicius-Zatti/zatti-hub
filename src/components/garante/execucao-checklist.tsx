"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { concluirChecklistAction, registrarFotoAction, responderItemAction } from "@/app/(app)/garante/actions";
import type { ExecucaoCompleta, ItemSnapshot, RespostaExecucao } from "@/app/(app)/garante/dados";
import { DICA_GARANTE, itemCompleto, percentual, situacaoNaTela, textoMeta } from "@/lib/garante/regras";
import { CampoNumero } from "@/components/campo-numero";
import { DicaCalculo } from "@/components/dica-calculo";
import { CameraFoto } from "./camera-foto";
import { ESTILO_SITUACAO } from "./estilos";

function respondido(item: ItemSnapshot, r: RespostaExecucao | undefined): boolean {
  return itemCompleto(item, r && { ...r, temFoto: Boolean(r.fotoUrl || r.fotoRecebidaEm) });
}

export function ExecucaoChecklist({ execucao, podeEditar }: { execucao: ExecucaoCompleta; podeEditar: boolean }) {
  const router = useRouter();
  const [respostas, setRespostas] = useState(execucao.respostas);
  const [concluindo, startConcluir] = useTransition();
  const [mensagem, setMensagem] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const editavel = podeEditar && execucao.situacao === "em_andamento";
  const total = execucao.itens.length;
  const feitos = execucao.itens.filter((i) => respondido(i, respostas[i.id])).length;
  const situacao = situacaoNaTela(execucao.situacao === "concluida" ? "concluida" : "em_andamento", execucao.prazo, new Date());
  const prazoTexto = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(execucao.prazo));

  function atualizar(itemId: string, parcial: Partial<RespostaExecucao>) {
    const vazia: RespostaExecucao = {
      itemId,
      valorBool: null,
      valorNumero: null,
      valorTexto: null,
      naoSeAplica: false,
      justificativa: null,
      dentroMeta: null,
      fotoUrl: null,
      fotoRecebidaEm: null,
      respondidoPorNome: null,
    };
    setRespostas((atual) => ({ ...atual, [itemId]: { ...vazia, ...atual[itemId], ...parcial } }));
  }

  function concluir() {
    setMensagem(null);
    startConcluir(async () => {
      const r = await concluirChecklistAction(execucao.id);
      if ("erro" in r) {
        setMensagem({ tom: "erro", texto: r.erro });
        return;
      }
      if (r.faltam > 0) {
        setMensagem({ tom: "erro", texto: `Faltam ${r.faltam} ${r.faltam === 1 ? "item" : "itens"} (resposta ou foto obrigatória).` });
        return;
      }
      setMensagem({ tom: "ok", texto: "Checklist concluído." });
      router.refresh();
    });
  }


  return (
    // Preenchendo (botão fixo no rodapé): `data-modo-foco` esconde a barra inferior da Navegação V2.
    <div className="flex flex-col gap-4 pb-24" data-modo-foco={editavel ? "" : undefined}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 data-titulo-proprio className="font-display text-2xl font-bold text-azul-noite">{execucao.modeloNome}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_SITUACAO[situacao].classe}`}>
            {ESTILO_SITUACAO[situacao].texto}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-1 text-sm text-cinza-medio">
          Prazo {prazoTexto} · {feitos} de {total} itens feitos ({percentual(feitos, total)}%)
          <DicaCalculo rotulo="itens feitos" texto={DICA_GARANTE.progresso} />
          {execucao.concluidaEm &&
            ` · concluído ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(execucao.concluidaEm))}${execucao.concluidaPorNome ? ` por ${execucao.concluidaPorNome}` : ""}`}
        </p>
      </div>

      {!editavel && execucao.situacao === "em_andamento" && (
        <p className="rounded-md bg-cinza-claro/50 px-3 py-2 text-xs text-cinza">
          Só para consulta: este checklist é de outra pessoa ou a janela para mexer já acabou (fim do dia, ou a tolerância de atraso que a gestão definiu).
        </p>
      )}

      {execucao.itens.map((item, i) => {
        const cabecalho = item.grupo && item.grupo !== execucao.itens[i - 1]?.grupo ? item.grupo : null;
        return (
          <div key={item.id} className="flex flex-col gap-2">
            {cabecalho && <h2 className="mt-2 text-xs font-bold uppercase tracking-wide text-cinza-medio">{cabecalho}</h2>}
            <ItemResposta
              execucaoId={execucao.id}
              caminhoBase={`${execucao.unidadeId}/${execucao.id}/${item.id}`}
              item={item}
              resposta={respostas[item.id]}
              editavel={editavel}
              aoMudar={(parcial) => atualizar(item.id, parcial)}
            />
          </div>
        );
      })}

      {editavel && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cinza-claro bg-branco p-3 md:static md:border-0 md:bg-transparent md:p-0">
          {mensagem && (
            <p className={`mb-2 text-sm ${mensagem.tom === "erro" ? "text-vermelho" : "text-verde"}`}>{mensagem.texto}</p>
          )}
          <button
            type="button"
            onClick={concluir}
            disabled={concluindo}
            className="w-full rounded-md bg-azul-noite px-4 py-3 text-sm font-bold text-branco hover:bg-azul-petroleo disabled:opacity-60 md:w-auto"
          >
            {concluindo ? "Concluindo..." : `Concluir checklist (${feitos}/${total})`}
          </button>
        </div>
      )}
    </div>
  );
}

function ItemResposta({
  execucaoId,
  caminhoBase,
  item,
  resposta,
  editavel,
  aoMudar,
}: {
  execucaoId: string;
  caminhoBase: string;
  item: ItemSnapshot;
  resposta: RespostaExecucao | undefined;
  editavel: boolean;
  aoMudar: (parcial: Partial<RespostaExecucao>) => void;
}) {
  const [salvando, startSalvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [numero, setNumero] = useState<number | null>(resposta?.valorNumero ?? null);
  const [texto, setTexto] = useState(resposta?.valorTexto ?? "");
  const [naAberto, setNaAberto] = useState(false);
  const [motivo, setMotivo] = useState(resposta?.justificativa ?? "");
  const meta = textoMeta(item.tipo, item.meta_min, item.meta_max);
  const fora = resposta?.dentroMeta === false;
  const temFoto = Boolean(resposta?.fotoUrl || resposta?.fotoRecebidaEm);

  function salvar(r: Parameters<typeof responderItemAction>[2], otimista: Partial<RespostaExecucao>) {
    setErro(null);
    startSalvar(async () => {
      const res = await responderItemAction(execucaoId, item.id, r);
      if ("erro" in res) {
        setErro(res.erro);
        return;
      }
      aoMudar({ ...otimista, dentroMeta: r.naoSeAplica ? null : res.dentroMeta });
    });
  }

  return (
    <div className={`flex flex-col gap-2 rounded-lg border bg-branco p-3 ${fora ? "border-vermelho" : "border-cinza-claro"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-azul-noite">
          {item.titulo}
          {item.critico && <span className="ml-1 rounded bg-vermelho/10 px-1 text-[10px] font-bold uppercase text-vermelho">crítico</span>}
          {item.foto_obrigatoria && <span className="ml-1 rounded bg-ambar/15 px-1 text-[10px] font-bold uppercase text-ambar">foto</span>}
        </p>
        {resposta?.naoSeAplica && <span className="shrink-0 text-xs text-cinza-medio">não se aplica</span>}
      </div>
      {item.instrucao && <p className="text-xs text-cinza-medio">{item.instrucao}</p>}
      {meta && <p className={`text-xs ${fora ? "font-semibold text-vermelho" : "text-cinza-medio"}`}>{fora ? `Fora da meta (${meta})` : meta}</p>}

      {item.tipo === "check" && (
        <div className="flex gap-2">
          {[
            { v: true, t: "Feito" },
            { v: false, t: "Não feito" },
          ].map((op) => (
            <button
              key={op.t}
              type="button"
              disabled={!editavel || salvando}
              onClick={() => salvar({ valorBool: op.v }, { valorBool: op.v, naoSeAplica: false })}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                resposta?.valorBool === op.v && !resposta?.naoSeAplica
                  ? op.v
                    ? "border-verde bg-verde text-branco"
                    : "border-vermelho bg-vermelho text-branco"
                  : "border-cinza-claro text-cinza"
              }`}
            >
              {op.t}
            </button>
          ))}
        </div>
      )}

      {item.tipo === "numero" && (
        <div className="flex gap-2">
          {editavel ? (
            <CampoNumero value={numero} onChange={setNumero} decimais={1} className="w-full px-3 py-2 text-sm" />
          ) : (
            <span className="text-sm text-cinza">{numero === null ? "-" : numero.toLocaleString("pt-BR")}</span>
          )}
          {editavel && (
            <button
              type="button"
              disabled={salvando || numero === null}
              onClick={() => {
                if (numero !== null && Number.isFinite(numero)) salvar({ valorNumero: numero }, { valorNumero: numero, naoSeAplica: false });
              }}
              className="rounded-md bg-azul-noite px-3 py-2 text-xs font-semibold text-branco disabled:opacity-60"
            >
              Salvar
            </button>
          )}
        </div>
      )}

      {item.tipo === "estrelas" && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} estrelas`}
              disabled={!editavel || salvando}
              onClick={() => salvar({ valorNumero: n }, { valorNumero: n, naoSeAplica: false })}
              className={`h-10 w-10 rounded-md border text-lg disabled:opacity-60 ${
                (resposta?.valorNumero ?? 0) >= n && !resposta?.naoSeAplica ? "border-ambar bg-ambar/20 text-ambar" : "border-cinza-claro text-cinza-claro"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      )}

      {item.tipo === "texto" && (
        <div className="flex gap-2">
          <textarea
            value={texto}
            disabled={!editavel}
            maxLength={1000}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-cinza-claro px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!editavel || salvando || texto.trim() === ""}
            onClick={() => salvar({ valorTexto: texto }, { valorTexto: texto, naoSeAplica: false })}
            className="self-start rounded-md bg-azul-noite px-3 py-2 text-xs font-semibold text-branco disabled:opacity-60"
          >
            Salvar
          </button>
        </div>
      )}

      {(item.foto_obrigatoria || temFoto) && (
        <div className="flex items-center gap-3">
          {resposta?.fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resposta.fotoUrl} alt="Foto do item" className="h-20 w-20 rounded-md object-cover" />
          )}
          {temFoto && !resposta?.fotoUrl && <span className="text-xs text-verde">Foto enviada</span>}
          {editavel && (
            <button
              type="button"
              onClick={() => setCamera(true)}
              className="rounded-md border border-azul-petroleo px-3 py-2 text-xs font-semibold text-azul-petroleo"
            >
              {temFoto ? "Tirar outra foto" : "Tirar foto (obrigatória)"}
            </button>
          )}
          {resposta?.fotoRecebidaEm && (
            <span className="text-[11px] text-cinza-medio">
              recebida{" "}
              {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
                new Date(resposta.fotoRecebidaEm),
              )}
            </span>
          )}
        </div>
      )}

      {item.foto_obrigatoria && !temFoto && !resposta?.naoSeAplica && (
        <p className="text-xs font-semibold text-vermelho">Falta a foto: sem ela este item não conta como feito.</p>
      )}

      {editavel && item.permite_na && !item.critico && (
        <div>
          {!naAberto ? (
            <button type="button" onClick={() => setNaAberto(true)} className="text-xs text-cinza-medio underline">
              Não se aplica
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
                placeholder="Por que não se aplica?"
                className="w-full rounded-md border border-cinza-claro px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={salvando || motivo.trim().length < 3}
                onClick={() => {
                  salvar({ naoSeAplica: true, justificativa: motivo }, { naoSeAplica: true, justificativa: motivo, valorBool: null, valorNumero: null, valorTexto: null, fotoUrl: null, fotoRecebidaEm: null });
                  setNaAberto(false);
                }}
                className="rounded-md bg-cinza px-2 py-1 text-xs font-semibold text-branco disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          )}
        </div>
      )}
      {resposta?.naoSeAplica && resposta.justificativa && <p className="text-xs italic text-cinza-medio">Motivo: {resposta.justificativa}</p>}
      {resposta?.respondidoPorNome && !editavel && <p className="text-[11px] text-cinza-medio">por {resposta.respondidoPorNome}</p>}
      {erro && <p className="text-xs text-vermelho">{erro}</p>}

      {camera && (
        <CameraFoto
          caminhoBase={caminhoBase}
          aoFechar={() => setCamera(false)}
          aoEnviar={async (caminho) => {
            const r = await registrarFotoAction(execucaoId, item.id, caminho);
            if ("erro" in r) return r.erro;
            aoMudar({ fotoRecebidaEm: new Date().toISOString(), naoSeAplica: false, justificativa: null });
            return null;
          }}
        />
      )}
    </div>
  );
}
