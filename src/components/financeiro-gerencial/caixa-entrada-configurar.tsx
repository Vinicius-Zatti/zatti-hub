"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { configurarAlertaAction, configurarCaixaAction } from "@/app/(app)/financeiro-gerencial/caixa-entrada/actions";
import type { ConfigCaixa, DestinatarioAlerta } from "@/lib/banco/caixa-entrada";

type Resposta = { ok: boolean; mensagem: string };

const CAMPO = "w-full rounded-md border border-cinza-claro px-2 py-1.5 text-sm text-cinza";

/** Seção "Configurar" da Caixa de Entrada (só Gestão/master): números autorizados no WhatsApp,
 * pasta do Google Drive e quem recebe o alerta diário de contas a pagar. */
export function CaixaEntradaConfigurar({ config, alertas }: { config: ConfigCaixa; alertas: DestinatarioAlerta[] }) {
  const [aberta, setAberta] = useState(false);
  return (
    <section className="rounded-lg border border-cinza-claro bg-branco">
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-display text-lg font-bold text-azul-noite">Configurar</span>
        <span className="text-xs font-semibold text-azul-petroleo">{aberta ? "Fechar" : "Abrir"}</span>
      </button>
      {aberta && (
        <div className="grid gap-4 border-t border-cinza-claro p-4 lg:grid-cols-3">
          <ListaTelefones
            titulo="WhatsApp autorizado a mandar documentos"
            explicacao="Quem estiver nesta lista pode mandar foto, PDF ou XML da nota para o WhatsApp do Vinícius (Vini). O documento cai aqui na Caixa de Entrada desta unidade, já lido. Mensagem de número fora da lista é ignorada."
            itens={config.remetentes}
            adicionar={(nome, telefone) => configurarCaixaAction({ acao: "adicionar_remetente", nome, telefone })}
            remover={(id) => configurarCaixaAction({ acao: "remover_remetente", id })}
          />
          <PastaDrive pasta={config.pasta} />
          <ListaTelefones
            titulo="Alerta diário das 8h"
            explicacao="Todo dia às 8h estes números recebem no WhatsApp as contas a pagar vencidas e do dia."
            itens={alertas}
            adicionar={(nome, telefone) => configurarAlertaAction({ acao: "adicionar", nome, telefone })}
            remover={(id) => configurarAlertaAction({ acao: "remover", id })}
          />
        </div>
      )}
    </section>
  );
}

function ListaTelefones({
  titulo,
  explicacao,
  itens,
  adicionar,
  remover,
}: {
  titulo: string;
  explicacao: string;
  itens: { id: string; nome: string; telefone: string }[];
  adicionar: (nome: string, telefone: string) => Promise<Resposta>;
  remover: (id: string) => Promise<Resposta>;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState<Resposta | null>(null);
  const [isPending, startTransition] = useTransition();

  function executar(acao: () => Promise<Resposta>, limpar: boolean) {
    setMensagem(null);
    startTransition(async () => {
      const r = await acao();
      setMensagem(r);
      if (r.ok) {
        if (limpar) {
          setNome("");
          setTelefone("");
        }
        router.refresh();
      }
    });
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    executar(() => adicionar(nome.trim(), telefone.trim()), true);
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-azul-noite">{titulo}</h3>
      <p className="text-xs text-cinza-medio">{explicacao}</p>
      <ul className="flex flex-col gap-1">
        {itens.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 rounded-md bg-off-white px-2 py-1.5 text-sm">
            <span className="truncate" title={`${i.nome} - ${i.telefone}`}>
              {i.nome} <span className="text-xs text-cinza-medio">{i.telefone}</span>
            </span>
            <button
              type="button"
              onClick={() => executar(() => remover(i.id), false)}
              disabled={isPending}
              className="shrink-0 text-xs font-semibold text-vermelho disabled:opacity-50"
            >
              Remover
            </button>
          </li>
        ))}
        {itens.length === 0 && <li className="text-xs text-cinza-medio">Nenhum número cadastrado.</li>}
      </ul>
      <form onSubmit={enviar} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Nome" aria-label="Nome" className={CAMPO} />
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            maxLength={20}
            inputMode="tel"
            placeholder="(31) 99999-9999"
            aria-label="Telefone com DDD"
            className={CAMPO}
          />
        </div>
        <button
          type="submit"
          disabled={isPending || nome.trim() === "" || telefone.replace(/\D/g, "").length < 10}
          className="self-start rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "+ Adicionar"}
        </button>
      </form>
      {mensagem && <p className={`text-xs ${mensagem.ok ? "text-verde" : "text-vermelho"}`}>{mensagem.mensagem}</p>}
    </div>
  );
}

