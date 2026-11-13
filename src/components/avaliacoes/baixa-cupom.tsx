"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { baixarCupomAction } from "@/app/(app)/avaliacoes/actions";

/** Campo para dar baixa no cupom que o cliente informou no pedido direto. */
export function BaixaCupom({ podeEditar }: { podeEditar: boolean }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [pendente, startTransition] = useTransition();
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);

  if (!podeEditar) return <p className="text-sm text-cinza-medio">Só quem edita as Avaliações dá baixa em cupom.</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setAviso(null);
        startTransition(async () => {
          const r = await baixarCupomAction(codigo);
          if ("erro" in r) {
            setAviso({ tom: "erro", texto: r.erro });
            return;
          }
          setAviso({ tom: "ok", texto: `Baixa feita: ${r.premio}${r.regra ? ` (${r.regra})` : ""}. Pode aplicar no pedido.` });
          setCodigo("");
          router.refresh();
        });
      }}
      className="flex flex-col gap-2"
    >
      <label className="text-xs font-semibold text-cinza-medio">
        Código que o cliente informou
        <span className="mt-1 flex gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            maxLength={12}
            placeholder="K7P2QM"
            autoCapitalize="characters"
            className="w-40 rounded-md border border-cinza-claro bg-branco px-2 py-1.5 font-mono text-base tracking-widest"
          />
          <button type="submit" disabled={pendente || !codigo.trim()} className="rounded-md bg-azul-noite px-4 py-2 text-sm font-semibold text-branco disabled:opacity-60">
            {pendente ? "Conferindo..." : "Conferir e dar baixa"}
          </button>
        </span>
      </label>
      {aviso && <p className={`text-sm font-semibold ${aviso.tom === "ok" ? "text-verde" : "text-vermelho"}`}>{aviso.texto}</p>}
    </form>
  );
}
