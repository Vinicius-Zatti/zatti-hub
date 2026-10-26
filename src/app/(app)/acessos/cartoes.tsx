import { AcoesVinculo } from "@/components/acoes-vinculo";
import { GerarSenhaProvisoria } from "@/components/gerar-senha-provisoria";
import { ChaveExtratoEstoque } from "@/components/chave-extrato-estoque";
import { EditarNomeVinculo } from "@/components/editar-nome-vinculo";
import { ResponsavelAvisos, TextoResponsavelAvisos } from "@/components/garante/responsavel-avisos";
import { definirResponsavelAvisosGaranteAction } from "./actions";
import { TextoTitular, TitularOrganizacao } from "@/components/acessos/titular-organizacao";
import type { AvisosGaranteUnidade, OrganizacaoPainel, UnidadePainel, VinculoPainel } from "./dados";

/** Versão em cartões das tabelas de Acessos, só abaixo de `md` (26/10/2026).
 * No desktop a página continua com as tabelas dentro de `TabelaRolavel`.
 * Mesmos componentes de ação da tabela; aqui muda só a apresentação. */

export const ROTULO_TIPO_CLIENTE: Record<string, string> = {
  consultoria: "Consultoria",
  saas: "SaaS",
  hybrid: "Híbrido",
};

export const ROTULO_ROLE: Record<string, string> = {
  master: "Master",
  gestao: "Gestão",
  operacional: "Operacional",
};

type Tom = "verde" | "vermelho" | "ambar" | "cinza" | "azul";

