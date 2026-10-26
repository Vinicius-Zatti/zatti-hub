import { requireEquipe, temPermissao } from "@/lib/acesso";
import { podeAdministrarPermissoes, podeMexerNaContaDe, podeMudarPermissoesDe } from "@/lib/permissoes/quem-administra";
import { CadastrarMembroForm } from "@/components/equipe/cadastrar-membro-form";
import { CartaoMembro } from "@/components/equipe/cartao-membro";
import { carregarEquipe } from "./dados";

/** Equipe do cliente: a gestão cadastra quem usa o Zatti Hub. A barreira é
 * `requireEquipe()` aqui e em cada Server Action de `actions.ts`; o item do
 * menu escondido é só UX. */
export default async function EquipePage() {
  const acesso = await requireEquipe();
  const { membros, unidades } = await carregarEquipe(acesso);

  const ativos = membros.filter((m) => m.situacao !== "revogado");
  const semAcesso = membros.filter((m) => m.situacao === "revogado");
  // Permissões por módulo (fase 6): "ver" a Equipe abre a lista sem botões; master e o titular
  // (sem titular marcado, a gestão de todas as unidades) mudam as permissões de cada pessoa.
  const podeEditar = temPermissao(acesso, "equipe", "editar");
  const equipePermissoes = podeEditar && podeAdministrarPermissoes(acesso)
    ? ativos.map((m) => ({
        vinculoId: m.vinculoId,
        nome: m.nome ?? m.email,
        role: m.role,
        ehDono: m.ehDono,
        excecoes: m.excecoes,
      }))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Equipe</h1>
        <p className="text-sm text-cinza-medio">
          Cadastre quem trabalha com você. O login e a senha provisória chegam no WhatsApp da pessoa, e ela
          cria a própria senha no primeiro acesso.
        </p>
      </div>

      {podeEditar ? (
        <section data-tour="equipe-cadastrar" className="rounded-lg border border-cinza-claro bg-branco p-4">
          <h2 className="font-display text-lg font-bold text-azul-noite">Cadastrar pessoa</h2>
          <CadastrarMembroForm
            unidades={unidades}
            unidadeFixa={acesso.unidadeFixa}
            organizacaoNome={acesso.organizacaoNome}
          />
        </section>
      ) : (
        <p className="rounded-md border border-ambar/40 bg-ambar/10 px-3 py-2 text-xs text-azul-noite">
          Seu acesso à Equipe é só para ver. Para cadastrar ou mudar acessos, peça a quem administra a equipe.
        </p>
      )}

      <section data-tour="equipe-com-acesso" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Com acesso <span className="text-sm font-normal text-cinza-medio">({ativos.length})</span>
        </h2>
        {ativos.length === 0 && <p className="text-sm text-cinza-medio">Ninguém cadastrado ainda.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {ativos.map((m) => (
            <CartaoMembro
              key={m.vinculoId}
              membro={m}
              unidades={unidades}
              podeTodas={!acesso.unidadeFixa}
              organizacaoNome={acesso.organizacaoNome}
              podeEditar={podeEditar}
              podeMexerNaConta={podeMexerNaContaDe(acesso, { ehTitular: m.contaTitular })}
              equipePermissoes={podeMudarPermissoesDe(acesso, { ehDono: m.ehDono }) ? equipePermissoes : null}
            />
          ))}
        </div>
      </section>

      {semAcesso.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-bold text-azul-noite">
            Sem acesso <span className="text-sm font-normal text-cinza-medio">({semAcesso.length})</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {semAcesso.map((m) => (
              <CartaoMembro
              key={m.vinculoId}
              membro={m}
              unidades={unidades}
              podeTodas={!acesso.unidadeFixa}
              organizacaoNome={acesso.organizacaoNome}
              podeEditar={podeEditar}
              podeMexerNaConta={podeMexerNaContaDe(acesso, { ehTitular: m.contaTitular })}
            />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
