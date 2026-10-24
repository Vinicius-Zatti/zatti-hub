import Link from "next/link";
import { DicaCalculo } from "@/components/dica-calculo";
import { IconeNavegacao, type NomeIconeNavegacao } from "@/components/icones-navegacao";

// Navegação V2 (24/10/2026): blocos das páginas de entrada do piloto (Visão
// geral do Estoque, Relatórios e Cadastros), no desenho aprovado em
// `navegacao-v2-desenho.html`: cartão branco com ícone, nome, uma linha e,
// quando houver, um número. O cartão inteiro abre a tela; o "i" do cálculo
// fica por cima do link para abrir sem navegar.

export type BlocoModulo = {
  titulo: string;
  descricao: string;
  href: string;
  icone: NomeIconeNavegacao;
  /** Número do bloco (ex.: "3"); sem número o bloco é só atalho. */
  numero?: string;
  /** Número em âmbar quando pede atenção. */
  alerta?: boolean;
  /** Explicação do cálculo do número (ícone "i"). */
  dica?: string;
};

export function BlocosModulo({ blocos, rotulo }: { blocos: BlocoModulo[]; rotulo: string }) {
  return (
    <ul aria-label={rotulo} className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {blocos.map((bloco) => (
        <li
          key={bloco.href}
          className="relative flex flex-col rounded-2xl border border-cinza-claro bg-branco p-3.5 transition-colors focus-within:border-ambar hover:border-ambar"
        >
          <span className="mb-2.5 flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-ambar/15 text-azul-noite">
            <IconeNavegacao nome={bloco.icone} className="h-5 w-5" />
          </span>
          <Link
            href={bloco.href}
            className="font-bold text-azul-noite after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ambar"
          >
            {bloco.titulo}
          </Link>
          <span className="text-[12.5px] text-cinza-medio">{bloco.descricao}</span>
          {bloco.numero !== undefined && (
            <span className="mt-1.5 flex items-center gap-1">
              <span className={`text-xl font-extrabold ${bloco.alerta ? "text-ambar" : "text-azul-noite"}`}>
                {bloco.numero}
              </span>
              {bloco.dica && (
                <span className="relative z-10">
                  <DicaCalculo rotulo={`${bloco.titulo}: ${bloco.descricao}`} texto={bloco.dica} />
                </span>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
