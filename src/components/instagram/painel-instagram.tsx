"use client";

import Link from "next/link";
import { useState } from "react";
import { AbaDirects } from "@/components/instagram/aba-directs";
import { AbaNumeros } from "@/components/instagram/aba-numeros";
import type { LeituraInstagram, PecaSemana } from "@/lib/instagram/tipos";

const ABAS = [
  { id: "directs", rotulo: "Directs" },
  { id: "numeros", rotulo: "Números" },
  { id: "carrossel", rotulo: "Carrossel" },
] as const;

/** Painel do Instagram (05/11/2026): só o perfil @viniciusczanetti, só master.
 * O Vini é dono dos dados; fora do ar, a tela avisa e não quebra. */
export function PainelInstagram({
  dados,
  aviso,
  ignorados,
  pecasSemana,
  hoje,
  agoraMs,
}: {
  dados: LeituraInstagram | null;
  aviso: string | null;
  ignorados: number;
  pecasSemana: PecaSemana[] | null;
  hoje: string;
  agoraMs: number;
}) {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("directs");

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-azul-noite">Instagram</h1>
        <p className="text-sm text-cinza">Directs automáticos e números do @viniciusczanetti. Só você vê esta aba.</p>
      </div>

      {aviso && (
        <p role="alert" className="rounded-lg border border-ambar bg-ambar/10 px-3 py-2 text-sm text-azul-noite">
          {aviso}
        </p>
      )}
      {ignorados > 0 && (
        <p className="rounded-lg border border-cinza-claro bg-branco px-3 py-2 text-xs text-cinza-medio">
          {ignorados} registro{ignorados === 1 ? "" : "s"} do Vini veio fora do formato e ficou de fora. Isso é um erro do app, não do Instagram.
        </p>
      )}

      <div role="tablist" aria-label="Abas do Instagram" className="flex gap-1 self-start rounded-lg border border-cinza-claro bg-branco p-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${aba === a.id ? "bg-azul-noite text-branco" : "text-cinza-medio hover:text-azul-noite"}`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "carrossel" ? (
        <section className="flex flex-col gap-2 rounded-xl border border-cinza-claro bg-branco p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-azul-noite">Carrossel</h2>
          <p className="text-sm text-cinza">
            O carrossel é feito pelo time de IA no computador, a partir de um pedido registrado no Calendário de Conteúdo. Registre a peça lá, com o
            formato Carrossel de fotos, e ela entra na fila de produção.
          </p>
          <Link
            href="/escritorio/conteudo"
            title="Abre Escritório > Conteúdo para registrar o pedido do carrossel"
            className="self-start rounded-lg bg-azul-noite px-3 py-2 text-sm font-semibold text-branco hover:bg-azul-petroleo"
          >
            Registrar pedido no Conteúdo
          </Link>
        </section>
      ) : aba === "directs" ? (
        dados && <AbaDirects automacao={dados.automacao} hoje={hoje} agoraMs={agoraMs} />
      ) : (
        <AbaNumeros metricas={dados?.metricas ?? null} concorrencia={dados?.concorrencia ?? null} pecasSemana={pecasSemana} />
      )}
    </div>
  );
}
