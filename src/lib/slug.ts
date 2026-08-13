// Bloco Unicode das marcas de acentuação combinantes, por código de ponto
// (não por literal de regex) - evita depender de digitar um caractere
// combinante diretamente no fonte, o que é frágil entre editores/encodings.
const INICIO_MARCA_COMBINANTE = 0x0300;
const FIM_MARCA_COMBINANTE = 0x036f;

function removerAcentos(texto: string): string {
  let resultado = "";
  for (const caractere of texto.normalize("NFD")) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (codigo < INICIO_MARCA_COMBINANTE || codigo > FIM_MARCA_COMBINANTE) {
      resultado += caractere;
    }
  }
  return resultado;
}

/** Gera um identificador (slug) a partir de um nome livre - usado como
 * sugestão inicial no formulário de cliente novo, sempre editável antes de
 * confirmar. Puro e sem I/O: não confere duplicidade sozinho, isso é feito
 * à parte contra o banco (ver `admin/clientes/novo/actions.ts`). */
export function gerarSlug(nome: string): string {
  return removerAcentos(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
