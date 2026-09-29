/** Erros desta classe podem ser mostrados ao usuario sem revelar detalhes de
 * banco, APIs, planilhas, caminhos ou configuracao interna. */
export class ErroPublico extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroPublico";
  }
}

export function mensagemErroPublica(erro: unknown, fallback: string): string {
  return erro instanceof ErroPublico ? erro.message : fallback;
}

/** Texto único para leitura que falhou (decisão de Vinícius, 28/09/2026): a
 * tela nunca fica em branco nem com número parcial - mostra isto. */
export const MENSAGEM_ERRO_CARREGAMENTO =
  "Não foi possível carregar todos os dados desta tela. Isso é um erro do app, não da sua operação. Entre em contato com o suporte da Zatti.";
