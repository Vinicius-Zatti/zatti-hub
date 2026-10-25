import { PainelGeral, type DadosPainelGeral } from "@/components/painel-geral";
import { InicioPiloto } from "@/components/navegacao-v2/inicio-piloto";
import { getAcessoAtual } from "@/lib/acesso";
import { carregarResumoGarantePainel } from "@/app/(app)/garante/dados";
import { listPedidosFeitos } from "@/lib/pedidos";
import { listFornecedores } from "@/lib/sheets/fornecedores";
import { listInventario } from "@/lib/sheets/inventario";
import { listProdutos } from "@/lib/sheets/produtos";
import { resumirEstoque } from "@/lib/estoque/resumo";
import { acoesDoInicio } from "@/lib/navegacao/acoes";
import { contextoMenuRestaurante, montarMenuRestaurantePiloto } from "@/lib/navegacao/menu-restaurante";
import { usaNavegacaoV2 } from "@/lib/navegacao/piloto";
import { aplicarPermissoesMenu } from "@/lib/permissoes/menu";
import { lerFlagsConciliacao } from "@/lib/banco/conciliacao";

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
  const piloto = usaNavegacaoV2(acesso);
  // Leitura que falha sobe para o `error.tsx` do segmento: tela de erro padrão
  // (unidade, tela, data e identificador para o suporte), com o erro no log do
  // servidor. Nunca o antigo aviso de planilha/.env para o cliente.
  const [produtos, inventario, fornecedores, pedidos] = await Promise.all([
    listProdutos(acesso.spreadsheetId),
    listInventario(acesso.spreadsheetId),
    // Início do piloto não mostra fornecedores: leitura a menos.
    acesso.role === "operacional" || piloto
      ? Promise.resolve(null)
      : listFornecedores(acesso.spreadsheetId),
    listPedidosFeitos(acesso.unidadeId),
  ]);

  const resumo = resumirEstoque(produtos, inventario, pedidos);
  const agora = new Date();
  const nome = primeiroNome(acesso.usuarioNome, acesso.usuarioEmail);
  const saudacao = `${saudacaoAtual(agora)}${nome ? `, ${nome}` : ""}`;
  const dataHoje = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeZone: "America/Sao_Paulo",
  }).format(agora);

  // Navegação V2 (fase 3, 24/10/2026): no piloto, /painel é o Início com
  // atalhos por operação, tirados do mesmo menu (papel e flags). Os números
  // por área foram para a aba Dashboard (/painel/dashboard, só gestão).
  if (piloto) {
    // `lerFlagsConciliacao` é `cache()` do React: o layout já leu nesta mesma
    // requisição, então aqui não há consulta nova ao banco.
    const conciliacaoHabilitada = acesso.financeiroGerencialHabilitado
      ? (await lerFlagsConciliacao(acesso.unidadeId)).habilitada
      : false;
    const menu = aplicarPermissoesMenu(
      montarMenuRestaurantePiloto(contextoMenuRestaurante(acesso, conciliacaoHabilitada)),
      acesso.permissoes,
    );
    const { operacao, gestao } = acoesDoInicio(menu, acesso.role !== "operacional");
    return (
      <InicioPiloto
        saudacao={saudacao}
        dataHoje={dataHoje}
        operacao={operacao}
        gestao={gestao}
        resumo={{
          ultimaContagem: resumo.ultimaContagem,
          alertasCompra: resumo.alertasCompra,
          pedidosPendentes: resumo.pedidosPendentes,
        }}
      />
    );
  }

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
    nomeUsuario: nome,
    dataHoje,
    organizacaoNome: acesso.organizacaoNome,
    unidadeNome: acesso.unidadeNome,
    ...resumo,
    fornecedores: fornecedores?.length ?? null,
    garante,
  };

  return <PainelGeral dados={dados} />;
}
