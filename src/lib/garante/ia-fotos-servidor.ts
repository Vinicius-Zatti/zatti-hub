import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chamarIa, type RegistroUsoIa } from "@/lib/conciliacao/ia-chamada";
import { MODELO_IA_CONCILIACAO, VERSAO_TABELA_PRECOS } from "@/lib/conciliacao/ia-custo";
import { criarPrazo } from "@/lib/conciliacao/prazo";
import {
  ESQUEMA_CONFERENCIA,
  interpretarResposta,
  lerReserva,
  montarTextoItem,
  resultadoSemChamada,
  SISTEMA_CONFERENCIA,
  type ResultadoConferencia,
  type VereditoIa,
} from "./ia-fotos";

// Conferência da foto pela IA (fase de teste, 12/11/2026). Roda depois de a foto já estar
// registrada: falha aqui nunca desfaz a foto nem trava o checklist. A reserva é feita com a
// sessão da pessoa (o banco confere acesso, responsável, janela e o teto do mês); baixar a
// foto, finalizar o uso e gravar o resultado são do servidor. Nunca loga a imagem nem URL.

const BUCKET = "garante-evidencias";
const MODELO = MODELO_IA_CONCILIACAO; // claude-haiku-4-5, mesmo preço da tabela da Conciliação
/** Prazo total da conferência; a página da execução declara 60 s. */
const PRAZO_CONFERENCIA_MS = 55_000;
const TEMPO_MAXIMO_IA_MS = 30_000;
const TAMANHO_MAXIMO_FOTO = 2 * 1024 * 1024;

function registroGarante(chamadaId: string): RegistroUsoIa {
  const admin = createAdminClient();
  return {
    // A linha "iniciada" já nasceu na reserva (ela é o contador do teto).
    iniciar: async () => {},
    finalizar: async (_chave, d) => {
      const { error } = await admin
        .from("garante_ia_chamadas")
        .update({
          situacao: d.situacao,
          resultado_codigo: d.resultadoCodigo,
          tokens_entrada: d.tokensEntrada,
          tokens_saida: d.tokensSaida,
          tokens_cache_leitura: d.tokensCacheLeitura,
          tokens_cache_escrita: d.tokensCacheEscrita,
          custo_estimado_usd: d.custoUsd,
          finalizada_em: new Date().toISOString(),
        })
        .eq("id", chamadaId);
      if (error) console.error("garante_ia_finalizar_falhou", { codigo: error.code ?? null });
    },
  };
}

async function resultadoGravado(execucaoId: string, itemId: string, caminho: string): Promise<ResultadoConferencia> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("garante_respostas")
    .select("ia_veredito, ia_motivo, ia_foto_path")
    .eq("execucao_id", execucaoId)
    .eq("item_id", itemId)
    .maybeSingle();
  const r = data as { ia_veredito: VereditoIa | null; ia_motivo: string | null; ia_foto_path: string | null } | null;
  if (r?.ia_veredito && r.ia_motivo && r.ia_foto_path === caminho) return { estado: "resultado", veredito: r.ia_veredito, motivo: r.ia_motivo };
  return { estado: "falhou" };
}

export async function conferirFotoComIa(execucaoId: string, itemId: string, caminho: string): Promise<ResultadoConferencia> {
  const supabase = await createClient();
  const { data: reservaBruta, error } = await supabase.rpc("garante_ia_reservar", {
    p_execucao_id: execucaoId,
    p_item_id: itemId,
    p_foto_path: caminho,
    p_modelo: MODELO,
    p_tabela_precos_versao: VERSAO_TABELA_PRECOS,
  });
  const reserva = error ? null : lerReserva(reservaBruta);
  if (!reserva) return { estado: "falhou" };
  if (reserva.situacao === "repetida") return resultadoGravado(execucaoId, itemId, caminho);
  if (reserva.situacao !== "reservada") return resultadoSemChamada(reserva.situacao);
  const chamadaId = reserva.chamadaId as string;
  const registro = registroGarante(chamadaId);
  const semChamada = (codigo: string) =>
    registro.finalizar("", {
      situacao: "erro",
      resultadoCodigo: codigo,
      tokensEntrada: null,
      tokensSaida: null,
      tokensCacheLeitura: null,
      tokensCacheEscrita: null,
      custoUsd: null,
    });

  // Item como estava ao iniciar (snapshot), lido pelo RLS da pessoa.
  const { data: exec } = await supabase.from("garante_execucoes").select("modelo_nome, snapshot").eq("id", execucaoId).maybeSingle();
  const itens = ((exec?.snapshot as { id: string; titulo: string; grupo?: string | null; instrucao?: string | null }[] | null) ?? []);
  const item = itens.find((i) => i.id === itemId);
  if (!exec || !item) {
    await semChamada("item_nao_encontrado");
    return { estado: "falhou" };
  }

  const admin = createAdminClient();
  const { data: arquivo, error: erroFoto } = await admin.storage.from(BUCKET).download(caminho);
  if (erroFoto || !arquivo || arquivo.size > TAMANHO_MAXIMO_FOTO) {
    await semChamada("foto_indisponivel");
    return { estado: "falhou" };
  }
  const base64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");

  const resposta = await chamarIa({
    sistema: SISTEMA_CONFERENCIA,
    conteudo: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
      { type: "text", text: montarTextoItem({ checklist: exec.modelo_nome as string, titulo: item.titulo, grupo: item.grupo, instrucao: item.instrucao }) },
    ],
    esquema: ESQUEMA_CONFERENCIA,
    maxTokens: 300,
    registro,
    tempoMaximoMs: TEMPO_MAXIMO_IA_MS,
    prazo: criarPrazo(PRAZO_CONFERENCIA_MS),
    modelo: MODELO,
    rotuloLog: "garante_ia_falhou",
  });
  if (!resposta.ok) {
    // Estes dois voltam antes de chamar (nada cobrado): fecha a reserva como erro.
    if (resposta.codigo === "ia_sem_chave" || resposta.codigo === "prazo_insuficiente") await semChamada(resposta.codigo);
    return { estado: "falhou" };
  }
  const lido = interpretarResposta(resposta.texto);
  if (!lido) return { estado: "falhou" };

  const { data: gravou, error: erroGravar } = await admin.rpc("garante_ia_gravar_resultado", {
    p_chamada_id: chamadaId,
    p_veredito: lido.veredito,
    p_motivo: lido.motivo,
  });
  if (erroGravar) console.error("garante_ia_gravar_falhou", { codigo: erroGravar.code ?? null });
  // Foto trocada enquanto a IA olhava: o resultado era da foto antiga, não mostra.
  if (erroGravar || gravou === false) return { estado: "falhou" };
  return { estado: "resultado", ...lido };
}
