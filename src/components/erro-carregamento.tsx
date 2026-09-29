import { MENSAGEM_ERRO_CARREGAMENTO } from "@/lib/erros";

/** Aviso de leitura que falhou - mesmo cartão de `ConectarPlanilha`, com o
 * texto aprovado de erro do app. Nunca mostra dado parcial no lugar. */
export function ErroCarregamento({ children }: { children?: React.ReactNode }) {
  return (
    <div role="alert" className="mx-auto max-w-xl rounded-lg border border-ambar bg-ambar/10 p-6">
      <h2 className="font-display text-xl font-bold text-azul-noite">Erro ao carregar a tela</h2>
      <p className="mt-2 text-sm text-cinza">{MENSAGEM_ERRO_CARREGAMENTO}</p>
      {children}
    </div>
  );
}
