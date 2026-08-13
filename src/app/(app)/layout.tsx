import {
  EstruturaAplicativo,
  type ItemNavegacao,
  type SecaoNavegacao,
} from "@/components/estrutura-aplicativo";
import { GuardaContagemProvider } from "@/components/guarda-contagem";
import { GuardaEdicaoProvider } from "@/components/guarda-edicao";
import { getAcessoAtual } from "@/lib/acesso";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const acesso = await getAcessoAtual();
  const podeGerir = acesso.role !== "operacional";

  const secoesEstoque: SecaoNavegacao[] = [
    {
      label: "Produtos",
      items: [
        { label: "Consultar produtos", href: "/estoque/produtos" },
        ...(podeGerir
          ? [{ label: "Editar dados", href: "/estoque/produtos/edicao" }]
          : []),
      ],
    },
    {
      label: "Contagem",
      items: [
        { label: "Fazer contagem", href: "/estoque/contagem" },
        { label: "Conferir contagens", href: "/estoque/contagem/visualizacao" },
      ],
    },
    {
      label: "Pedidos",
      items: [
        ...(podeGerir
          ? [
              { label: "Criar cotação", href: "/estoque/pedidos" },
              { label: "Editor de espelhos", href: "/estoque/pedidos/cotacoes" },
            ]
          : []),
        { label: "Pedidos feitos", href: "/estoque/pedidos/feitos" },
      ],
    },
    ...(podeGerir
      ? [
          {
            label: "Fornecedores",
            items: [
              { label: "Consultar fornecedores", href: "/estoque/fornecedores" },
              { label: "Editar dados", href: "/estoque/fornecedores/edicao" },
            ],
          },
          {
            label: "CMV Real",
            items: [{ label: "Consultar CMV", href: "/estoque/cmv" }],
          },
        ]
      : []),
  ];

  const secoesFinanceiro: SecaoNavegacao[] = [
    {
      label: "Consolidado de vendas",
      items: [
        { label: "Novo lançamento", href: "/financeiro/consolidado/novo" },
        { label: "Histórico", href: "/financeiro/consolidado" },
        ...(podeGerir
          ? [{ label: "Dashboard", href: "/financeiro/consolidado/dashboard" }]
          : []),
      ],
    },
  ];

  // Financeiro só sai de "em breve" pra unidade com a flag ligada
  // (`unidades.consolidado_vendas_habilitado`, configurável por cliente).
  const itensNavegacao: ItemNavegacao[] = [
    {
      label: "Painel geral",
      href: "/painel",
      icone: "painel",
      activePrefix: "/painel",
      disabled: false,
    },
    {
      label: "Estoque",
      href: "/estoque/produtos",
      icone: "estoque",
      activePrefix: "/estoque",
      disabled: false,
      sections: secoesEstoque,
    },
    {
      label: "Financeiro",
      href: "/financeiro/consolidado/novo",
      icone: "financeiro",
      activePrefix: "/financeiro",
      disabled: !acesso.consolidadoVendasHabilitado,
      sections: secoesFinanceiro,
    },
    { label: "Fichas Técnicas", href: "#", icone: "fichas", disabled: true },
    { label: "Tarefas", href: "#", icone: "tarefas", disabled: true },
    { label: "Marketing", href: "#", icone: "marketing", disabled: true },
    // `acesso.role === "master"` aqui já significa "master global COM
    // AAL2", não só o papel - não é preciso (nem daria pra) checar os dois
    // separadamente nesta variável. Prova em getAcessoAtual() (src/lib/
    // acesso.ts): `role = "master"` só é atribuído dentro do bloco
    // `if (ehMaster) { ... }`, e logo no início desse mesmo bloco, antes de
    // qualquer outra coisa, `if (aal?.currentLevel !== "aal2") redirect
    // ("/mfa")` já rodou. `redirect()` do Next.js lança (a função nunca
    // retorna depois disso), então é estruturalmente impossível a função
    // devolver `role: "master"` sem ter passado pela checagem de AAL2 -
    // ver acesso.test.ts ("master sem AAL2 é bloqueado", que confirma o
    // redirect pra /mfa acontece antes de qualquer `role` ser decidido).
    // Mesmo assim, esconder o item aqui é só UX: a página e a Server
    // Action chamam `requireMaster()` de novo, cada uma na sua própria
    // requisição ao servidor - nenhuma confia no que esta variável já
    // calculou faz uma renderização atrás.
    ...(acesso.role === "master"
      ? [
          {
            label: "Administração",
            href: "/admin/clientes/novo",
            icone: "admin" as const,
            activePrefix: "/admin",
            disabled: false,
          },
        ]
      : []),
  ];

  return (
    <GuardaContagemProvider>
      <GuardaEdicaoProvider>
        <EstruturaAplicativo
          items={itensNavegacao}
          organizacaoAtual={acesso.organizacaoId}
          organizacaoNome={acesso.organizacaoNome}
          organizacoes={acesso.organizacoesDisponiveis}
          usuarioEmail={acesso.usuarioEmail}
        >
          {children}
        </EstruturaAplicativo>
      </GuardaEdicaoProvider>
    </GuardaContagemProvider>
  );
}
