#!/usr/bin/env node
// Falha o build/CI se a chave service_role (ou o nome da env var) aparecer
// em qualquer chunk client-side gerado. Existia só como busca manual
// (grep) antes - isso automatiza a mesma checagem pra não depender de
// alguém lembrar de rodar de novo a cada mudança em
// src/lib/supabase/admin.ts ou em qualquer módulo que ele acabe puxando.
//
// Roda depois de `next build` (ver package.json - "postbuild"). Só olha
// pra `.next/static`, que é exatamente o que o navegador baixa - nunca
// `.next/server`, que é código de servidor de propósito e pode conter a
// env var sem problema.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PADROES_PROIBIDOS = ["SUPABASE_SERVICE_ROLE_KEY", "service_role"];
const DIRETORIO_CLIENTE = join(process.cwd(), ".next", "static");

function listarArquivosJs(dir) {
  let arquivos = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    const info = statSync(caminho);
    if (info.isDirectory()) arquivos = arquivos.concat(listarArquivosJs(caminho));
    else if (entrada.endsWith(".js")) arquivos.push(caminho);
  }
  return arquivos;
}

let arquivos;
try {
  arquivos = listarArquivosJs(DIRETORIO_CLIENTE);
} catch {
  console.error(`Não encontrei ${DIRETORIO_CLIENTE} - rode "next build" antes desta checagem.`);
  process.exit(1);
}

if (arquivos.length === 0) {
  console.error("Nenhum arquivo .js encontrado em .next/static - build parece incompleto.");
  process.exit(1);
}

let achou = false;
for (const arquivo of arquivos) {
  const conteudo = readFileSync(arquivo, "utf8");
  for (const padrao of PADROES_PROIBIDOS) {
    if (conteudo.includes(padrao)) {
      console.error(`ENCONTRADO "${padrao}" em ${arquivo} - service_role não pode chegar no bundle do cliente.`);
      achou = true;
    }
  }
}

if (achou) {
  process.exit(1);
}

console.log(`OK: nenhum dos padrões [${PADROES_PROIBIDOS.join(", ")}] apareceu em ${arquivos.length} arquivo(s) client-side.`);
