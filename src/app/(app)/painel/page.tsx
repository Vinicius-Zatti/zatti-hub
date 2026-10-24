import { PainelGeral, type DadosPainelGeral } from "@/components/painel-geral";
import { getAcessoAtual } from "@/lib/acesso";
import { carregarResumoGarantePainel } from "@/app/(app)/garante/dados";
import { listPedidosFeitos } from "@/lib/pedidos";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listInventario } from "@/lib/sheets/inventario";
import { listProdutos } from "@/lib/sheets/produtos";
import { resumirEstoque } from "@/lib/estoque/resumo";

export const dynamic = "force-dynamic";

function capitalizar(palavra: string): string {
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

/** Nome cadastrado (perfis.nome) tem prioridade - só cai pra extrair do
 * email quando ninguém definiu um nome ainda (ver `usuarioNome` em
 * `getAcessoAtual`). */
function primeiroNome(nome: string | null, email: string): string {
  const primeiraPalavraDoNome = nome?.trim().split(/\s+/)[0];
  if (primeiraPalavraDoNome) return capitalizar(primeiraPalavraDoNome);
  const parte = email.split("@")[0]?.split(/[._-]/)[0] ?? "";
  return parte ? capitalizar(parte) : "";
}

function saudacaoAtual(data: Date): string {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(data));
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function PainelPage() {
  const acesso = await getAcessoAtual();
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const [produtos, inventario, fornecedores, pedidos] = await Promise.all([
    listProdutos(acesso.spreadsheetId),
    listInventario(acesso.spreadsheetId),
    acesso.role === "operacional"
      ? Promise.resolve(null)
      : listFornecedores(acesso.spreadsheetId),
    listPedidosFeitos(acesso.unidadeId),
  ]);

  const resumo = resumirEstoque(produtos, inventario, pedidos);
  const agora = new Date();

  // Card do Checklist Garante: só com a flag e só para a gestão (a nota é da
  // gestão; o banco confere de novo em garante_nota). Falha aqui não derruba o Painel.
  let garante: DadosPainelGeral["garante"] = null;
  if (acesso.garanteHabilitado && acesso.role !== "operacional") {
    try {
      garante = { estado: "ok", ...(await carregarResumoGarantePainel(acesso, agora)) };
    } catch {
      garante = { estado: "erro" };
    }
  }

  const dados: DadosPainelGeral = {
    saudacao: saudacaoAtual(agora),
    nomeUsuario: primeiroNome(acesso.usuarioNome, acesso.usuarioEmail),
    dataHoje: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "full",
      timeZone: "America/Sao_Paulo",
    }).format(agora),
    organizacaoNome: acesso.organizacaoNome,
    unidadeNome: acesso.unidadeNome,
    ...resumo,
    fornecedores: fornecedores?.length ?? null,
    garante,
  };

  return <PainelGeral dados={dados} />;
}
