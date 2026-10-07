"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireConciliacao } from "@/lib/conciliacao/acesso";
import { importarDocumento, reprocessarImportacao, type ResultadoImportacao } from "@/lib/conciliacao/processar";
import { confirmarConta, descartarImportacao, listarCandidatos, obterImportacao } from "@/lib/banco/conciliacao";
import { pontuarCandidato, type CandidatoParcela, type Pontuacao } from "@/lib/conciliacao/candidatos";
import { TAMANHO_MAXIMO_BYTES } from "@/lib/conciliacao/arquivo";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";

// Fatia piloto: importar e revisar. Nenhuma action aqui confirma, baixa ou
// lança nada no financeiro. A unidade vem sempre do acesso autenticado.

export type RespostaImportacao = { ok: true; resultado: ResultadoImportacao } | { ok: false; mensagem: string };

const entradaImportacao = z.object({
  contaFinanceiraId: z.string().uuid(),
  tipoDocumento: z.enum(["extrato", "comprovante"]),
});

export async function importarDocumentoAction(formData: FormData): Promise<RespostaImportacao> {
  const ctx = await requireConciliacao();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_importar");
    const entrada = entradaImportacao.safeParse({
      contaFinanceiraId: formData.get("contaFinanceiraId"),
      tipoDocumento: formData.get("tipoDocumento"),
    });
    if (!entrada.success) throw new ErroPublico("Escolha a conta financeira e o tipo de documento.");
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroPublico("Escolha um arquivo.");
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) throw new ErroPublico("Arquivo maior que 4 MB.");
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const resultado = await importarDocumento(ctx, {
      bytes,
      nomeOriginal: arquivo.name,
      contaFinanceiraId: entrada.data.contaFinanceiraId,
      tipoDocumento: entrada.data.tipoDocumento,
    });
    revalidatePath("/financeiro-gerencial/conciliacao");
    return { ok: true, resultado };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível importar o documento.") };
  }
}

export async function reprocessarImportacaoAction(importacaoId: string): Promise<RespostaImportacao> {
  const ctx = await requireConciliacao();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_reprocessar");
    const id = z.string().uuid().parse(importacaoId);
    const imp = await obterImportacao(ctx.acesso.unidadeId, id);
    if (!imp || !imp.sha256 || !imp.caminhoArquivo || !imp.arquivoGuardado || imp.situacao !== "processando") {
      throw new ErroPublico("Só uma importação interrompida no meio da leitura pode ser lida de novo.");
    }
    const resultado = await reprocessarImportacao(ctx, {
      id: imp.id,
      sha256: imp.sha256,
      caminhoArquivo: imp.caminhoArquivo,
      tipoDocumento: imp.tipoDocumento,
    });
    revalidatePath("/financeiro-gerencial/conciliacao");
    return { ok: true, resultado };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível ler a importação de novo.") };
  }
}

export type RespostaSimples = { ok: true; mensagem: string } | { ok: false; mensagem: string };

const entradaDescarte = z.object({
  importacaoId: z.string().uuid(),
  motivo: z.enum(["conta_errada", "arquivo_errado", "outro"]),
});

/** Tira do Hub os movimentos que a importação criou e a marca como
 * descartada. O original fica guardado; o mesmo arquivo pode ir de novo.
 * Usa o limite de "ler de novo": ação rara, sem chave própria. */
export async function descartarImportacaoAction(input: unknown): Promise<RespostaSimples> {
  const ctx = await requireConciliacao();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_reprocessar");
    const e = entradaDescarte.parse(input);
    const imp = await obterImportacao(ctx.acesso.unidadeId, e.importacaoId);
    if (!imp) throw new ErroPublico("Importação não encontrada nesta unidade.");
    const r = await descartarImportacao(ctx.acesso.userId, { importacao: imp.id, motivo: e.motivo });
    revalidatePath("/financeiro-gerencial/conciliacao");
    const n = r.movimentos_removidos;
    return { ok: true, mensagem: n > 0 ? `Importação descartada. ${n} movimentos saíram da fila.` : "Importação descartada." };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível descartar a importação.") };
  }
}

/** Vinícius confirma que o extrato é mesmo da conta escolhida, apesar do alerta. */
export async function confirmarContaAction(importacaoId: string): Promise<RespostaSimples> {
  const ctx = await requireConciliacao();
  try {
    await exigirLimiteRequisicao("fin_conciliacao_reprocessar");
    const id = z.string().uuid().parse(importacaoId);
    const imp = await obterImportacao(ctx.acesso.unidadeId, id);
    if (!imp) throw new ErroPublico("Importação não encontrada nesta unidade.");
    await confirmarConta(ctx.acesso.userId, imp.id);
    revalidatePath("/financeiro-gerencial/conciliacao");
    return { ok: true, mensagem: "Conta confirmada." };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível confirmar a conta.") };
  }
}

export type RespostaCandidatos =
  | { ok: true; itens: (CandidatoParcela & { pontuacao: Pontuacao })[]; temMais: boolean }
  | { ok: false; mensagem: string };

const entradaCandidatos = z.object({
  movimentoId: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valorCentavos: z.number().int().positive(),
  contaFinanceiraId: z.string().uuid(),
  foraDaJanela: z.boolean(),
  pagina: z.number().int().min(1).max(500),
});

/** Só leitura: mostra parcelas que podem corresponder ao movimento. */
export async function listarCandidatosAction(input: unknown): Promise<RespostaCandidatos> {
  await requireConciliacao();
  try {
    const e = entradaCandidatos.parse(input);
    const { itens, temMais } = await listarCandidatos(e.movimentoId, { foraDaJanela: e.foraDaJanela, pagina: e.pagina });
    return {
      ok: true,
      temMais,
      itens: itens.map((c) => ({
        ...c,
        pontuacao: pontuarCandidato({ data: e.data, valorCentavos: e.valorCentavos, contaFinanceiraId: e.contaFinanceiraId }, c),
      })),
    };
  } catch (erro) {
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não foi possível buscar contas correspondentes.") };
  }
}
