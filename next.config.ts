import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// `NEXT_PUBLIC_SUPABASE_URL` já é público por natureza (fica embutido no
// bundle do navegador de qualquer forma) - usar o origin dele aqui em vez
// de um wildcard `*.supabase.co` restringe o CSP ao projeto de verdade.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Sem nonce de propósito: nonce exige renderização dinâmica em toda
// página (desativa a otimização estática do Next em rotas como /login,
// /esqueci-senha, /sem-acesso), custo que não se paga aqui. `unsafe-inline`
// em style-src é o único afrouxamento - o app não roda script inline
// nenhum, só o widget do Turnstile (carregado como <script src> normal,
// não inline) e o SDK do Supabase.
const cspHeader = `
  default-src 'self';
  script-src 'self' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self' ${supabaseOrigin} https://challenges.cloudflare.com;
  frame-src https://challenges.cloudflare.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  // Nunca gerar source map do bundle do navegador em produção - stack
  // trace de verdade do app (nomes de arquivo, lógica interna) não pode
  // ficar público via DevTools.
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
