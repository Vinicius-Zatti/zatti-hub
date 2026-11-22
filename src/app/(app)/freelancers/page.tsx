import { temPermissao } from "@/lib/acesso";
import { requireFreelancers } from "@/lib/freelancers/acesso";
import { carregarConfiguracao, listarCheckins, listarFreelancers } from "@/lib/freelancers/servidor";
import { hojeIsoBrasil } from "@/lib/financeiro-gerencial/datas";
import { formatarDataBr } from "@/lib/financeiro-gerencial/datas";
import { CriarConfiguracao } from "@/components/freelancers/criar-configuracao";
import { TelaHoje } from "@/components/freelancers/tela-hoje";

/** Hoje: quem fez check-in, conferência do gerente e o que já foi para o Contas a Pagar. */
export default async function FreelancersHojePage() {
  const acesso = await requireFreelancers();
  const podeEditar = temPermissao(acesso, "freelancers", "editar");
  const configuracao = await carregarConfiguracao(acesso);
  if (!configuracao) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-bold text-azul-noite">Freelancers</h1>
        <CriarConfiguracao unidadeNome={acesso.unidadeNome} podeEditar={podeEditar} />
      </div>
    );
  }
  const hoje = hojeIsoBrasil();
  const [{ checkins }, freelancers] = await Promise.all([listarCheckins(acesso, hoje, hoje), listarFreelancers(acesso)]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Freelancers de hoje, {formatarDataBr(hoje)}</h1>
        <p className="text-sm text-cinza-medio">
          Quem chegou faz o check-in pelo QR Code da loja. Confira quem trabalhou e o valor da diária: a diária conferida vai sozinha para o Contas a Pagar,
          na conta Freelancers. Se o caixa já pagou, marque e o título nasce quitado.
        </p>
        {!configuracao.ativa && (
          <p className="mt-1 text-sm font-semibold text-ambar">O check-in pelo QR está fechado: quem ler o código agora vê um aviso. Abra em Configurar.</p>
        )}
      </div>
      <TelaHoje
        checkins={checkins}
        freelancers={freelancers}
        diariaPadrao={configuracao.diariaPadrao}
        hoje={hoje}
        podeEditar={podeEditar}
      />
    </div>
  );
}
