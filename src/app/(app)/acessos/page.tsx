import { Th } from "@/components/tabela";
import { AcoesVinculo } from "@/components/acoes-vinculo";
import { ChaveExtratoEstoque } from "@/components/chave-extrato-estoque";
import { EditarNomeVinculo } from "@/components/editar-nome-vinculo";
import { ResponsavelAvisos, TextoResponsavelAvisos } from "@/components/garante/responsavel-avisos";
import { definirResponsavelAvisosGaranteAction } from "./actions";
import { carregarAvisosGaranteAcessos, carregarPainelAcessos } from "./dados";

const ROTULO_TIPO_CLIENTE: Record<string, string> = {
  consultoria: "Consultoria",
  saas: "SaaS",
  hybrid: "Híbrido",
};

const ROTULO_ROLE: Record<string, string> = {
  master: "Master",
  gestao: "Gestão",
  operacional: "Operacional",
};

function Pill({ tom, children }: { tom: "verde" | "vermelho" | "ambar" | "cinza"; children: React.ReactNode }) {
  const cores = {
    verde: "bg-verde/10 text-verde",
    vermelho: "bg-vermelho/10 text-vermelho",
    ambar: "bg-ambar/15 text-ambar",
    cinza: "bg-cinza-claro text-cinza-medio",
  }[tom];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cores}`}>{children}</span>;
}

export default async function AcessosPage() {
  const [{ organizacoes, unidades, vinculos }, avisosGarante] = await Promise.all([carregarPainelAcessos(), carregarAvisosGaranteAcessos()]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Organizações <span className="text-sm font-normal text-cinza-medio">({organizacoes.length})</span>
        </h2>
        <div className="mt-2 max-h-[40vh] overflow-auto rounded-lg border border-cinza-claro">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-branco">
                <Th fixo>Nome</Th>
                <Th>ID</Th>
                <Th>Tipo</Th>
                <Th align="center">Unidades</Th>
                <Th align="center">Situação</Th>
              </tr>
            </thead>
            <tbody>
              {organizacoes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-cinza-medio">
                    Nenhuma organização cadastrada ainda.
                  </td>
                </tr>
              )}
              {organizacoes.map((o) => (
                <tr key={o.id} className="border-t border-cinza-claro odd:bg-off-white/50">
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-azul-noite">{o.nome}</td>
                  <td className="px-3 py-2 font-mono text-xs text-cinza-medio">{o.id}</td>
                  <td className="px-3 py-2">{ROTULO_TIPO_CLIENTE[o.tipoCliente] ?? o.tipoCliente}</td>
                  <td className="px-3 py-2 text-center">{o.totalUnidades}</td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={o.ativo ? "verde" : "cinza"}>{o.ativo ? "Ativo" : "Inativo"}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Unidades <span className="text-sm font-normal text-cinza-medio">({unidades.length})</span>
        </h2>
        <div className="mt-2 max-h-[40vh] overflow-auto rounded-lg border border-cinza-claro">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-branco">
                <Th fixo>Nome</Th>
                <Th>Organização</Th>
                <Th>Fonte do estoque</Th>
                <Th align="center">Planilha</Th>
                <Th align="center">Consolidado de vendas</Th>
                <Th align="center">Extrato do estoque</Th>
              </tr>
            </thead>
            <tbody>
              {unidades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-cinza-medio">
                    Nenhuma unidade cadastrada ainda.
                  </td>
                </tr>
              )}
              {unidades.map((u) => (
                <tr key={u.id} className="border-t border-cinza-claro odd:bg-off-white/50">
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-azul-noite">{u.nome}</td>
                  <td className="px-3 py-2">{u.organizacaoNome}</td>
                  <td className="px-3 py-2">{u.fonteDadosEstoque === "banco" ? "Banco" : "Planilha"}</td>
                  <td className="px-3 py-2 text-center">
                    {u.fonteDadosEstoque === "planilha" ? (
                      u.spreadsheetId ? (
                        <Pill tom="verde">conectada</Pill>
                      ) : (
                        <Pill tom="ambar">pendente</Pill>
                      )
                    ) : (
                      <span className="text-cinza-medio">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={u.consolidadoVendasHabilitado ? "verde" : "cinza"}>
                      {u.consolidadoVendasHabilitado ? "Habilitado" : "Desligado"}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ChaveExtratoEstoque
                      unidadeId={u.id}
                      ligada={u.extratoEstoqueHabilitado}
                      temEstoqueNoBanco={u.fonteDadosEstoque === "banco"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Acompanha o Garante <span className="text-sm font-normal text-cinza-medio">({avisosGarante.length})</span>
        </h2>
        <p className="text-xs text-cinza-medio">
          Quem recebe no WhatsApp, pelo Vini, os avisos de checklist atrasado, não concluído e item crítico fora da meta. Só unidades com o Checklist Garante ligado; a gestão do cliente também troca em Garante &gt; Modelos &gt; Regras da unidade.
        </p>
        <div className="mt-2 max-h-[40vh] overflow-auto rounded-lg border border-cinza-claro">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-branco">
                <Th fixo>Unidade</Th>
                <Th>Organização</Th>
                <Th>Responsável</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {avisosGarante.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-cinza-medio">
                    Nenhuma unidade com o Checklist Garante ligado.
                  </td>
                </tr>
              )}
              {avisosGarante.map((u) => (
                <tr key={u.unidadeId} className="border-t border-cinza-claro odd:bg-off-white/50">
                  <td className="sticky left-0 bg-inherit px-3 py-2 font-medium text-azul-noite">{u.unidadeNome}</td>
                  <td className="px-3 py-2">{u.organizacaoNome}</td>
                  <td className="px-3 py-2">
                    <TextoResponsavelAvisos atual={u.atual} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <ResponsavelAvisos
                        unidadeNome={u.unidadeNome}
                        atual={u.atual}
                        candidatos={u.candidatos}
                        aoDefinir={definirResponsavelAvisosGaranteAction.bind(null, u.unidadeId)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Usuários e vínculos <span className="text-sm font-normal text-cinza-medio">({vinculos.length})</span>
        </h2>
        <div className="mt-2 max-h-[50vh] overflow-auto rounded-lg border border-cinza-claro">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-branco">
                <Th fixo>Usuário</Th>
                <Th>Organização</Th>
                <Th>Unidade</Th>
                <Th align="center">Papel</Th>
                <Th align="center">Situação</Th>
                <Th align="center">Conta</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {vinculos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-cinza-medio">
                    Nenhum vínculo cadastrado ainda.
                  </td>
                </tr>
              )}
              {vinculos.map((v) => (
                <tr key={v.id} className="border-t border-cinza-claro odd:bg-off-white/50">
                  <td className="sticky left-0 bg-inherit px-3 py-2">
                    <EditarNomeVinculo userId={v.userId} nomeAtual={v.nome} />
                    <p className="text-xs text-cinza-medio">{v.email}</p>
                  </td>
                  <td className="px-3 py-2">{v.organizacaoNome}</td>
                  <td className="px-3 py-2">{v.unidadeNome ?? "Todas as unidades"}</td>
                  <td className="px-3 py-2 text-center">{ROTULO_ROLE[v.role] ?? v.role}</td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={v.status === "ativo" ? "verde" : v.status === "revogado" ? "vermelho" : "ambar"}>
                      {v.status}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={v.confirmado ? "verde" : "ambar"}>
                      {v.confirmado ? "confirmada" : "aguardando"}
                    </Pill>
                  </td>
                  <td className="px-3 py-2">
                    {v.role === "master" ? (
                      <p className="text-right text-xs text-cinza-medio">Gerenciado fora do painel</p>
                    ) : (
                      <AcoesVinculo vinculoId={v.id} userId={v.userId} status={v.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
