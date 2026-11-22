import { requireFreelancersEditar } from "@/lib/freelancers/acesso";
import { carregarConfiguracao, listarContasCaixa } from "@/lib/freelancers/servidor";
import { CriarConfiguracao } from "@/components/freelancers/criar-configuracao";
import { ConfigurarFreelancers } from "@/components/freelancers/configurar";

/** Configurar: diária padrão, conta do caixa que paga e check-in aberto ou fechado. */
export default async function FreelancersConfigurarPage() {
  const acesso = await requireFreelancersEditar();
  const configuracao = await carregarConfiguracao(acesso);
  if (!configuracao) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Configurar</h1>
        <CriarConfiguracao unidadeNome={acesso.unidadeNome} podeEditar />
      </div>
    );
  }
  const contas = await listarContasCaixa(acesso);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Configurar</h1>
        <p className="text-sm text-cinza-medio">Valem para toda a unidade.</p>
      </div>
      <ConfigurarFreelancers configuracao={configuracao} contas={contas} />
    </div>
  );
}
