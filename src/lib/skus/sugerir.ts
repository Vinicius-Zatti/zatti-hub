import Anthropic from "@anthropic-ai/sdk";
import { listProdutos } from "@/lib/sheets/produtos";

const REGRAS = `Você gera SKUs de insumos para restaurantes seguindo o padrão da Zatti Consultoria.

Sua tarefa: dado só o nome de um produto novo, decidir o Grupo E o código completo.

Estrutura do SKU: 9 caracteres, sem espaço/hífen/acento: [3 letras do Grupo] + [3 letras do Produto] + [3 caracteres de Referência].

## Passo 1 — decidir o Grupo

Os grupos existentes (nunca invente um grupo novo, escolha um destes 11):

PRO Proteínas — carnes, aves, peixes, ovos
HOR Hortifrúti — legumes, verduras, frutas, ervas
LAT Laticínios e frios — queijos, manteiga, embutidos
MER Mercearia / secos — farinhas, massas, molhos, temperos
CON Congelados — só o que já vem PRÉ-PROCESSADO ou pronto de fábrica (batata frita congelada, nuggets, sorvete, salgados prontos)
BEB Bebidas não alcoólicas — água, refri, suco, café
BAL Bebidas alcoólicas — cerveja, vinho, destilados
EMB Embalagens de venda — sai junto com o pedido do cliente (caixa de delivery, sacola, pote de marmita)
DES Descartáveis internos — fica dentro do restaurante (copo da equipe, guardanapo do salão)
LIM Limpeza e higiene — detergentes, desinfetantes, sanitizantes
OPE Operacional / escritório — papelaria, materiais administrativos

Distinção crítica PRO vs CON: congelamento é forma de guardar, não define o grupo. Carne/ave/peixe cru, mesmo vendido congelado, continua PRO (ex: "Frango Congelado" é PRO, não CON). Só entra em CON o que já veio pronto ou semi-pronto de fábrica.

Distinção crítica EMB vs DES: se sai com o pedido do cliente é EMB: se fica dentro do restaurante é DES.

## Passo 2 — as 3 letras do Produto

A regra de verdade é DIFERENCIAÇÃO, não posição fixa:
- Nome de uma palavra: as 3 primeiras letras.
- Nome de duas palavras: 1ª letra da primeira + 2 primeiras letras da segunda.
- Nome de três+ palavras onde a 3ª diferencia (marca + variação): 1ª letra de cada uma das 3 primeiras palavras.
- Palavra de estado/preparo (congelado, resfriado, fatiado, inteiro) só entra no código se for o que diferencia esse produto de outro parecido JÁ CADASTRADO. Sem produto parecido cadastrado, ela é descartável.
- Confira a lista de produtos já cadastrados que eu te passar (de todos os grupos). Se as 3 letras batem com outro produto FISICAMENTE diferente no mesmo grupo, ajuste até não colidir.

Exemplos:
Peito Bovino -> PRO + PBO (sem "Peito Bovino Congelado" cadastrado, resfriado é descartável)
Cheddar Bisnaga (existe também Cheddar Fatiado cadastrado) -> LAT + CBI
Cheddar Fatiado -> LAT + CFA
Coca-Cola Original (existe também Coca-Cola Zero) -> BEB + CCO
Batata McCain -> CON + BMC
Peito Bovino Congelado (com Peito Bovino=PBO já cadastrado) -> PRO + PBC (expande pra 3 palavras porque colidiria)

Referência normalmente é "001", só sobe se colidir.

Responda só com a ferramenta sugerir_sku.`;

type SugestaoSku = { sku: string; grupo: string; motivo: string };

const GRUPOS_VALIDOS = ["PRO", "HOR", "LAT", "MER", "CON", "BEB", "BAL", "EMB", "DES", "LIM", "OPE"];

export async function sugerirSku(nome: string, tenantId?: string): Promise<SugestaoSku> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY no .env.local");
  }
  if (!nome.trim()) {
    throw new Error("Preencha o nome antes de sugerir o SKU.");
  }

  const produtos = await listProdutos(tenantId);
  const cadastro = produtos.length
    ? produtos.map((p) => `${p.sku} (${p.grupo}) — ${p.nome}`).join("\n")
    : "(nenhum produto cadastrado ainda)";
  const skusExistentes = new Set(produtos.map((p) => p.sku));

  const client = new Anthropic({ apiKey });

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: REGRAS,
    messages: [
      {
        role: "user",
        content: `Nome do produto novo: ${nome}\n\nProdutos já cadastrados (todos os grupos):\n${cadastro}`,
      },
    ],
    tools: [
      {
        name: "sugerir_sku",
        description: "Devolve o grupo, o SKU sugerido e o motivo da escolha.",
        input_schema: {
          type: "object",
          properties: {
            grupo: {
              type: "string",
              enum: GRUPOS_VALIDOS,
              description: "Um dos 11 códigos de grupo.",
            },
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
              description: "Explicação curta (1-2 frases) do grupo escolhido e das 3 letras.",
            },
          },
          required: ["grupo", "letras_produto", "referencia", "motivo"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "sugerir_sku" },
  });

  const bloco = resp.content.find((b) => b.type === "tool_use");
  if (!bloco || bloco.type !== "tool_use") {
    throw new Error("A IA não devolveu uma sugestão válida.");
  }
  const input = bloco.input as {
    grupo: string;
    letras_produto: string;
    referencia: string;
    motivo: string;
  };

  const grupo = GRUPOS_VALIDOS.includes(input.grupo) ? input.grupo : "MER";
  const letras = input.letras_produto.toUpperCase().replace(/[^A-Z]/g, "").padEnd(3, "X").slice(0, 3);
  let ref = input.referencia.replace(/[^A-Z0-9]/gi, "").padStart(3, "0").slice(0, 3);

  let sku = `${grupo}${letras}${ref}`;
  let tentativa = Number(ref) || 1;
  while (skusExistentes.has(sku) && tentativa < 999) {
    tentativa += 1;
    ref = String(tentativa).padStart(3, "0");
    sku = `${grupo}${letras}${ref}`;
  }

  return { sku, grupo, motivo: input.motivo };
}
