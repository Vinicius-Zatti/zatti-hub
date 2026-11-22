import { temPermissao } from "@/lib/acesso";
import { requireFreelancers } from "@/lib/freelancers/acesso";
import { carregarConfiguracao, listarFreelancers } from "@/lib/freelancers/servidor";
import { CadastroFreelancers } from "@/components/freelancers/cadastro";

/** Cadastro: quem trabalha de freelancer na unidade, com WhatsApp, função e diária combinada. */
export default async function FreelancersCadastroPage() {
  const acesso = await requireFreelancers();
  const [freelancers, configuracao] = await Promise.all([listarFreelancers(acesso), carregarConfiguracao(acesso)]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Cadastro de freelancers</h1>
        <p className="text-sm text-cinza-medio">
          Quem faz o check-in pelo QR é reconhecido pelo WhatsApp. A diária combinada aqui vira a sugestão na conferência; sem ela, vale a diária padrão da
          unidade{configuracao?.diariaPadrao ? "" : " (ainda não definida em Configurar)"}. Quem entrou pelo QR sem cadastro aparece como novo até a primeira
          conferência.
        </p>
      </div>
      <CadastroFreelancers freelancers={freelancers} podeEditar={temPermissao(acesso, "freelancers", "editar")} />
    </div>
  );
}
