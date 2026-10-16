"use client";

import { useEffect, useState } from "react";
import { acaoOperacaoAction } from "@/app/(app)/escritorio/operacao/actions";
import { Campo, Selo, Vazio, classeBotao, classeBotaoLeve, classeCampo, useAcao } from "@/components/clientes/ui";
import { ModalFlutuante } from "@/components/modal-flutuante";
import { dataHoraBr, diaBr, rotuloSelo } from "@/lib/operacao/quadro";
import { COLUNAS, ROTULO_COLUNA, ROTULO_LADO, type AcaoItem, type Coluna, type ItemOperacao } from "@/lib/operacao/tipos";

/** Ficha do cartão por cima do quadro. Mostra o detalhe de cada tipo e só os
 * botões que o Vini mandou em `acoes`, com rótulo que diz o efeito. O que
 * envia ao cliente pede um segundo clique aqui dentro (sem window.confirm). */

const ENVIA_AO_CLIENTE: AcaoItem[] = ["aprovar", "enviar_texto"];

function rotuloAcao(acao: AcaoItem, item: ItemOperacao): string {
  if (acao === "aprovar") {
    if (item.tipo === "acao") return "Aprovar e executar a ação";
    if (item.tipo === "alerta") return "Aprovar (o Vini executa o que o alerta propõe)";
    if (item.tipo === "pauta") return "Aprovar e enviar a pauta ao cliente";
    return "Aprovar e enviar ao cliente";
  }
  return {
    aprovar_sem_enviar: "Só aprovar, sem enviar ao cliente",
    recusar: "Recusar (nada é enviado)",
    enviar_texto: "Enviar meu texto ao cliente",
    resolver: "Marcar como resolvido",
    nao_demanda: "Não é demanda (tirar do quadro)",
  }[acao];
}

/** Texto que vai ao cliente e pode ser editado: resposta sugerida (demanda) ou mensagem da ata. */
function textoEditavelOriginal(item: ItemOperacao): string | null {
  const d = item.detalhe;
  if (d.tipo === "demanda") return d.resposta?.texto ?? (item.acoes.includes("enviar_texto") ? "" : null);
  if (d.tipo === "ata") return d.mensagem;
  return null;
}

