import Anthropic from "@anthropic-ai/sdk";
import { listProdutos } from "@/lib/sheets/produtos";
import { nomeGrupo } from "@/lib/grupos";

const REGRAS = `Você gera SKUs de insumos para restaurantes seguindo o padrão da Zatti Consultoria.

Estrutura: 9 caracteres, sem espaço/hífen/acento: [3 letras do Grupo, já dado] + [3 letras do Produto] + [3 caracteres de Referência].
O Grupo já vem fixo — você só decide as 3 letras do Produto e a Referência (normalmente "001", só sobe se colidir).

Como montar as 3 letras do Produto — a regra de verdade é DIFERENCIAÇÃO, não posição fixa:
- Nome de uma palavra: as 3 primeiras letras.
- Nome de duas palavras: 1ª letra da primeira + 2 primeiras letras da segunda.
- Nome de três+ palavras onde a 3ª diferencia (marca + variação): 1ª letra de cada uma das 3 primeiras palavras.
- Palavra de estado/preparo (congelado, resfriado, fatiado, inteiro) só entra no código se for o que diferencia esse produto de outro parecido JÁ CADASTRADO no mesmo grupo. Sem produto parecido cadastrado, ela é descartável.
- Antes de fechar: confira a lista de produtos já cadastrados no grupo que eu te passar. Se as 3 letras batem com outro produto FISICAMENTE diferente, ajuste (troque a palavra descartada pela que faltava, ou recalcule usando 3 palavras) até não colidir. Nunca entregue um SKU que colide com outro produto diferente.

Exemplos:
Peito Bovino -> PBO (sem "Peito Bovino Congelado" cadastrado, resfriado é descartável)
Cheddar Bisnaga (existe também Cheddar Fatiado cadastrado) -> CBI
Cheddar Fatiado -> CFA
Coca-Cola Original (existe também Coca-Cola Zero) -> CCO
Coca-Cola Zero -> CCZ
Batata McCain -> BMC

Responda só com a ferramenta sugerir_sku.`;

type SugestaoSku = { sku: string; motivo: string };

export async function sugerirSku(
  grupo: string,
  nome: string,
  tenantId?: string
): Promise<SugestaoSku> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY no .env.local");
  }
  if (!grupo || !nome.trim()) {
    throw new Error("Preencha grupo e nome antes de sugerir o SKU.");
  }

  const produtos = await listProdutos(tenantId);
  const doGrupo = produtos.filter((p) => p.grupo === grupo);
  const cadastro = doGrupo.length
    ? doGrupo.map((p) => `${p.sku} — ${p.nome}`).join("\n")
    : "(nenhum produto cadastrado ainda nesse grupo)";
  const skusExistentes = new Set(produtos.map((p) => p.sku));

  const client = new Anthropic({ apiKey });

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system: REGRAS,
    messages: [
      {
        role: "user",
        content: `Grupo: ${grupo} (${nomeGrupo(grupo)})\nNome do produto novo: ${nome}\n\nProdutos já cadastrados nesse grupo:\n${cadastro}`,
      },
    ],
    tools: [
      {
        name: "sugerir_sku",
        description: "Devolve o SKU sugerido e o motivo da escolha das 3 letras do Produto.",
        input_schema: {
          type: "object",
          properties: {
            letras_produto: {
              type: "string",
              description: "As 3 letras do Produto (maiúsculas, sem acento).",
            },
            referencia: {
              type: "string",
              description: "3 caracteres de referência, normalmente 001.",
            },
            motivo: {
              type: "string",
              description: "Explicação curta (1 frase) de como chegou nas 3 letras.",
            },
          },
          required: ["letras_produto", "referencia", "motivo"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "sugerir_sku" },
  });

  const bloco = resp.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    throw new Error("A IA não devolveu uma sugestão válida.");
  }
  const input = bloco.input as { letras_produto: string; referencia: string; motivo: string };

  const letras = input.letras_produto.toUpperCase().replace(/[^A-Z]/g, "").padEnd(3, "X").slice(0, 3);
  let ref = input.referencia.replace(/[^A-Z0-9]/gi, "").padStart(3, "0").slice(0, 3);

  let sku = `${grupo}${letras}${ref}`;
  let tentativa = Number(ref) || 1;
  while (skusExistentes.has(sku) && tentativa < 999) {
    tentativa += 1;
    ref = String(tentativa).padStart(3, "0");
    sku = `${grupo}${letras}${ref}`;
  }

  return { sku, motivo: input.motivo };
}
