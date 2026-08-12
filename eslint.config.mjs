import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Runtime local do `supabase start`/`db reset` (bundles gerados,
    // nunca código-fonte nosso) - achado rodando lint pela primeira vez
    // depois de `supabase start` nesta revisão do pacote P0.
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
