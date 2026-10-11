/** Cores e rótulos da situação de um checklist (servidor e cliente). */
export const ESTILO_SITUACAO = {
  pendente: { texto: "Pendente", classe: "bg-cinza-claro text-cinza" },
  em_andamento: { texto: "Em andamento", classe: "bg-azul-petroleo/10 text-azul-petroleo" },
  atrasada: { texto: "Atrasada", classe: "bg-vermelho/10 text-vermelho" },
  concluida: { texto: "Concluída", classe: "bg-verde/10 text-verde" },
} as const;
