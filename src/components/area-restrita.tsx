/** Bloco padrão pra quando o papel Operacional entra numa URL que só a
 * Gestão pode editar - substitui o conteúdo da página em vez de redirecionar
 * em silêncio, pra deixar claro que o acesso existe, só que é limitado. */
export function AreaRestrita({ mensagem }: { mensagem?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 rounded-lg border border-cinza-claro bg-branco p-8 text-center">
      <h1 className="font-display text-xl font-bold text-azul-noite">Área restrita à Gestão</h1>
      <p className="max-w-sm text-sm text-cinza-medio">
        {mensagem ??
          "Esse cadastro é mantido pela Gestão do restaurante. Se precisar de alguma alteração aqui, fala com quem administra o Zatti Hub no seu negócio."}
      </p>
    </div>
  );
}
