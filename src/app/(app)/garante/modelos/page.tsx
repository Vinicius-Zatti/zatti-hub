import Link from "next/link";
import { requireGestaoGarante } from "@/lib/acesso";
import { BIBLIOTECA_POPS } from "@/lib/garante/biblioteca";
import { DicaCalculo } from "@/components/dica-calculo";
import { NovoChecklistEmBranco } from "@/components/garante/novo-checklist-em-branco";
import { RegrasUnidade } from "@/components/garante/regras-unidade";
import { hojeOperacao, somarDias } from "@/lib/garante/regras";
import { criarModeloAction } from "../actions";
import { carregarAvisosGarante, carregarModelos, carregarRegras } from "../dados";

const ERROS: Record<string, string> = {
  nome: "Dê um nome ao checklist.",
  criar: "Não foi possível criar o checklist.",
  itens: "Não foi possível copiar os itens do POP.",
};

/** Modelos: a etapa Estrutura vira rotina. Cada POP da Zatti vira um checklist
 * pronto para ajustar e publicar. */
export default async function ModelosPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const acesso = await requireGestaoGarante();
  const { erro } = await searchParams;
  const hoje = hojeOperacao();
  const [modelos, regras, avisos] = await Promise.all([carregarModelos(acesso), carregarRegras(acesso, hoje), carregarAvisosGarante(acesso)]);
  const usados = new Set(modelos.map((m) => m.origemPop).filter(Boolean));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Modelos e publicação</h1>
        <p className="text-sm text-cinza-medio">
          Escolha um POP da Zatti, ajuste os itens e publique para quem faz e até que horas. Usar um POP cria uma cópia só desta unidade; o POP original não muda.
        </p>
      </div>
      {erro && ERROS[erro] && <p className="text-sm text-vermelho">{ERROS[erro]}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">
          Checklists da unidade <span className="text-sm font-normal text-cinza-medio">({modelos.length})</span>
        </h2>
        {modelos.length === 0 && <p className="text-sm text-cinza-medio">Nenhum ainda. Comece por um POP abaixo.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {modelos.map((m) => (
            <Link
              key={m.id}
              href={`/garante/modelos/${m.id}`}
              className="flex flex-col gap-1 rounded-lg border border-cinza-claro bg-branco p-4 hover:border-azul-petroleo"
            >
              <span className="font-semibold text-azul-noite">{m.nome}</span>
              <span className="text-xs text-cinza-medio">
                {m.itens} itens · {m.publicacoes === 0 ? "não publicado (ninguém recebe)" : `${m.publicacoes} ${m.publicacoes === 1 ? "programação ativa" : "programações ativas"}`}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <RegrasUnidade
        vigente={regras.vigente}
        agendadas={regras.agendadas}
        diasSemOperacao={regras.diasSemOperacao}
        amanha={somarDias(hoje, 1)}
        unidadeNome={acesso.unidadeNome}
        avisos={avisos}
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">Biblioteca de POPs Zatti</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {BIBLIOTECA_POPS.map((pop) => (
            <form key={pop.chave} action={criarModeloAction} className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4">
              <input type="hidden" name="biblioteca" value={pop.chave} />
              <span className="font-semibold text-azul-noite">{pop.nome}</span>
              <span className="text-xs text-cinza-medio">{pop.descricao}</span>
              <span className="text-xs text-cinza-medio">
                {pop.itens.length} itens · {pop.itens.filter((i) => i.foto).length} com foto{" "}
                <DicaCalculo rotulo="itens com foto" texto="Quantos itens deste POP já nascem pedindo foto: os que dá para provar numa foto (temperatura, limpeza, etiqueta, óleo, gás). Sem a foto, o item não conta como feito. Dá para mudar item a item depois de criar." />{" "}
                · {pop.quando}
              </span>
              <button
                type="submit"
                className="self-start rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
              >
                {usados.has(pop.chave) ? "Criar outra cópia" : "Usar este POP"}
              </button>
            </form>
          ))}
          <NovoChecklistEmBranco />
        </div>
      </section>
    </div>
  );
}
