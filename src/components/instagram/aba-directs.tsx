"use client";

import { useState } from "react";
import { automacaoInstagramAction, palavraInstagramAction } from "@/app/(app)/escritorio/instagram/actions";
import { Campo, ModalFormulario, Secao, Selo, Vazio, classeBotao, classeCampo, useAcao } from "@/components/clientes/ui";
import { CartaoNumero } from "@/components/instagram/cartao-numero";
import { horaEnvio, notaRegistro, numeroBr, seloAutomacao, tempoResposta } from "@/lib/instagram/painel";
import type { Automacao, PalavraDirect } from "@/lib/instagram/tipos";

/** Aba "Directs": quem comenta a palavra recebe o Direct sozinho. Liga/desliga
 * por post e cria automação nova; o Vini é quem grava e envia. */
export function AbaDirects({ automacao, hoje, agoraMs }: { automacao: Automacao; hoje: string; agoraMs: number }) {
  const selo = seloAutomacao(automacao, agoraMs);
  const ativas = automacao.palavras.filter((p) => p.ativa).length;
  const nota = notaRegistro(automacao.registroDesde, hoje);
  const [novaAberta, setNovaAberta] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-cinza">Comentou a palavra, recebe o Direct com o link na hora.</p>
        <Selo tom={selo.tom}>{selo.texto}</Selo>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoNumero
          rotulo="Directs hoje"
          valor={numeroBr(automacao.enviosHoje)}
          dica="Quantos Directs automáticos saíram hoje, contando de 00h00 a agora no horário de São Paulo."
        />
        <CartaoNumero
          rotulo="Tempo de resposta"
          valor={tempoResposta(automacao.tempoRespostaSeg)}
          dica="Mediana de hoje: tempo entre o comentário e o Direct enviado, olhando todos os envios de hoje. Metade saiu mais rápido que isso, metade mais devagar. Sem envio hoje, fica sem dado."
        />
        <CartaoNumero
          rotulo="Palavras ativas"
          valor={String(ativas)}
          dica="Quantos posts estão com o Direct automático ligado agora, de todos os que aparecem na lista abaixo."
        />
      </div>
      {nota && <p className="text-xs text-cinza-medio">{nota}</p>}

      <Secao
        titulo="Palavra e entrega"
        acao={
          <button type="button" className={classeBotao} onClick={() => setNovaAberta(true)} title="Abre o formulário para criar um Direct automático num post">
            Nova automação
          </button>
        }
      >
        {automacao.palavras.length === 0 ? (
          <Vazio>Nenhum post com Direct automático ainda.</Vazio>
        ) : (
          <ul className="divide-y divide-cinza-claro">
            {automacao.palavras.map((p) => (
              <LinhaPalavra key={p.codigo} palavra={p} />
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Últimos envios">
        {automacao.ultimos.length === 0 ? (
          <Vazio>Nenhum Direct enviado ainda.</Vazio>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {automacao.ultimos.map((u, i) => (
              <li key={`${u.em}-${u.usuario}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-cinza-medio">{horaEnvio(u.em, hoje)}</span>
                <span className="min-w-0 truncate text-azul-noite" title={`@${u.usuario}`}>
                  @{u.usuario}
                </span>
                <span className="text-cinza-medio">comentou</span>
                <span className="font-bold uppercase text-azul-petroleo">{u.palavra ?? "qualquer comentário"}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <NovaAutomacao aberta={novaAberta} aoFechar={() => setNovaAberta(false)} />
    </div>
  );
}

function LinhaPalavra({ palavra: p }: { palavra: PalavraDirect }) {
  const { pendente, erro, executar } = useAcao();

  function alternar() {
    if (p.ativa && !window.confirm(`Desligar o Direct automático de "${p.palavra ?? "qualquer comentário"}"? Quem comentar depois disso não recebe o Direct.`)) return;
    executar(() => palavraInstagramAction({ codigo: p.codigo, ativa: !p.ativa }));
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="shrink-0 rounded-md bg-ambar/20 px-2 py-1 text-xs font-bold uppercase text-azul-noite">{p.palavra ?? "qualquer comentário"}</span>
      <div className="min-w-0 flex-1">
        <a href={p.link} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-azul-noite hover:underline" title={p.post || p.link}>
          {p.post || `Post ${p.codigo}`}
        </a>
        <p className="truncate text-xs text-cinza-medio">
          {p.envios == null ? "envios: sem dado" : `${numeroBr(p.envios)} envio${p.envios === 1 ? "" : "s"}`}
          {p.linkEntrega && (
            <>
              {" · "}
              <a href={p.linkEntrega} target="_blank" rel="noopener noreferrer" className="hover:underline" title={p.linkEntrega}>
                link de entrega
              </a>
            </>
          )}
          {p.origem === "hub" && " · criada no Hub"}
        </p>
        {erro && <p className="text-xs text-vermelho">{erro}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={p.ativa}
        aria-label={`Direct automático de ${p.palavra ?? "qualquer comentário"}`}
        title={p.ativa ? "Ligado: toque para parar de mandar o Direct neste post" : "Desligado: toque para voltar a mandar o Direct neste post"}
        disabled={pendente}
        onClick={alternar}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${p.ativa ? "bg-verde" : "bg-cinza-claro"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-branco shadow transition-all ${p.ativa ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </li>
  );
}

const VAZIO = { link: "", palavra: "", direct: "", linkEntrega: "" };

function NovaAutomacao({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const [form, setForm] = useState(VAZIO);
  const { pendente, erro, setErro, executar } = useAcao();
  const mudar = (campo: keyof typeof VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function fechar() {
    setErro(null);
    aoFechar();
  }

  return (
    <ModalFormulario
      aberto={aberta}
      titulo="Nova automação"
      onFechar={fechar}
      pendente={pendente}
      erro={erro}
      rotuloSalvar="Criar e ligar"
      onSalvar={() =>
        executar(
          () => automacaoInstagramAction({ ...form, linkEntrega: form.linkEntrega.trim() || null }),
          () => {
            setForm(VAZIO);
            aoFechar();
          },
        )
      }
    >
      <p className="text-sm text-cinza">
        O texto escrito aqui já vale como aprovado e entra no ar em até 2 minutos. Quem comentar a palavra recebe o Direct e vira lead no CRM.
      </p>
      <Campo rotulo="Link do post">
        <input className={classeCampo} type="url" inputMode="url" required placeholder="https://www.instagram.com/reel/..." value={form.link} onChange={mudar("link")} />
      </Campo>
      <Campo rotulo="Palavra" dica="2 a 30 letras ou números, sem espaço. Ex.: cardapio">
        <input className={classeCampo} required minLength={2} maxLength={30} pattern="[^\s]{2,30}" value={form.palavra} onChange={mudar("palavra")} />
      </Campo>
      <Campo rotulo="Texto do Direct" dica={`${form.direct.trim().length} de 900 caracteres`}>
        <textarea className={classeCampo} required minLength={5} maxLength={900} rows={5} value={form.direct} onChange={mudar("direct")} />
      </Campo>
      <Campo rotulo="Link de entrega (opcional)" dica="Vai no fim do Direct. Só https://">
        <input className={classeCampo} type="url" inputMode="url" placeholder="https://..." value={form.linkEntrega} onChange={mudar("linkEntrega")} />
      </Campo>
    </ModalFormulario>
  );
}
