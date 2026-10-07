import Anthropic from "@anthropic-ai/sdk";
import { listProdutos } from "@/lib/sheets/produtos";
import { GRUPOS_INSUMO, ehProduzidoNaCasa, montarSkuSugerido } from "@/lib/skus/montar";

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

## Pré-preparo (PRE) - item produzido na casa

Nome terminado em "da casa" é pré-preparo: receita feita na cozinha que vira ingrediente de outro item (molho, massa, blend, recheio). Nunca é comprado. Nesse caso:
- grupo é PRE;
- letras_produto tem 6 letras: 3 da primeira palavra + 3 da segunda palavra significativa (ignore "de", "da", "do", "com");
- nome de uma palavra só (antes do "da casa") com 6 letras ou mais: as 6 primeiras letras dessa palavra (chimichurri da casa -> CHIMIC);
- "da casa" não entra nas letras. Única exceção: nome de uma palavra só com menos de 6 letras, que não fecha o código - aí são as 3 primeiras letras + "CAS" (pesto da casa -> PES + CAS, ancho da casa -> ANC + CAS);
- referencia fica vazia: PRE não tem número.

Exemplos:
barbecue de goiabada da casa -> PRE + BARGOI
cebola caramelizada da casa -> PRE + CEBCAR
maionese verde da casa -> PRE + MAIVER
chimichurri da casa -> PRE + CHIMIC (chimichurri sem "da casa" é comprado: MER + CHI)

Nome sem "da casa" nunca é PRE, mesmo que pareça preparado.

Os nomes chegam em caixa baixa (padrão do cadastro). Isso não muda nada na escolha: as letras do SKU são sempre maiúsculas e sem acento.

Responda só com a ferramenta sugerir_sku.`;

type SugestaoSku = { sku: string; grupo: string; motivo: string };


export async function sugerirSku(nome: string, spreadsheetId: string | null): Promise<SugestaoSku> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ANTHROPIC_API_KEY no .env.local");
  }
  if (!nome.trim()) {
    throw new Error("Preencha o nome antes de sugerir o SKU.");
  }

  const produtos = await listProdutos(spreadsheetId);
  const skusExistentes = new Set(produtos.map((p) => p.sku));

  const produzidoNaCasa = ehProduzidoNaCasa(nome);
  const client = new Anthropic({ apiKey });

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 400,
    system: REGRAS,
    messages: [
      {
        role: "user",
        // Envia somente o dado necessario para a tarefa. Colisoes com o
        // catalogo do cliente sao resolvidas localmente logo abaixo.
        content: `Nome do produto novo: ${nome}`,
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
              // PRE só é opção quando o nome tem o marcador "da casa".
              enum: produzidoNaCasa ? ["PRE"] : GRUPOS_INSUMO,
              description: produzidoNaCasa ? "PRE (item produzido na casa)." : "Um dos 11 códigos de grupo.",
            },
            letras_produto: {
              type: "string",
              description: produzidoNaCasa
                ? "As 6 letras do pré-preparo (maiúsculas, sem acento)."
                : "As 3 letras do Produto (maiúsculas, sem acento).",
            },
            referencia: {
              type: "string",
              description: "3 caracteres de referência, normalmente 001. Vazio para PRE.",
            },
            motivo: {
              type: "string",
              description: "Explicação curta (1-2 frases) do grupo escolhido e das letras.",
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

  const { sku, grupo, avisoColisao } = montarSkuSugerido({
    nome,
    grupoIa: String(input.grupo ?? ""),
    letrasIa: String(input.letras_produto ?? ""),
    referenciaIa: String(input.referencia ?? ""),
    skusExistentes,
  });
  const motivo = [String(input.motivo ?? ""), avisoColisao].filter(Boolean).join(" ");

  return { sku, grupo, motivo };
}
