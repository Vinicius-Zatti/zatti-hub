import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireEscritorio } from "@/lib/acesso";
import { carregarCliente } from "@/lib/banco/clientes";

/** Leitura única do cliente para o layout e as sete seções. O id da URL só
 * escolhe o registro: quem autoriza é `requireEscritorio` + RLS. */
export const obterCliente = cache(async (id: string) => {
  await requireEscritorio();
  if (!z.string().uuid().safeParse(id).success) notFound();
  const cliente = await carregarCliente(id);
  if (!cliente) notFound();
  return cliente;
});
