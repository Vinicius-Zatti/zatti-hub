import Link from "next/link";
import { Selo } from "@/components/clientes/ui";
import { SubTabs } from "@/components/sub-tabs";
import { calcularProgresso } from "@/lib/clientes/jornada";
import { ROTULO_ETAPA, ROTULO_SAUDE, TOM_SAUDE } from "@/lib/clientes/tipos";
import { obterCliente } from "./dados";

export default async function ClienteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { acompanhamento: a, etapas } = await obterCliente(id);
  const base = `/escritorio/clientes/${id}`;
  const progresso = calcularProgresso(etapas);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-col gap-1">
        <Link href="/escritorio/clientes" className="text-xs font-semibold text-cinza-medio hover:text-azul-noite">
          ← Clientes
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-bold text-azul-noite">{a.organizacaoNome}</h1>
          <Selo>{ROTULO_ETAPA[a.etapaAtual]}</Selo>
          <Selo tom={TOM_SAUDE[a.saude]}>Saúde: {ROTULO_SAUDE[a.saude]}</Selo>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-cinza-claro">
            <div className="h-full rounded-full bg-ambar" style={{ width: `${progresso}%` }} />
          </div>
          <span className="text-xs text-cinza-medio">{progresso}% da jornada M.E.G.A.</span>
        </div>
      </div>
      <SubTabs
        items={[
          { label: "Visão geral", href: base },
          { label: "Jornada M.E.G.A.", href: `${base}/jornada` },
          { label: "Reuniões", href: `${base}/reunioes` },
          { label: "Tarefas e decisões", href: `${base}/tarefas` },
          { label: "Diagnóstico", href: `${base}/diagnostico` },
          { label: "Indicadores", href: `${base}/indicadores` },
          { label: "Documentos e acessos", href: `${base}/documentos` },
        ]}
      />
      {children}
    </div>
  );
}
