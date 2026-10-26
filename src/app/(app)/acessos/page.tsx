import { Th } from "@/components/tabela";
import { TabelaRolavel } from "@/components/tabela-rolavel";
import { requireMaster } from "@/lib/acesso";
import { ChaveExtratoEstoque } from "@/components/chave-extrato-estoque";
import { EditarNomeVinculo } from "@/components/editar-nome-vinculo";
import { ResponsavelAvisos, TextoResponsavelAvisos } from "@/components/garante/responsavel-avisos";
import { definirResponsavelAvisosGaranteAction } from "./actions";
import { TextoTitular, TitularOrganizacao } from "@/components/acessos/titular-organizacao";
import { carregarAvisosGaranteAcessos, carregarPainelAcessos } from "./dados";
import {
  AcoesDoVinculo,
  CartoesAvisosGarante,
  CartoesOrganizacoes,
  CartoesUnidades,
  CartoesVinculos,
  Pill,
  ROTULO_ROLE,
  ROTULO_TIPO_CLIENTE,
  tomSituacaoVinculo,
} from "./cartoes";

export default async function AcessosPage() {
  const [{ organizacoes, unidades, vinculos }, avisosGarante, acesso] = await Promise.all([
    carregarPainelAcessos(),
    carregarAvisosGaranteAcessos(),
    requireMaster(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Organizações <span className="text-sm font-normal text-cinza-medio">({organizacoes.length})</span>
        </h2>
        <div className="mt-2">
          <CartoesOrganizacoes organizacoes={organizacoes} />
          <div className="hidden md:block">
          <TabelaRolavel className="max-h-[40vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Organizações">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-branco">
                <Th fixo>Nome</Th>
                <Th>ID</Th>
                <Th>Tipo</Th>
                <Th align="center">Unidades</Th>
                <Th align="center">Situação</Th>
                <Th>Titular</Th>
                <Th align="right">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {organizacoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-cinza-medio">
                    Nenhuma organização cadastrada ainda.
                  </td>
                </tr>
              )}
              {organizacoes.map((o) => (
                <tr key={o.id} className="group border-t border-cinza-claro odd:bg-off-white">
                  <td className="sticky left-0 z-10 bg-branco group-odd:bg-off-white px-3 py-2 font-medium text-azul-noite">{o.nome}</td>
                  <td className="px-3 py-2 font-mono text-xs text-cinza-medio">{o.id}</td>
                  <td className="px-3 py-2">{ROTULO_TIPO_CLIENTE[o.tipoCliente] ?? o.tipoCliente}</td>
                  <td className="px-3 py-2 text-center">{o.totalUnidades}</td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={o.ativo ? "verde" : "cinza"}>{o.ativo ? "Ativo" : "Inativo"}</Pill>
                  </td>
                  <td className="px-3 py-2">
                    <TextoTitular titular={o.titular} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <TitularOrganizacao organizacao={o} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TabelaRolavel>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Unidades <span className="text-sm font-normal text-cinza-medio">({unidades.length})</span>
        </h2>
        <div className="mt-2">
          <CartoesUnidades unidades={unidades} />
          <div className="hidden md:block">
          <TabelaRolavel className="max-h-[40vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Unidades">
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
                <tr key={u.id} className="group border-t border-cinza-claro odd:bg-off-white">
                  <td className="sticky left-0 z-10 bg-branco group-odd:bg-off-white px-3 py-2 font-medium text-azul-noite">{u.nome}</td>
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
          </TabelaRolavel>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Acompanha o Garante <span className="text-sm font-normal text-cinza-medio">({avisosGarante.length})</span>
        </h2>
        <p className="text-xs text-cinza-medio">
          Quem recebe no WhatsApp, pelo Vini, os avisos de checklist atrasado, não concluído e item crítico fora da meta. Só unidades com o Checklist Garante ligado; a gestão do cliente também troca em Garante &gt; Modelos &gt; Regras da unidade.
        </p>
        <div className="mt-2">
          <CartoesAvisosGarante avisos={avisosGarante} />
          <div className="hidden md:block">
          <TabelaRolavel className="max-h-[40vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Quem acompanha o Garante por unidade">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-azul-petroleo text-branco">
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
                  <tr key={u.unidadeId} className="group border-t border-cinza-claro odd:bg-off-white">
                    <td className="sticky left-0 z-10 bg-branco group-odd:bg-off-white px-3 py-2 font-medium text-azul-noite">{u.unidadeNome}</td>
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
          </TabelaRolavel>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Usuários e vínculos <span className="text-sm font-normal text-cinza-medio">({vinculos.length})</span>
        </h2>
        <div className="mt-2">
          <CartoesVinculos vinculos={vinculos} unidades={unidades} meuUserId={acesso.userId} />
          <div className="hidden md:block">
          <TabelaRolavel className="max-h-[50vh] rounded-lg border border-cinza-claro bg-branco" ariaLabel="Usuários e vínculos">
          <table className="w-full min-w-[820px] text-sm">
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
                <tr key={v.id} className="group border-t border-cinza-claro odd:bg-off-white">
                  <td className="sticky left-0 z-10 bg-branco group-odd:bg-off-white px-3 py-2">
                    <EditarNomeVinculo userId={v.userId} nomeAtual={v.nome} />
                    <p className="text-xs text-cinza-medio">{v.email}</p>
                  </td>
                  <td className="px-3 py-2">{v.organizacaoNome}</td>
                  <td className="px-3 py-2">{v.unidadeNome ?? "Todas as unidades"}</td>
                  <td className="px-3 py-2 text-center">
                    {ROTULO_ROLE[v.role] ?? v.role}
                    {v.ehTitular && (
                      <span className="ml-1">
                        <Pill tom="ambar">Titular</Pill>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={tomSituacaoVinculo(v.status)}>
                      {v.status}
                    </Pill>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Pill tom={v.confirmado ? "verde" : "ambar"}>
                      {v.confirmado ? "confirmada" : "aguardando"}
                    </Pill>
                  </td>
                  <td className="px-3 py-2">
                    <AcoesDoVinculo vinculo={v} unidades={unidades} meuUserId={acesso.userId} layout="tabela" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TabelaRolavel>
          </div>
        </div>
      </section>
    </div>
  );
}