export function Pill({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  const cores = {
    verde: "bg-verde/10 text-verde",
    vermelho: "bg-vermelho/10 text-vermelho",
    ambar: "bg-ambar/15 text-ambar",
    cinza: "bg-cinza-claro text-cinza-medio",
    azul: "bg-azul-petroleo/10 text-azul-petroleo",
  }[tom];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cores}`}>{children}</span>;
}

export function tomSituacaoVinculo(status: string): Tom {
  return status === "ativo" ? "verde" : status === "revogado" ? "vermelho" : "ambar";
}

const LISTA = "flex flex-col gap-3 md:hidden";
const CARTAO = "flex flex-col gap-3 rounded-lg border border-cinza-claro bg-branco p-3";

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed border-cinza-claro bg-branco px-3 py-6 text-center text-sm text-cinza-medio md:hidden">
      {texto}
    </p>
  );
}

/** Ações de um vínculo, iguais na tabela e no cartão. Master não se edita pelo painel. */
export function AcoesDoVinculo({
  vinculo: v,
  unidades,
  meuUserId,
  layout,
}: {
  vinculo: VinculoPainel;
  unidades: UnidadePainel[];
  meuUserId: string;
  layout: "tabela" | "cartao";
}) {
  const outraPessoaComAcesso = v.userId !== meuUserId && v.status !== "revogado";
  const cartao = layout === "cartao";

  if (v.role === "master") {
    return (
      <div className={cartao ? "flex flex-wrap items-center justify-between gap-2" : "flex flex-col items-end gap-1"}>
        <p className={`text-xs text-cinza-medio ${cartao ? "" : "text-right"}`}>Gerenciado fora do painel</p>
        {outraPessoaComAcesso && (
          <GerarSenhaProvisoria
            modo="master"
            vinculoId={v.id}
            nomeExibido={v.nome ?? v.email}
            whatsappFinal={v.whatsappFinal}
            className={`rounded-md border border-ambar text-xs font-semibold text-ambar hover:bg-ambar/10 disabled:opacity-40 ${
              cartao ? "whitespace-nowrap px-3 py-1.5" : "px-2 py-1"
            }`}
          />
        )}
      </div>
    );
  }

  return (
    <AcoesVinculo
      vinculoId={v.id}
      userId={v.userId}
      status={v.status}
      nomeExibido={v.nome ?? v.email}
      whatsappFinal={v.whatsappFinal}
      podeGerarProvisoria={outraPessoaComAcesso}
      layout={layout}
      edicao={
        outraPessoaComAcesso
          ? {
              role: v.role as "gestao" | "operacional",
              unidadeId: v.unidadeId,
              unidades: unidades
                .filter((u) => u.organizacaoId === v.organizacaoId && u.ativo)
                .map((u) => ({ id: u.id, nome: u.nome })),
              organizacaoNome: v.organizacaoNome,
            }
          : null
      }
    />
  );
}

export function CartoesOrganizacoes({ organizacoes }: { organizacoes: OrganizacaoPainel[] }) {
  if (organizacoes.length === 0) return <Vazio texto="Nenhuma organização cadastrada ainda." />;
  return (
    <ul className={LISTA}>
      {organizacoes.map((o) => (
        <li key={o.id} className={CARTAO}>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-semibold text-azul-noite" title={o.nome}>
              {o.nome}
            </p>
            <Pill tom={o.ativo ? "verde" : "cinza"}>{o.ativo ? "Ativo" : "Inativo"}</Pill>
          </div>
          <p className="text-xs text-cinza">
            {ROTULO_TIPO_CLIENTE[o.tipoCliente] ?? o.tipoCliente} · {o.totalUnidades}{" "}
            {o.totalUnidades === 1 ? "unidade" : "unidades"}
          </p>
          <p className="truncate font-mono text-[11px] text-cinza-medio" title={o.id}>
            ID {o.id}
          </p>
          <div className="flex flex-col gap-2 border-t border-cinza-claro pt-3">
            <p className="text-sm text-cinza">
              <span className="text-xs font-semibold text-cinza-medio">Titular: </span>
              <TextoTitular titular={o.titular} />
            </p>
            <TitularOrganizacao organizacao={o} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartoesUnidades({ unidades }: { unidades: UnidadePainel[] }) {
  if (unidades.length === 0) return <Vazio texto="Nenhuma unidade cadastrada ainda." />;
  return (
    <ul className={LISTA}>
      {unidades.map((u) => {
        const planilha = u.fonteDadosEstoque === "planilha";
        return (
          <li key={u.id} className={CARTAO}>
            <div className="min-w-0">
              <p className="truncate font-semibold text-azul-noite" title={u.nome}>
                {u.nome}
              </p>
              <p className="truncate text-xs text-cinza-medio" title={u.organizacaoNome}>
                {u.organizacaoNome}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tom="azul">Estoque {planilha ? "na planilha" : "no banco"}</Pill>
              {planilha &&
                (u.spreadsheetId ? (
                  <Pill tom="verde">Planilha conectada</Pill>
                ) : (
                  <Pill tom="ambar">Planilha pendente</Pill>
                ))}
              <Pill tom={u.consolidadoVendasHabilitado ? "verde" : "cinza"}>
                Consolidado de vendas {u.consolidadoVendasHabilitado ? "habilitado" : "desligado"}
              </Pill>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cinza-claro pt-3">
              <span className="text-xs font-semibold text-cinza-medio">Extrato do estoque</span>
              <ChaveExtratoEstoque
                unidadeId={u.id}
                ligada={u.extratoEstoqueHabilitado}
                temEstoqueNoBanco={!planilha}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CartoesAvisosGarante({ avisos }: { avisos: AvisosGaranteUnidade[] }) {
  if (avisos.length === 0) return <Vazio texto="Nenhuma unidade com o Checklist Garante ligado." />;
  return (
    <ul className={LISTA}>
      {avisos.map((u) => (
        <li key={u.unidadeId} className={CARTAO}>
          <div className="min-w-0">
            <p className="truncate font-semibold text-azul-noite" title={u.unidadeNome}>
              {u.unidadeNome}
            </p>
            <p className="truncate text-xs text-cinza-medio" title={u.organizacaoNome}>
              {u.organizacaoNome}
            </p>
          </div>
          <p className="text-sm text-cinza">
            <span className="text-xs font-semibold text-cinza-medio">Responsável: </span>
            <TextoResponsavelAvisos atual={u.atual} />
          </p>
          <div className="border-t border-cinza-claro pt-3">
            <ResponsavelAvisos
              unidadeNome={u.unidadeNome}
              atual={u.atual}
              candidatos={u.candidatos}
              aoDefinir={definirResponsavelAvisosGaranteAction.bind(null, u.unidadeId)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CartoesVinculos({
  vinculos,
  unidades,
  meuUserId,
}: {
  vinculos: VinculoPainel[];
  unidades: UnidadePainel[];
  meuUserId: string;
}) {
  if (vinculos.length === 0) return <Vazio texto="Nenhum vínculo cadastrado ainda." />;
  return (
    <ul className={LISTA}>
      {vinculos.map((v) => (
        <li key={v.id} className={CARTAO}>
          <div className="min-w-0">
            <EditarNomeVinculo userId={v.userId} nomeAtual={v.nome} />
            <p className="truncate text-xs text-cinza-medio" title={v.email}>
              {v.email}
            </p>
          </div>
          <p className="text-xs text-cinza">
            {v.organizacaoNome} · {v.unidadeNome ?? "Todas as unidades"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Pill tom="azul">{ROTULO_ROLE[v.role] ?? v.role}</Pill>
            {v.ehTitular && <Pill tom="ambar">Titular</Pill>}
            <Pill tom={tomSituacaoVinculo(v.status)}>{v.status}</Pill>
            <Pill tom={v.confirmado ? "verde" : "ambar"}>
              {v.confirmado ? "conta confirmada" : "conta aguardando"}
            </Pill>
          </div>
          <div className="border-t border-cinza-claro pt-3">
            <AcoesDoVinculo vinculo={v} unidades={unidades} meuUserId={meuUserId} layout="cartao" />
          </div>
        </li>
      ))}
    </ul>
  );
}
