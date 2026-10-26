import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EstoqueBreadcrumb } from "@/components/estoque-breadcrumb";
import { AvisoSomenteVer } from "@/components/aviso-somente-ver";
import { getAcessoAtual } from "@/lib/acesso";
import { CABECALHO_CAMINHO } from "@/lib/area-interna/caminhos";
import { moduloDaRotaEstoque } from "@/lib/permissoes/menu";

// Permissões por módulo (26/10/2026): as telas de /estoque seguem o Estoque, menos as de
// cadastro (produtos, setores, fornecedores), que seguem Cadastros. "Sem acesso" volta ao
// Início; as telas só de gravar conferem "editar" na própria página. A barreira é o banco.
export default async function EstoqueLayout({ children }: { children: React.ReactNode }) {
  const acesso = await getAcessoAtual();
  const modulo = moduloDaRotaEstoque((await headers()).get(CABECALHO_CAMINHO) ?? "");
  if (acesso.permissoes[modulo] === "sem_acesso") redirect("/painel");
  return (
    <div className="flex flex-col gap-4">
      <EstoqueBreadcrumb />
      <AvisoSomenteVer acesso={acesso} modulo={modulo} />
      {children}
    </div>
  );
}
