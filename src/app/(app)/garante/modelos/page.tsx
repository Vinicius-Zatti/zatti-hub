import Link from "next/link";
import { requireGestaoGarante } from "@/lib/acesso";
import { BIBLIOTECA_POPS } from "@/lib/garante/biblioteca";
import { criarModeloAction } from "../actions";
import { carregarModelos } from "../dados";

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
  const modelos = await carregarModelos(acesso);
  const usados = new Set(modelos.map((m) => m.origemPop).filter(Boolean));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Modelos e publicação</h1>
        <p className="text-sm text-cinza-medio">
          Escolha um POP da Zatti, ajuste os itens e publique para quem faz e até que horas.
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
                {m.itens} itens · {m.publicacoes === 0 ? "não publicado" : `${m.publicacoes} publicação(ões)`}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold text-azul-noite">Biblioteca de POPs Zatti</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {BIBLIOTECA_POPS.map((pop) => (
            <form key={pop.chave} action={criarModeloAction} className="flex flex-col gap-2 rounded-lg border border-cinza-claro bg-branco p-4">
              <input type="hidden" name="biblioteca" value={pop.chave} />
              <span className="font-semibold text-azul-noite">{pop.nome}</span>
              <span className="text-xs text-cinza-medio">{pop.descricao}</span>
              <span className="text-xs text-cinza-medio">
                {pop.itens.length} itens · {pop.quando}
              </span>
              <button
                type="submit"
                className="self-start rounded-md border border-azul-petroleo px-3 py-1.5 text-xs font-semibold text-azul-petroleo hover:bg-azul-petroleo/10"
              >
                {usados.has(pop.chave) ? "Criar outra cópia" : "Usar este POP"}
              </button>
            </form>
          ))}
          <form action={criarModeloAction} className="flex flex-col gap-2 rounded-lg border border-dashed border-cinza-claro bg-branco p-4">
            <span className="font-semibold text-azul-noite">Checklist em branco</span>
            <input name="nome" required maxLength={120} placeholder="Nome do checklist" className="rounded-md border border-cinza-claro px-3 py-2 text-sm" />
            <button type="submit" className="self-start rounded-md bg-azul-noite px-3 py-1.5 text-xs font-semibold text-branco">
              Criar
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
