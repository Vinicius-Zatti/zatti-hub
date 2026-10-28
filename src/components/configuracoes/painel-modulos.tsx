import { ListaModulos } from "@/components/configuracoes/lista-modulos";
import { FRASE_DONO_CONTAGEM_SETOR, FRASE_DONO_MODULOS, type EstadoModulo } from "@/lib/configuracoes/modulos";

/** Configurações > Módulos: master liga e desliga; o dono vê o estado e a
 * frase para falar com a Zatti (módulo pode ser pago). */
export function PainelModulos({
  modulos,
  ehMaster,
  unidadeNome,
}: {
  modulos: EstadoModulo[];
  ehMaster: boolean;
  unidadeNome: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h1 className="sr-only">Módulos da unidade</h1>
      {ehMaster ? (
        <p className="text-sm text-cinza-medio">
          Você é master: ligar ou desligar vale na hora para toda a equipe de {unidadeNome}.
        </p>
      ) : (
        <p className="rounded-xl border border-ambar/40 bg-ambar/10 px-3 py-2 text-sm font-semibold text-azul-noite">
          {FRASE_DONO_MODULOS}.
          {modulos.some((m) => m.alteravel) && <> {FRASE_DONO_CONTAGEM_SETOR}.</>}
        </p>
      )}
      <ListaModulos modulos={modulos} />
    </section>
  );
}
