import type { NextConfig } from "next";

// Supabase local (`supabase start`, http://127.0.0.1) só entra na política em
// desenvolvimento local; em produção a origem é sempre https://*.supabase.co.
const supabaseLocal = /^http:\/\/(127\.0\.0\.1|localhost):\d+/.exec(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")?.[0] ?? "";
const extraLocal = supabaseLocal ? ` ${supabaseLocal}` : "";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js precisa dos scripts/estilos inline do bootstrap quando a CSP e
  // estatica. As demais diretivas ainda bloqueiam origens inesperadas.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  // Fotos privadas (ficha técnica e Checklist Garante) chegam por URL assinada do Storage.
  `img-src 'self' blob: data: https://*.supabase.co${extraLocal}`,
  "font-src 'self'",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com${extraLocal}`,
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // No teste local o Supabase é http; em produção, sempre https.
  ...(supabaseLocal ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  // Leitura de PDF da Conciliação roda só no servidor, pelo pacote Node.
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    // Upload de extrato pela Server Action: arquivo de até 4 MB + multipart,
    // abaixo do limite de 4,5 MB de corpo da Vercel.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()", // câmera só do próprio app (Checklist Garante)
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
