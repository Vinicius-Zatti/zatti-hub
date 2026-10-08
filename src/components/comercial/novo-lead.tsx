"use client";

import { useState } from "react";
import { criarLeadAction } from "@/app/(app)/escritorio/comercial/actions";
import { CampoNumero } from "@/components/campo-numero";
import { Campo, ModalFormulario, classeBotao, classeCampo, useAcao } from "@/components/clientes/ui";
import {
  ORIGENS,
  ROTULO_DELIVERY,
  ROTULO_ORIGEM,
  VENDE_DELIVERY,
  type Origem,
  type VendeDelivery,
} from "@/lib/comercial/funil";

const VAZIO = {
  nome: "",
  negocio: "",
  instagram: "",
  whatsapp: "",
  origem: "instagram" as Origem,
  cidadeBairro: "",
  seguidores: null as number | null,
  ultimoPostEm: "",
  notaGoogle: null as number | null,
  avaliacoesGoogle: null as number | null,
  vendeDelivery: "" as VendeDelivery,
};

/** Botão + modal do Novo lead (prospecção ativa). Basta o @ do Instagram ou o
 * WhatsApp; o lead entra em "Começar a seguir". */
export function NovoLead() {
  const { pendente, erro, setErro, executar } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(VAZIO);
  const muda = <K extends keyof typeof VAZIO>(k: K, v: (typeof VAZIO)[K]) => setF((atual) => ({ ...atual, [k]: v }));
  const inteiro = (v: number | null) => (v == null ? null : Math.round(v));

  function salvar() {
    if (!f.instagram.trim() && !f.whatsapp.trim()) {
      setErro("Informe o Instagram ou o WhatsApp.");
      return;
    }
    executar(
      () =>
        criarLeadAction({
          ...f,
          seguidores: inteiro(f.seguidores),
          avaliacoesGoogle: inteiro(f.avaliacoesGoogle),
          ultimoPostEm: f.ultimoPostEm || null,
        }),
      () => {
        setAberto(false);
        setF(VAZIO);
      },
    );
  }

  return (
    <>
      <button
        type="button"
        className={classeBotao}
        onClick={() => {
          setErro(null);
          setAberto(true);
        }}
      >
        Novo lead
      </button>
      <ModalFormulario
        aberto={aberto}
        titulo="Novo lead"
        onFechar={() => setAberto(false)}
        onSalvar={salvar}
        pendente={pendente}
        erro={erro}
        rotuloSalvar="Cadastrar"
      >
        <Campo rotulo="Instagram" dica="O @ ou o link do perfil. Basta o Instagram ou o WhatsApp.">
          <input className={classeCampo} maxLength={200} placeholder="@perfil" value={f.instagram}
            onChange={(e) => muda("instagram", e.target.value)} />
        </Campo>
        <Campo rotulo="WhatsApp (opcional)">
          <input className={classeCampo} maxLength={30} inputMode="tel" placeholder="DDD + número" value={f.whatsapp}
            onChange={(e) => muda("whatsapp", e.target.value)} />
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome">
            <input className={classeCampo} maxLength={80} placeholder="Sem nome: usa o @" value={f.nome}
              onChange={(e) => muda("nome", e.target.value)} />
          </Campo>
          <Campo rotulo="Negócio">
            <input className={classeCampo} maxLength={80} value={f.negocio} onChange={(e) => muda("negocio", e.target.value)} />
          </Campo>
          <Campo rotulo="Origem">
            <select className={classeCampo} value={f.origem} onChange={(e) => muda("origem", e.target.value as Origem)}>
              {ORIGENS.map((o) => (
                <option key={o} value={o}>{ROTULO_ORIGEM[o]}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Cidade / bairro">
            <input className={classeCampo} maxLength={120} value={f.cidadeBairro}
              onChange={(e) => muda("cidadeBairro", e.target.value)} />
          </Campo>
          <Campo rotulo="Seguidores">
            <CampoNumero className="w-full px-3 py-2 text-sm" decimais={0} value={f.seguidores}
              onChange={(v) => muda("seguidores", v)} />
          </Campo>
          <Campo rotulo="Último post">
            <input type="date" className={classeCampo} value={f.ultimoPostEm}
              onChange={(e) => muda("ultimoPostEm", e.target.value)} />
          </Campo>
          <Campo rotulo="Nota no Google">
            <CampoNumero className="w-full px-3 py-2 text-sm" decimais={1} value={f.notaGoogle}
              onChange={(v) => muda("notaGoogle", v)} />
          </Campo>
          <Campo rotulo="Avaliações no Google">
            <CampoNumero className="w-full px-3 py-2 text-sm" decimais={0} value={f.avaliacoesGoogle}
              onChange={(v) => muda("avaliacoesGoogle", v)} />
          </Campo>
        </div>
        <Campo rotulo="Vende por delivery">
          <select className={classeCampo} value={f.vendeDelivery}
            onChange={(e) => muda("vendeDelivery", e.target.value as VendeDelivery)}>
            {VENDE_DELIVERY.map((d) => (
              <option key={d} value={d}>{ROTULO_DELIVERY[d]}</option>
            ))}
          </select>
        </Campo>
      </ModalFormulario>
    </>
  );
}
