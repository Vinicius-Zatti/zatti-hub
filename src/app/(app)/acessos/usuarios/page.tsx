import { ConvidarUsuarioForm } from "@/components/convidar-usuario-form";
import { carregarPainelAcessos } from "../dados";

export default async function AcessosUsuariosPage() {
  const { organizacoes, unidades } = await carregarPainelAcessos();

  return (
    <div>
      <h2 className="font-display text-lg font-bold text-azul-noite">Convidar usuário</h2>
      <p className="mt-1 text-sm text-cinza-medio">
        A pessoa recebe um email e cria a própria senha - o painel nunca mostra nem define
        senha nenhuma. Se o email já tiver conta no Zatti Hub, só o vínculo novo é criado.
      </p>
      <ConvidarUsuarioForm
        organizacoes={organizacoes.map((o) => ({ id: o.id, nome: o.nome }))}
        unidades={unidades.map((u) => ({ id: u.id, organizacaoId: u.organizacaoId, nome: u.nome }))}
      />
      <p className="mt-6 text-sm text-cinza-medio">
        Pra revogar, reativar ou reenviar acesso de um vínculo existente, veja a lista completa
        em{" "}
        <a href="/acessos" className="font-semibold text-azul-petroleo underline">
          Visão geral
        </a>
        .
      </p>
    </div>
  );
}
