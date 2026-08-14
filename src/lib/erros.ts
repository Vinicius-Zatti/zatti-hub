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
