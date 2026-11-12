import { SELO_IA, type VereditoIa } from "@/lib/garante/ia-fotos";

/** Selo do resultado da IA na foto do item (fase de teste, 12/11/2026): verde aprovado,
 * vermelho reprovado, âmbar quando a foto não deu para conferir. Só informa. */
export function SeloIa({ veredito, motivo }: { veredito: VereditoIa; motivo: string }) {
  const selo = SELO_IA[veredito];
  return (
    <div className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-xs ${selo.classe}`}>
      <span className="font-bold">{selo.texto}</span>
      <span className="text-cinza">{motivo}</span>
    </div>
  );
}
