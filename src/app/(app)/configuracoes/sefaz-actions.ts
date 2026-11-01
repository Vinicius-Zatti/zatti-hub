"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria, requireMaster } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErroPublico, mensagemErroPublica } from "@/lib/erros";
import { chavePublicaRobo, cifrarParaRobo, lerCertificado, TAMANHO_MAXIMO_PFX, UFS } from "@/lib/sefaz/certificado";

// Certificado A1 da captura de NF-e (30/10/2026). Só a equipe Zatti (master). A unidade sai da
// sessão. A resposta nunca devolve o certificado nem a senha; a auditoria guarda só CNPJ e validade.

type Resposta = { ok: true; mensagem: string } | { ok: false; mensagem: string };

export async function salvarCertificadoAction(formData: FormData): Promise<Resposta> {
  const acesso = await requireMaster();
  try {
    const chavePublica = chavePublicaRobo();
    if (!chavePublica) throw new ErroPublico("A captura ainda não foi configurada no servidor (chave do robô). Fale com o Claude.");
    const arquivo = formData.get("certificado");
    const senha = formData.get("senha");
    const uf = z.enum(UFS).safeParse(String(formData.get("uf") ?? "").toUpperCase());
    if (!(arquivo instanceof File) || typeof senha !== "string" || senha.length === 0 || senha.length > 200) {
      throw new ErroPublico("Escolha o arquivo do certificado e digite a senha.");
    }
    if (!uf.success) throw new ErroPublico("Escolha a UF da empresa (a do CNPJ do certificado).");
    if (arquivo.size > TAMANHO_MAXIMO_PFX) throw new ErroPublico("Arquivo grande demais para um certificado A1.");
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const dados = lerCertificado(bytes, senha);
    if (Date.parse(dados.validoAte) <= Date.now()) throw new ErroPublico("Este certificado já venceu. Peça o novo à contabilidade.");
    const envelope = cifrarParaRobo(bytes, senha, chavePublica);
    bytes.fill(0);

    const admin = createAdminClient();
    const { data: existente } = await admin.from("fin_sefaz_certificados").select("id, unidade_id").eq("cnpj", dados.cnpj).maybeSingle();
    const ex = existente as { id: string; unidade_id: string } | null;
    if (ex && ex.unidade_id !== acesso.unidadeId) throw new ErroPublico("Este CNPJ já tem certificado em outra unidade do Zatti Hub.");
    const linha = { uf: uf.data, titular: dados.titular, valido_ate: dados.validoAte, envelope, ativo: true, atualizado_em: new Date().toISOString() };
    // Troca de certificado (renovação) mantém o NSU: a fila do CNPJ continua de onde parou.
    const { data: gravado, error } = ex
      ? await admin.from("fin_sefaz_certificados").update(linha).eq("id", ex.id).select("id").single()
      : await admin.from("fin_sefaz_certificados").insert({ ...linha, unidade_id: acesso.unidadeId, cnpj: dados.cnpj, criado_por: acesso.userId }).select("id").single();
    if (error || !gravado) throw new Error("sefaz_certificado_gravar");
    await registrarAuditoria({
      acesso,
      acao: ex ? "trocar_certificado_sefaz" : "cadastrar_certificado_sefaz",
      entidade: "fin_sefaz_certificados",
      entidadeId: (gravado as { id: string }).id,
      dadosNovos: { cnpj: dados.cnpj, uf: uf.data, valido_ate: dados.validoAte },
    });
    revalidatePath("/configuracoes");
    return { ok: true, mensagem: `Certificado de ${dados.titular} guardado. A captura roda amanhã cedo (entre 6h e 9h).` };
  } catch (erro) {
    if (!(erro instanceof ErroPublico)) console.error("sefaz_certificado_falhou", { tipo: erro instanceof Error ? erro.message.slice(0, 40) : "desconhecido" });
    return { ok: false, mensagem: mensagemErroPublica(erro, "Não consegui guardar o certificado. Tente de novo.") };
  }
}

/** Para a captura do CNPJ e apaga o envelope. O histórico de notas e rodadas fica. */
export async function removerCertificadoAction(id: string): Promise<Resposta> {
  const acesso = await requireMaster();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, mensagem: "Pedido inválido." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fin_sefaz_certificados")
    .update({ ativo: false, envelope: null, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("unidade_id", acesso.unidadeId)
    .select("id, cnpj");
  if (error || !data?.length) return { ok: false, mensagem: "Não consegui remover. Atualize a página e tente de novo." };
  await registrarAuditoria({ acesso, acao: "remover_certificado_sefaz", entidade: "fin_sefaz_certificados", entidadeId: id, dadosNovos: { cnpj: (data[0] as { cnpj: string }).cnpj } });
  revalidatePath("/configuracoes");
  return { ok: true, mensagem: "Certificado removido. A captura deste CNPJ parou." };
}
