import Link from "next/link";
import { DicaCalculo } from "@/components/dica-calculo";
import { IconeNavegacao, type NomeIconeNavegacao } from "@/components/icones-navegacao";

// Dashboard por área do piloto (Navegação V2, fase 3, 24/10/2026): proposta
// pedida por Vinícius ao dono, separada do Início de atalhos. Cada área é um
// cartão com os números que o app JÁ calcula em outra tela (mesma função, mesmo
// número) e o "i" com a fórmula. Área sem número pronto aparece como
// "Proposta", só com o que mostraria: nunca número inventado.

export type NumeroArea = { rotulo: string; valor: string; dica: string; alerta?: boolean };

export type AreaDashboard = {
  area: string;
  icone: NomeIconeNavegacao;
  /** Tela onde o número nasce (mesmo cálculo). */
  href: string;
  rotuloLink: string;
} & (
  | { tipo: "dados"; contexto: string; numeros: NumeroArea[] }
  | { tipo: "erro" }
  | { tipo: "proposta"; itens: string[] }
);

export function DashboardAreas({ areas, mes }: { areas: AreaDashboard[]; mes: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Dashboard</h1>
      <p className="text-sm text-cinza-medio">
        Os números de cada área em {mes}, os mesmos das telas de origem. Toque no{" "}
        <span className="font-semibold italic">i</span> para ver como cada um é calculado.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {areas.map((area) => (
          <CartaoArea key={area.area} area={area} />
        ))}
      </div>
    </div>
  );
}

function CartaoArea({ area }: { area: AreaDashboard }) {
  const proposta = area.tipo === "proposta";
  return (
    <section
      aria-label={area.area}
      className={`flex flex-col rounded-2xl border bg-branco p-4 sm:p-5 ${
        proposta ? "border-dashed border-cinza-medio/50 bg-off-white" : "border-cinza-claro"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-ambar/15 text-azul-noite">
          <IconeNavegacao nome={area.icone} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-azul-noite">{area.area}</h2>
          {area.tipo === "dados" && <p className="truncate text-[12.5px] text-cinza-medio">{area.contexto}</p>}
        </div>
        {proposta && (
          <span className="shrink-0 rounded-full border border-dashed border-ambar px-2 py-0.5 text-[11px] font-bold text-azul-noite">
            Proposta
          </span>
        )}
      </div>

      {area.tipo === "dados" && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-cinza-claro pt-3">
          {area.numeros.map((numero) => (
            <div key={numero.rotulo} className="min-w-0">
              {/* Rótulo quebra linha (no celular "Itens que pedem compra" não cabe numa linha). */}
              <dt className="flex items-start gap-1 text-[12.5px] leading-snug text-cinza-medio">
                <span>{numero.rotulo}</span>
                <span className="mt-px">
                  <DicaCalculo rotulo={numero.rotulo} texto={numero.dica} />
                </span>
              </dt>
              <dd className={`break-words text-lg font-extrabold sm:text-xl ${numero.alerta ? "text-ambar" : "text-azul-noite"}`}>
                {numero.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {area.tipo === "erro" && (
        <p className="mt-3 border-t border-cinza-claro pt-3 text-sm text-cinza-medio">
          Não foi possível carregar agora. Os números continuam na tela de origem.
        </p>
      )}

      {area.tipo === "proposta" && (
        <div className="mt-3 border-t border-dashed border-cinza-medio/40 pt-3">
          <p className="text-[12.5px] font-semibold text-azul-noite">O que este bloco mostraria (ainda sem cálculo pronto no app):</p>
          <ul className="mt-1.5 list-disc pl-5 text-[12.5px] text-cinza-medio">
            {area.itens.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={area.href}
        className="mt-3 self-start text-sm font-semibold text-azul-petroleo hover:text-ambar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ambar"
      >
        {area.rotuloLink}
      </Link>
    </section>
  );
}