export function FichaItemOperacao({ item, aoFechar }: { item: ItemOperacao; aoFechar: () => void }) {
  const { pendente, erro, executar } = useAcao();
  const original = textoEditavelOriginal(item);
  const [texto, setTexto] = useState(original ?? "");
  const [nota, setNota] = useState(item.nota);
  const [notaSalva, setNotaSalva] = useState(false);
  const [confirmando, setConfirmando] = useState<AcaoItem | null>(null);
  const [destino, setDestino] = useState<Coluna>(item.coluna);
  const editado = original != null && texto.trim() !== original.trim();
  const temEnviarTexto = item.acoes.includes("enviar_texto");

  useEffect(() => {
    // Captura: o Esc fecha a ficha e não chega ao quadro em tela cheia atrás dela.
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      aoFechar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);

  function rodar(acao: AcaoItem) {
    const corpo: { chave: string; acao: AcaoItem; texto?: string } = { chave: item.chave, acao };
    if (acao === "enviar_texto") corpo.texto = texto.trim();
    // Ata sem "enviar_texto": a mensagem editada segue junto do aprovar.
    if (acao === "aprovar" && editado && !temEnviarTexto) corpo.texto = texto.trim();
    setConfirmando(null);
    executar(() => acaoOperacaoAction(corpo), aoFechar);
  }

  function bloqueio(acao: AcaoItem): string | null {
    if (acao === "aprovar" && editado && temEnviarTexto) return "Você mudou o texto: use Enviar meu texto ao cliente.";
    if (acao === "enviar_texto" && !texto.trim()) return "Escreva o texto antes de enviar.";
    if (acao === "enviar_texto" && original && !editado) return "O texto é igual à sugestão: use Aprovar e enviar ao cliente.";
    return null;
  }

  const canal = "canalNome" in item.detalhe ? item.detalhe.canalNome : null;

  return (
    <ModalFlutuante aberto onFechar={aoFechar} larga>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Selo tom={item.tipo === "alerta" ? "critico" : "atencao"}>{rotuloSelo(item)}</Selo>
            <span className="text-xs font-semibold text-cinza-medio">{item.codigo}</span>
            <Selo>{ROTULO_COLUNA[item.coluna]}</Selo>
          </span>
          <h2 className="font-display text-lg font-bold text-azul-noite">{item.titulo || item.codigo}</h2>
          {(item.sigla || item.cliente) && <p className="text-sm text-azul-petroleo">{[item.sigla, item.cliente].filter(Boolean).join(" - ")}</p>}
          {item.criadoEm && <p className="text-xs text-cinza-medio">Criado em {dataHoraBr(item.criadoEm)}</p>}
        </header>

        <Detalhe item={item} />

        {original != null && (
          <Campo
            rotulo={item.tipo === "demanda" ? "Resposta ao cliente" : "Mensagem ao cliente"}
            dica={canal ? `Vai para: ${canal}. Nada sai sem o seu clique.` : "Nada sai sem o seu clique."}
          >
            <textarea className={`${classeCampo} min-h-32`} value={texto} maxLength={4000} onChange={(e) => setTexto(e.target.value)} />
          </Campo>
        )}

        {erro && <p className="rounded-md bg-vermelho/10 px-3 py-2 text-sm text-vermelho">{erro}</p>}

        {confirmando ? (
          <div className="flex flex-col gap-2 rounded-lg border border-ambar bg-ambar/10 p-3">
            <p className="text-sm font-semibold text-azul-noite">
              {confirmando === "aprovar" && (item.tipo === "acao" || item.tipo === "alerta")
                ? "Confirma? O Vini executa agora o que foi proposto."
                : `Confirma? A mensagem sai agora para ${canal ?? "o cliente"}.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={classeBotao} disabled={pendente} onClick={() => rodar(confirmando)}>
                {pendente ? "Enviando..." : "Sim, confirmar"}
              </button>
              <button type="button" className={classeBotaoLeve} onClick={() => setConfirmando(null)}>
                Voltar sem enviar
              </button>
            </div>
          </div>
        ) : (
          item.acoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.acoes.map((acao) => {
                const motivo = bloqueio(acao);
                const principal = ENVIA_AO_CLIENTE.includes(acao);
                return (
                  <button
                    key={acao}
                    type="button"
                    disabled={pendente || motivo != null}
                    title={motivo ?? undefined}
                    className={principal ? classeBotao : `${classeBotaoLeve} disabled:opacity-50`}
                    onClick={() => (principal ? setConfirmando(acao) : rodar(acao))}
                  >
                    {rotuloAcao(acao, item)}
                  </button>
                );
              })}
            </div>
          )
        )}

        <div className="grid gap-3 border-t border-cinza-claro pt-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Campo rotulo="Mover para a coluna" dica="Mover à mão vale até o cartão ser encerrado. Resolvida = marcar como resolvido.">
              <select className={classeCampo} value={destino} onChange={(e) => setDestino(e.target.value as Coluna)}>
                {COLUNAS.map((c) => (
                  <option key={c} value={c}>{ROTULO_COLUNA[c]}</option>
                ))}
              </select>
            </Campo>
            <button
              type="button"
              className={`${classeBotaoLeve} disabled:opacity-50`}
              disabled={pendente || destino === item.coluna}
              onClick={() =>
                executar(
                  () => acaoOperacaoAction(destino === "resolvida" ? { chave: item.chave, acao: "resolver" } : { chave: item.chave, acao: "coluna", coluna: destino }),
                  aoFechar,
                )
              }
            >
              Mover para {ROTULO_COLUNA[destino]}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <Campo rotulo="Nota (só para você)" dica={notaSalva ? "Nota salva." : "Fica no Vini, junto do cartão. Não vai ao cliente."}>
              <textarea
                className={`${classeCampo} min-h-20`}
                value={nota}
                maxLength={1000}
                onChange={(e) => {
                  setNota(e.target.value);
                  setNotaSalva(false);
                }}
              />
            </Campo>
            <button
              type="button"
              className={`${classeBotaoLeve} disabled:opacity-50`}
              disabled={pendente || nota.trim() === item.nota.trim()}
              onClick={() => executar(() => acaoOperacaoAction({ chave: item.chave, acao: "nota", texto: nota.trim() }), () => setNotaSalva(true))}
            >
              Salvar nota
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={aoFechar} className={classeBotaoLeve}>
            Fechar
          </button>
        </div>
      </div>
    </ModalFlutuante>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-bold uppercase tracking-wide text-cinza-medio">{titulo}</h3>
      {children}
    </section>
  );
}

function TextoCorrido({ texto }: { texto: string }) {
  return texto.trim() ? <p className="whitespace-pre-wrap text-sm text-azul-noite">{texto}</p> : <Vazio>Sem texto.</Vazio>;
}

function Detalhe({ item }: { item: ItemOperacao }) {
  const d = item.detalhe;
  if (d.tipo === "demanda") {
    return (
      <>
        <p className="text-xs text-cinza-medio">
          {[d.autor && `De ${d.autor}`, d.canalNome && `em ${d.canalNome}`, d.area && `área: ${d.area}`].filter(Boolean).join(", ")}
        </p>
        <Bloco titulo="Mensagens">
          {d.mensagens.length === 0 ? (
            <Vazio>Sem mensagens guardadas.</Vazio>
          ) : (
            <ol className="flex max-h-72 flex-col gap-2 overflow-auto rounded-lg border border-cinza-claro bg-branco p-2">
              {d.mensagens.map((m, i) => (
                <li key={i} className={`rounded-md px-3 py-2 text-sm ${m.equipe ? "ml-6 bg-azul-noite/5" : "mr-6 bg-ambar/10"}`}>
                  <span className="block text-xs font-semibold text-cinza-medio">
                    {m.autor || (m.equipe ? "Equipe" : "Cliente")}
                    {m.em ? ` - ${dataHoraBr(m.em)}` : ""}
                  </span>
                  <span className="whitespace-pre-wrap text-azul-noite">{m.texto}</span>
                </li>
              ))}
            </ol>
          )}
        </Bloco>
        {d.resposta && (
          <p className="text-xs text-cinza-medio">
            Resposta sugerida: {d.resposta.situacao || "sem situação"}
            {d.resposta.vez != null ? `, versão ${d.resposta.vez}` : ""}
            {d.resposta.motivo ? `. Motivo: ${d.resposta.motivo}` : ""}
          </p>
        )}
      </>
    );
  }
  if (d.tipo === "ata") {
    return (
      <>
        {d.reuniaoEm && <p className="text-xs text-cinza-medio">Reunião de {diaBr(d.reuniaoEm)}</p>}
        <Bloco titulo="Resumo">
          <TextoCorrido texto={d.resumo} />
        </Bloco>
        <Bloco titulo="Decisões">
          {d.decisoes.length === 0 ? (
            <Vazio>Nenhuma decisão registrada.</Vazio>
          ) : (
            <ul className="list-disc pl-5 text-sm text-azul-noite">
              {d.decisoes.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
        </Bloco>
        <Bloco titulo="Tarefas">
          {d.tarefas.length === 0 ? (
            <Vazio>Nenhuma tarefa.</Vazio>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-azul-noite">
              {d.tarefas.map((t, i) => (
                <li key={i} className="rounded-md border border-cinza-claro bg-branco px-3 py-2">
                  <span className="block">{t.tarefa}</span>
                  <span className="text-xs text-cinza-medio">
                    {[t.responsavel, ROTULO_LADO[t.lado], t.prazo && `prazo: ${t.prazo}`].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </>
    );
  }
  if (d.tipo === "pauta") {
    return (
      <>
        <p className="text-xs text-cinza-medio">
          {[d.reuniaoEm && `Reunião de ${diaBr(d.reuniaoEm)}`, d.canalNome && `vai para ${d.canalNome}`].filter(Boolean).join(", ")}
        </p>
        <Bloco titulo="Pauta">
          <TextoCorrido texto={d.mensagem} />
        </Bloco>
      </>
    );
  }
  return (
    <Bloco titulo={item.tipo === "acao" ? "Ação proposta" : "Alerta"}>
      <TextoCorrido texto={d.texto} />
    </Bloco>
  );
}
