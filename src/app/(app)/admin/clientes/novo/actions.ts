"use server";

import { requireMaster, registrarAuditoria } from "@/lib/acesso";
import { exigirLimite, chaveUsuario } from "@/lib/rate-limit";
import { validar, clienteNovoSchema } from "@/lib/validacao";
import { paraErroPublico, ErroPublico } from "@/lib/erros";
import { createClient } from "@/lib/supabase/server";
import { convidarUsuarioNovo } from "@/lib/supabase/admin";

export type ResultadoUsuario = {
  email: string;
  nome: string;
  role: "gestao" | "operacional";
  usuarioExistente: boolean;
  vinculoCriado: boolean;
  convite: "enviado" | "nao_necessario" | "erro";
  erroConvite?: string;
};

export type ResultadoCriarCliente =
  | {
      ok: true;
      organizacaoId: string;
      organizacaoCriada: boolean;
      unidadeId: string;
      unidadeCriada: boolean;
      usuarios: ResultadoUsuario[];
    }
  | { ok: false; erro: string };

type LinhaVinculoSql = {
  user_id: string;
  role: string;
  unidade_id: string | null;
  criado: boolean;
};

type RespostaAdminCriarCliente = {
  organizacao_id: string;
  organizacao_criada: boolean;
  unidade_id: string;
  unidade_criada: boolean;
  vinculos: LinhaVinculoSql[];
};

/** Onboarding administrativo completo: substitui convite manual no
 * Supabase Auth + SQL solto no SQL Editor. Só master com AAL2 chega até
 * aqui - `requireMaster()` já exige os dois (AAL2 é checado dentro de
 * `getAcessoAtual`), e a função SQL revalida os dois de novo (defesa em
 * profundidade, não confia só na Server Action).
 *
 * Ordem importa pra segurança do fluxo: primeiro resolve/convida todo
 * mundo, só chama a função de gravação se TODOS os e-mails novos tiverem
 * sido convidados com sucesso - senão criaria vínculo pra gente sem conta
 * de verdade por trás. Nada é gravado no banco até esse ponto, então uma
 * falha de convite não deixa vínculo inconsistente, e repetir a chamada
 * inteira depois de corrigir o problema é seguro (idempotente nos dois
 * lados: convite não duplica porque confere existência antes, e a função
 * SQL não duplica organização/unidade/vínculo já criados). */
