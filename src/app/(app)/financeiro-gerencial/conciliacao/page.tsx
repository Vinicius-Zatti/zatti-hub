import { requireConciliacao } from "@/lib/conciliacao/acesso";
import { listarContasFinanceiras } from "@/lib/banco/financeiro-gerencial";
import {
  carregarContextoMotor,
  IMPORTACOES_POR_PAGINA,
  ITENS_FILA_POR_PAGINA,
  listarFila,
  listarImportacoes,
  type FiltrosFila,
} from "@/lib/banco/conciliacao";
import { listarDecisoesAtivas } from "@/lib/banco/conciliacao-decisoes";
import { categoriaCompativel } from "@/lib/conciliacao/classificacao";
import { inicioJanelaConciliados } from "@/lib/conciliacao/decisao-tela";
import { ConciliacaoPiloto } from "@/components/financeiro-gerencial/conciliacao-piloto";

export const dynamic = "force-dynamic";
// Leitura por IA de um PDF pode levar dezenas de segundos.
export const maxDuration = 120;

type Busca = { pagina?: string; estado?: string; direcao?: string; importacao?: string; pimp?: string };

function inteiro(v: string | undefined): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { acesso, flags } = await requireConciliacao();
  const busca = await searchParams;
  const filtros: FiltrosFila = {
    estado: busca.estado === "pendente" || busca.estado === "revisar" ? busca.estado : "todos",
    direcao: busca.direcao === "entrada" || busca.direcao === "saida" ? busca.direcao : "todas",
    importacaoId: busca.importacao && /^[0-9a-f-]{36}$/.test(busca.importacao) ? busca.importacao : null,
  };
  const pagina = inteiro(busca.pagina);
  const paginaImportacoes = inteiro(busca.pimp);

  // Já conciliados: últimos 60 dias.
  const desde = inicioJanelaConciliados(new Date());
  const [contas, importacoes, fila, motor, decisoes] = await Promise.all([
    listarContasFinanceiras(acesso.unidadeId),
    listarImportacoes(acesso.unidadeId, paginaImportacoes),
    listarFila(acesso.unidadeId, filtros, pagina),
    carregarContextoMotor(acesso.unidadeId, acesso.organizacaoId),
    listarDecisoesAtivas(acesso.unidadeId, desde),
  ]);
  // Só contas (nível folha) não arquivadas; entrada concilia com receita, saída com despesa.
  const plano = (direcao: "entrada" | "saida") =>
    motor.categorias
      .filter((c) => categoriaCompativel(c, direcao))
      .map((c) => ({ id: c.id, label: c.caminho }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return (
    <ConciliacaoPiloto
      // Cartão de crédito não tem extrato bancário para importar nem recebe transferência:
      // a fatura é paga pela tela Cartões.
      contas={contas.filter((c) => c.tipo !== "cartao_credito").map((c) => ({ id: c.id, nome: c.nome, ativo: c.ativo }))}
      importacoes={importacoes.itens}
      totalImportacoes={importacoes.total}
      paginaImportacoes={paginaImportacoes}
      importacoesPorPagina={IMPORTACOES_POR_PAGINA}
      fila={fila.itens}
      totalFila={fila.total}
      pagina={pagina}
      itensPorPagina={ITENS_FILA_POR_PAGINA}
      filtros={filtros}
      planoDeContas={Object.fromEntries(motor.categorias.map((c) => [c.id, c.caminho]))}
      iaDocumentos={flags.iaDocumentos}
      ehMaster={acesso.titularFinanceiro}
      planoReceita={plano("entrada")}
      planoDespesa={plano("saida")}
      podeGestao={acesso.role === "gestao" || acesso.role === "master"}
      decisoes={decisoes}
    />
  );
}