function PastaDrive({ pasta }: { pasta: ConfigCaixa["pasta"] }) {
  const router = useRouter();
  const [email, setEmail] = useState(pasta?.emailCompartilhar ?? "");
  const [mensagem, setMensagem] = useState<Resposta | null>(null);
  const [isPending, startTransition] = useTransition();

  function executar(input: Record<string, unknown>) {
    setMensagem(null);
    startTransition(async () => {
      const r = await configurarCaixaAction(input);
      setMensagem(r);
      if (r.ok) router.refresh();
    });
  }

  const situacao = pasta?.situacao ?? "desligada";

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-azul-noite">Pasta do Google Drive</h3>
      <p className="text-xs text-cinza-medio">
        Uma pasta no Drive onde a equipe solta notas e boletos. A cada poucos minutos o Vini lê o que entrou e traz para cá.
      </p>
      {situacao === "ativa" && (
        <div className="flex flex-col gap-2 rounded-md bg-verde/10 p-2 text-sm">
          <span className="font-semibold text-verde">Pasta ativa</span>
          {pasta?.link ? (
            <a href={pasta.link} target="_blank" rel="noopener noreferrer" className="break-all text-xs font-semibold text-azul-petroleo underline">
              Abrir a pasta no Drive
            </a>
          ) : (
            <span className="text-xs text-cinza-medio">Link ainda não informado.</span>
          )}
          {pasta?.emailCompartilhar && <span className="text-xs text-cinza-medio">Compartilhada com {pasta.emailCompartilhar}</span>}
          <button
            type="button"
            onClick={() => executar({ acao: "desligar_pasta" })}
            disabled={isPending}
            className="self-start rounded-md border border-vermelho px-3 py-1.5 text-xs font-semibold text-vermelho disabled:opacity-50"
          >
            Desligar leitura da pasta
          </button>
        </div>
      )}
      {situacao === "solicitada" && (
        <div className="flex flex-col gap-2 rounded-md bg-ambar/10 p-2 text-sm">
          <span className="font-semibold text-azul-noite">Pasta pedida, aguardando o Vini criar</span>
          <span className="text-xs text-cinza-medio">Em até 3 minutos o link aparece aqui.</span>
          <button
            type="button"
            onClick={() => executar({ acao: "desligar_pasta" })}
            disabled={isPending}
            className="self-start text-xs font-semibold text-vermelho disabled:opacity-50"
          >
            Cancelar pedido
          </button>
        </div>
      )}
      {situacao === "desligada" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            executar({ acao: "solicitar_pasta", email: email.trim() });
          }}
          className="flex flex-col gap-2"
        >
          <label className="flex flex-col gap-1 text-xs font-semibold text-cinza-medio">
            E-mail para compartilhar a pasta (opcional)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} className={CAMPO} />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded-md bg-azul-noite px-3 py-1.5 text-xs font-bold text-branco disabled:opacity-50"
          >
            {isPending ? "Pedindo..." : "Pedir pasta"}
          </button>
        </form>
      )}
      {mensagem && <p className={`text-xs ${mensagem.ok ? "text-verde" : "text-vermelho"}`}>{mensagem.mensagem}</p>}
    </div>
  );
}
