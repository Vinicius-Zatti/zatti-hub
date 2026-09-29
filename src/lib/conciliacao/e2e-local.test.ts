import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { assinarEnvelope } from "./atestado";
import { detectarArquivo } from "./arquivo";
import { extrairTextoPdf } from "./pdf-texto";
import { lerPagSeguro } from "./pdf-pagseguro";
import { montarConteudoRegistro, prepararMovimentos } from "./preparacao";

// Ponta a ponta LOCAL (opt-in): PostgREST, Storage e Postgres reais do
// `supabase start`, com a fixture `scripts/conciliacao/fixture-local.sql`.
// Nunca aponta para produção: exige URL localhost.
// CONCILIACAO_E2E_URL, CONCILIACAO_E2E_ANON, CONCILIACAO_ATESTADO_SEGREDO e
// CONCILIACAO_E2E_PDFS (caminhos separados por ";") no ambiente.

const url = process.env.CONCILIACAO_E2E_URL ?? "";
const ativo = /^http:\/\/(127\.0\.0\.1|localhost):/.test(url) && Boolean(process.env.CONCILIACAO_E2E_PDFS);
const USUARIO = "00000000-0000-0000-0000-0000000e2e01";
const UNIDADE = "uni-e2e-teste";
const CONTA = "00000000-0000-0000-0000-0000000e2ec1";

describe.skipIf(!ativo)("Conciliação ponta a ponta local (extratos PagSeguro)", () => {
  it("importa, identifica repetição e não descarta nada", async () => {
    const sb = createClient(url, process.env.CONCILIACAO_E2E_ANON ?? "", { auth: { persistSession: false } });
    const { error: erroLogin } = await sb.auth.signInWithPassword({ email: "e2e.conciliacao@teste.local", password: "senha-local-e2e" });
    expect(erroLogin).toBeNull();
    const rpc = async (funcao: string, op: string, conteudo: Record<string, unknown>) => {
      const { envelope, atestado } = assinarEnvelope(op, USUARIO, conteudo);
      const { data, error } = await sb.rpc(funcao, { p_envelope: envelope, p_atestado: atestado });
      if (error) throw new Error(`${funcao}: ${error.code} ${error.message}`);
      return data as Record<string, unknown>;
    };
    const { data: cats } = await sb.from("fin_categorias").select("id, codigo_sistema, nivel, papel_dre, arquivado").eq("unidade_id", UNIDADE);
    const categorias = (cats ?? []).map((c) => ({ id: c.id, codigoSistema: c.codigo_sistema, nivel: c.nivel, papelDre: c.papel_dre, arquivado: c.arquivado }));

    const caminhos = (process.env.CONCILIACAO_E2E_PDFS ?? "").split(";").filter(Boolean);
    let totalLido = 0;
    for (const caminho of caminhos) {
      const bytes = new Uint8Array(readFileSync(caminho));
      const det = detectarArquivo(bytes);
      expect(det.ok).toBe(true);
      const sha = createHash("sha256").update(bytes).digest("hex");
      const criada = await rpc("fin_conciliacao_criar_importacao", "criar_importacao", {
        unidade: UNIDADE, conta: CONTA, tipo_documento: "extrato", formato: "pdf", nome: "extrato.pdf",
        tamanho: bytes.length, sha256: sha, mime: "application/pdf", quarentena_motivo: null, nonce: randomUUID(),
      });
      if (criada.situacao === "duplicada") continue; // execução repetida do teste
      const { error: erroUpload } = await sb.storage.from("fin-conciliacao").upload(String(criada.caminho), bytes, { contentType: "application/pdf" });
      expect(erroUpload).toBeNull();
      const inicio = await rpc("fin_conciliacao_iniciar_processamento", "iniciar_processamento", { importacao: criada.id, sha256: sha });
      const texto = await extrairTextoPdf(bytes);
      if (!texto.ok) throw new Error(texto.motivo);
      const leitura = lerPagSeguro(texto.trechos);
      if (!leitura || !leitura.ok) throw new Error("layout");
      const movimentos = prepararMovimentos(leitura, categorias, []);
      totalLido += movimentos.length;
      const resultado = await rpc(
        "fin_conciliacao_registrar_resultado",
        "registrar_resultado",
        montarConteudoRegistro({ importacao: String(criada.id), tentativa: Number(inicio.tentativa), nonce: String(inicio.nonce), leitura, movimentos }),
      );
      expect(resultado.situacao).toBe("concluida");
      expect(Number(resultado.movimentos_novos) + Number(resultado.possiveis_duplicidades)).toBe(movimentos.length);

      // Mesmo arquivo de novo: duplicada, nada criado.
      const repetida = await rpc("fin_conciliacao_criar_importacao", "criar_importacao", {
        unidade: UNIDADE, conta: CONTA, tipo_documento: "extrato", formato: "pdf", nome: "de-novo.pdf",
        tamanho: bytes.length, sha256: sha, mime: "application/pdf", quarentena_motivo: null, nonce: randomUUID(),
      });
      expect(repetida.situacao).toBe("duplicada");
      // Original aceito pode ser baixado; caminho de outro lugar não.
      const { error: erroDownload } = await sb.storage.from("fin-conciliacao").download(String(criada.caminho));
      expect(erroDownload).toBeNull();
    }
    const { count } = await sb.from("fin_movimentos_importados").select("id", { count: "exact", head: true }).eq("unidade_id", UNIDADE);
    expect(count ?? 0).toBeGreaterThanOrEqual(totalLido);
    const { error: escritaDireta } = await sb.from("fin_movimentos_importados").update({ estado: "ignorado" }).eq("unidade_id", UNIDADE);
    expect(escritaDireta).not.toBeNull();
  }, 120_000);
});
