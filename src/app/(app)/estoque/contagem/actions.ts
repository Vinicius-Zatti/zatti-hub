"use server";

import { registrarContagem, type NovaContagemLinha } from "@/lib/sheets/inventario";
import { revalidatePath } from "next/cache";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type LinhaAvulsa = {
  sku: string;
  nome: string;
  unidadeBase: string;
  quantidade: string;
};

export async function registrarContagemAction(linhas: NovaContagemLinha[]) {
  const hoje = new Date();
  const data = hoje.toLocaleDateString("pt-BR");
  const mes = `${MESES[hoje.getMonth()]} ${hoje.getFullYear()}`;

  await registrarContagem(data, mes, linhas);

  revalidatePath("/estoque/contagem");
  revalidatePath("/estoque/pedidos");
}
