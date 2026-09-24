"use client";

import { useState } from "react";
import { salvarVisaoGeralAction } from "@/app/(app)/escritorio/clientes/actions";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { ROTULO_ETAPA, ROTULO_SAUDE, SAUDES, type Acompanhamento, type ItemCliente, type Saude } from "@/lib/clientes/tipos";
import { Campo, ModalFormulario, Secao, Vazio, classeBotaoLeve, classeCampo, useAcao } from "./ui";

export type DadosVisaoGeral = {
  acompanhamento: Acompanhamento;
  progresso: number;
  proximaReuniao: string;
  riscos: ItemCliente[];
  esperandoCliente: ItemCliente[];
  esperandoVinicius: ItemCliente[];
  alertas: string[];
};

function ListaTarefas({ itens }: { itens: ItemCliente[] }) {
  if (!itens.length) return <Vazio>Nada pendente.</Vazio>;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {itens.map((t) => (
        <li key={t.id}>
          {t.texto}
          {t.prazo && <span className="text-xs text-cinza-medio"> - até {formatarDataBr(t.prazo)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function VisaoGeral({ dados }: { dados: DadosVisaoGeral }) {
  const a = dados.acompanhamento;
  const [aberto, setAberto] = useState(false);
  const { pendente, erro, setErro, executar } = useAcao();
  const [form, setForm] = useState({
    objetivoContratado: a.objetivoContratado,
    metaPrincipal: a.metaPrincipal,
    saude: a.saude,
    prioridades: [0, 1, 2].map((i) => a.prioridades[i] ?? ""),
    proximoMarco: a.proximoMarco,
    proximoMarcoData: a.proximoMarcoData ?? "",
    pessoas: a.pessoas.map((p) => `${p.nome}${p.papel ? ` - ${p.papel}` : ""}`).join("\n"),
    termoCalendario: a.termoCalendario,
    cadenciaReunioes: a.cadenciaReunioes,
  });

  function salvar() {
    const pessoas = form.pessoas
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [nome, ...papel] = l.split(" - ");
        return { nome: nome.trim(), papel: papel.join(" - ").trim() };
      });
    executar(
      () =>
        salvarVisaoGeralAction({
          acompanhamentoId: a.id,
          ...form,
          prioridades: form.prioridades.map((p) => p.trim()).filter(Boolean),
          proximoMarcoData: form.proximoMarcoData || null,
          pessoas,
        }),
      () => setAberto(false),
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Secao
        titulo="Contrato e meta"
        acao={
          <button type="button" className={classeBotaoLeve} onClick={() => { setErro(null); setAberto(true); }}>
            Editar
          </button>
        }
      >
        <dl className="grid gap-2 text-sm">
          <div><dt className="text-xs text-cinza-medio">Objetivo contratado</dt><dd>{a.objetivoContratado || "Não registrado"}</dd></div>
          <div><dt className="text-xs text-cinza-medio">Meta principal</dt><dd>{a.metaPrincipal || "Não definida"}</dd></div>
          <div><dt className="text-xs text-cinza-medio">Fase atual</dt><dd>{ROTULO_ETAPA[a.etapaAtual]} - {dados.progresso}% da jornada</dd></div>
          <div><dt className="text-xs text-cinza-medio">Próxima reunião (Google Calendar)</dt><dd>{dados.proximaReuniao}</dd></div>
          <div><dt className="text-xs text-cinza-medio">Cadência de reuniões</dt><dd>{a.cadenciaReunioes || "Não definida"}</dd></div>
          <div>
            <dt className="text-xs text-cinza-medio">Próximo marco</dt>
            <dd>{a.proximoMarco || "Não definido"}{a.proximoMarcoData && ` - ${formatarDataBr(a.proximoMarcoData)}`}</dd>
          </div>
        </dl>
      </Secao>

      <Secao titulo="Pessoas envolvidas">
        {a.pessoas.length ? (
          <ul className="text-sm">{a.pessoas.map((p) => <li key={p.nome}>{p.nome}{p.papel && <span className="text-cinza-medio"> - {p.papel}</span>}</li>)}</ul>
        ) : (
          <Vazio>Ninguém registrado.</Vazio>
        )}
      </Secao>

      <Secao titulo="Três prioridades">
        {a.prioridades.length ? (
          <ol className="list-decimal pl-5 text-sm">{a.prioridades.map((p) => <li key={p}>{p}</li>)}</ol>
        ) : (
          <Vazio>Sem prioridade definida.</Vazio>
        )}
      </Secao>

      <Secao titulo="Riscos e alertas">
        {dados.riscos.length === 0 && dados.alertas.length === 0 ? (
          <Vazio>Nenhum risco aberto.</Vazio>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {dados.alertas.map((al) => <li key={al} className="text-vermelho">{al}</li>)}
          </ul>
        )}
      </Secao>

      <Secao titulo="Esperando o cliente"><ListaTarefas itens={dados.esperandoCliente} /></Secao>
      <Secao titulo="Esperando Vinícius"><ListaTarefas itens={dados.esperandoVinicius} /></Secao>

      <ModalFormulario aberto={aberto} titulo="Editar visão geral" onFechar={() => setAberto(false)} onSalvar={salvar} pendente={pendente} erro={erro}>
        <Campo rotulo="Objetivo contratado">
          <textarea className={classeCampo} rows={2} value={form.objetivoContratado} onChange={(e) => setForm({ ...form, objetivoContratado: e.target.value })} />
        </Campo>
        <Campo rotulo="Meta principal">
          <textarea className={classeCampo} rows={2} value={form.metaPrincipal} onChange={(e) => setForm({ ...form, metaPrincipal: e.target.value })} />
        </Campo>
        <Campo rotulo="Saúde" dica="Avaliação de quem acompanha. Os alertas são calculados à parte.">
          <select className={classeCampo} value={form.saude} onChange={(e) => setForm({ ...form, saude: e.target.value as Saude })}>
            {SAUDES.map((s) => <option key={s} value={s}>{ROTULO_SAUDE[s]}</option>)}
          </select>
        </Campo>
        {form.prioridades.map((p, i) => (
          <Campo key={i} rotulo={`Prioridade ${i + 1}`}>
            <input className={classeCampo} value={p} onChange={(e) => setForm({ ...form, prioridades: form.prioridades.map((x, j) => (j === i ? e.target.value : x)) })} />
          </Campo>
        ))}
        <Campo rotulo="Próximo marco">
          <input className={classeCampo} value={form.proximoMarco} onChange={(e) => setForm({ ...form, proximoMarco: e.target.value })} />
        </Campo>
        <Campo rotulo="Data do próximo marco">
          <input type="date" className={classeCampo} value={form.proximoMarcoData} onChange={(e) => setForm({ ...form, proximoMarcoData: e.target.value })} />
        </Campo>
        <Campo rotulo="Pessoas envolvidas" dica="Uma por linha: Nome - papel. Sem telefone ou documento.">
          <textarea className={classeCampo} rows={3} value={form.pessoas} onChange={(e) => setForm({ ...form, pessoas: e.target.value })} />
        </Campo>
        <Campo rotulo="Termo no Google Calendar" dica='Palavra do título da reunião, ex.: "The House".'>
          <input className={classeCampo} value={form.termoCalendario} onChange={(e) => setForm({ ...form, termoCalendario: e.target.value })} />
        </Campo>
        <Campo rotulo="Cadência de reuniões">
          <input className={classeCampo} value={form.cadenciaReunioes} onChange={(e) => setForm({ ...form, cadenciaReunioes: e.target.value })} />
        </Campo>
      </ModalFormulario>
    </div>
  );
}
