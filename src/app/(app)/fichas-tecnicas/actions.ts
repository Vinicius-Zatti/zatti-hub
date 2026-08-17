"use server";

import { revalidatePath } from "next/cache";
import { requireGestaoFichasTecnicas, registrarAuditoria } from "@/lib/acesso";
import {
  criarCategoriaFicha,
  excluirFichaTecnica,
  getFichaTecnicaCompleta,
  salvarConversaoProduto,
  salvarFichaTecnica,
  type EntradaFichaTecnica,
} from "@/lib/banco/fichas-tecnicas";
import {
  categoriaFichaEntradaSchema,
  conversaoProdutoEntradaSchema,
  fichaTecnicaEntradaSchema,
  idUuidSchema,
  validarEntrada,
} from "@/lib/validacao";
import { exigirLimiteRequisicao } from "@/lib/rate-limit";
import { mensagemErroPublica } from "@/lib/erros";
import type { CategoriaFicha } from "@/lib/types";

export type ResultadoSalvarFicha = { ok: true; id: string; sku: string } | { ok: false; mensagem: string };
export type ResultadoCategoria = { ok: true; categoria: CategoriaFicha } | { ok: false; mensagem: string };
export type ResultadoAcao = { ok: true } | { ok: false; mensagem: string };

function revalidarListagem() {
  revalidatePath("/fichas-tecnicas");
}

/** Cria (fichaId null) ou edita ficha existente - sempre Gestão/master,
 * unidadeId sempre resolvido no servidor via `requireGestaoFichasTecnicas`,
 * nunca aceito do cliente. Delega pra `salvar_ficha_tecnica` no Postgres,
 * que grava ficha + componentes + etapas + versão numa única transação. */
export async function salvarFichaTecnicaAction(
  fichaId: string | null,
  input: EntradaFichaTecnica,
): Promise<ResultadoSalvarFicha> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_salvar");
    const idValidado = fichaId === null ? null : validarEntrada(idUuidSchema, fichaId);
    const entrada = validarEntrada(fichaTecnicaEntradaSchema, input);

    const antes = idValidado ? await getFichaTecnicaCompleta(acesso.unidadeId, idValidado) : null;
    const salva = await salvarFichaTecnica({ unidadeId: acesso.unidadeId, fichaId: idValidado, entrada });

    await registrarAuditoria({
      acesso,
      acao: idValidado ? "editar" : "criar",
      entidade: "ficha_tecnica",
      entidadeId: salva.id,
      dadosAntigos: antes,
      dadosNovos: salva,
    });

    revalidarListagem();
    revalidatePath(`/fichas-tecnicas/${salva.id}`);
    return { ok: true, id: salva.id, sku: salva.sku };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a ficha técnica.") };
  }
}

/** Categoria nova também é Gestão/master - a listagem (`listarCategoriasFicha`)
 * é aberta a todos os papéis, chamada direto pela página. */
export async function criarCategoriaFichaAction(input: {
  camada: "PRE" | "VEN";
  codigo: string;
  nome: string;
}): Promise<ResultadoCategoria> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("categoria_ficha_criar");
    const entrada = validarEntrada(categoriaFichaEntradaSchema, input);
    const categoria = await criarCategoriaFicha({ unidadeId: acesso.unidadeId, ...entrada });

    await registrarAuditoria({
      acesso,
      acao: "criar",
      entidade: "categoria_ficha",
      entidadeId: categoria.id,
      dadosNovos: categoria,
    });

    revalidatePath("/fichas-tecnicas/categorias");
    revalidatePath("/fichas-tecnicas/nova");
    return { ok: true, categoria };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível criar a categoria.") };
  }
}

/** Bloqueado pelo banco (on delete restrict) se a ficha estiver em uso como
 * componente de outra - a mensagem já vem traduzida de `excluirFichaTecnica`. */
export async function excluirFichaTecnicaAction(id: string): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("ficha_excluir");
    const idValidado = validarEntrada(idUuidSchema, id);
    const antes = await getFichaTecnicaCompleta(acesso.unidadeId, idValidado);
    await excluirFichaTecnica(acesso.unidadeId, idValidado);

    await registrarAuditoria({
      acesso,
      acao: "excluir",
      entidade: "ficha_tecnica",
      entidadeId: idValidado,
      dadosAntigos: antes,
    });

    revalidarListagem();
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível excluir a ficha técnica.") };
  }
}

/** Conversão de unidade por produto (Estoque -> uso na ficha) - só
 * Gestão/master, uma conversão por produto (upsert). */
export async function salvarConversaoProdutoAction(input: {
  produtoSku: string;
  unidadeSaida: string;
  fatorPorUnidadeBase: number;
  descricao: string;
}): Promise<ResultadoAcao> {
  const acesso = await requireGestaoFichasTecnicas();

  try {
    await exigirLimiteRequisicao("conversao_produto_salvar");
    const entrada = validarEntrada(conversaoProdutoEntradaSchema, input);
    await salvarConversaoProduto({ unidadeId: acesso.unidadeId, ...entrada });

    await registrarAuditoria({
      acesso,
      acao: "salvar",
      entidade: "produto_conversao",
      entidadeId: entrada.produtoSku,
      dadosNovos: entrada,
    });

    revalidatePath("/fichas-tecnicas/conversoes");
    return { ok: true };
  } catch (err) {
    return { ok: false, mensagem: mensagemErroPublica(err, "Não foi possível salvar a conversão.") };
  }
}