export async function criarClienteAdmin(dadoBruto: unknown): Promise<ResultadoCriarCliente> {
  // `requireMaster()` fica FORA do try/catch de propósito, igual todo
  // outro Server Action do repo (ver estoque/produtos/actions.ts) - ele
  // redireciona (`next/navigation.redirect()`) quem não é master+AAL2, e
  // `redirect()` funciona lançando um erro especial que o próprio Next.js
  // precisa enxergar subindo a pilha pra executar o redirecionamento de
  // verdade. Um try/catch genérico em volta dele engoliria esse erro e
  // devolveria uma mensagem de "não foi possível" em vez de mandar a
  // pessoa pra /mfa ou /login - autorização vira sempre um redirect real,
  // nunca um retorno de erro comum.
  const acesso = await requireMaster();

  try {
    await exigirLimite(chaveUsuario(acesso.userId), "admin_criar_cliente");

    const dado = validar(clienteNovoSchema, dadoBruto, "admin_criar_cliente");
    const unidadeId = dado.organizacaoId;

    const supabase = await createClient();

    // Falha rápido, antes de convidar qualquer e-mail, se já dá pra saber
    // que a organização diverge - a função SQL confere de novo (é a
    // barreira que vale de verdade), isso aqui só evita gastar convites à
    // toa quando o problema é óbvio de cara.
    const { data: orgExistente } = await supabase
      .from("organizacoes")
      .select("nome, tipo_cliente, ativo")
      .eq("id", dado.organizacaoId)
      .maybeSingle();
    if (
      orgExistente &&
      (orgExistente.nome !== dado.organizacaoNome ||
        orgExistente.tipo_cliente !== dado.tipoCliente ||
        orgExistente.ativo !== true)
    ) {
      throw new ErroPublico(
        "Já existe uma organização com esse identificador e dados diferentes. Ajusta o identificador ou o nome."
      );
    }

    type UsuarioResolvido = (typeof dado.usuarios)[number] & {
      userId: string;
      existente: boolean;
      convite: "enviado" | "nao_necessario" | "erro";
      erroConvite?: string;
    };
    const resolvidos: UsuarioResolvido[] = [];

    for (const usuario of dado.usuarios) {
      const { data: userIdExistente, error: erroBusca } = await supabase.rpc(
        "admin_buscar_usuario_por_email",
        { p_email: usuario.email }
      );
      if (erroBusca) {
        throw new ErroPublico("Não foi possível conferir os e-mails agora. Tenta de novo.");
      }

      if (userIdExistente) {
        resolvidos.push({
          ...usuario,
          userId: userIdExistente as string,
          existente: true,
          convite: "nao_necessario",
        });
        continue;
      }

      const convite = await convidarUsuarioNovo(usuario.email);
      if (!convite.ok) {
        resolvidos.push({ ...usuario, userId: "", existente: false, convite: "erro", erroConvite: convite.erro });
        continue;
      }
      resolvidos.push({ ...usuario, userId: convite.userId, existente: false, convite: "enviado" });
    }

    const semConta = resolvidos.filter((u) => !u.userId);
    if (semConta.length > 0) {
      return {
        ok: false,
        erro: `Não foi possível convidar: ${semConta.map((u) => u.email).join(", ")}. Nada foi criado ainda - corrige e tenta de novo.`,
      };
    }

    const { data: resultadoSql, error: erroSql } = await supabase.rpc("admin_criar_cliente", {
      p_organizacao_id: dado.organizacaoId,
      p_organizacao_nome: dado.organizacaoNome,
      p_tipo_cliente: dado.tipoCliente,
      p_unidade_id: unidadeId,
      p_unidade_nome: dado.unidadeNome,
      p_fonte_dados_estoque: dado.fonteDadosEstoque,
      p_vinculos: resolvidos.map((u) => ({
        user_id: u.userId,
        nome: u.nome,
        role: u.role,
        unidade_id: u.role === "operacional" ? unidadeId : null,
      })),
    });

    if (erroSql || !resultadoSql) {
      throw new ErroPublico(
        "Não foi possível criar o cliente agora. Nenhum e-mail já convidado precisa ser reenviado - só tenta de novo."
      );
    }

    const resultado = resultadoSql as RespostaAdminCriarCliente;

    const usuariosFinal: ResultadoUsuario[] = resolvidos.map((u) => {
      const vinculo = resultado.vinculos.find((v) => v.user_id === u.userId);
      return {
        email: u.email,
        nome: u.nome,
        role: u.role,
        usuarioExistente: u.existente,
        vinculoCriado: vinculo?.criado ?? false,
        convite: u.convite,
        erroConvite: u.erroConvite,
      };
    });

    await registrarAuditoria({
      acesso: { ...acesso, unidadeId: resultado.unidade_id },
      acao: "admin_criar_cliente",
      entidade: "organizacoes",
      entidadeId: resultado.organizacao_id,
      dadosNovos: {
        organizacaoNome: dado.organizacaoNome,
        tipoCliente: dado.tipoCliente,
        unidadeNome: dado.unidadeNome,
        fonteDadosEstoque: dado.fonteDadosEstoque,
        usuarios: usuariosFinal.map((u) => ({ email: u.email, role: u.role, convite: u.convite })),
      },
    });

    return {
      ok: true,
      organizacaoId: resultado.organizacao_id,
      organizacaoCriada: resultado.organizacao_criada,
      unidadeId: resultado.unidade_id,
      unidadeCriada: resultado.unidade_criada,
      usuarios: usuariosFinal,
    };
  } catch (erro) {
    return { ok: false, erro: paraErroPublico(erro, "admin_criar_cliente") };
  }
}
