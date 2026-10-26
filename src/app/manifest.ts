import type { MetadataRoute } from "next";

// Manifesto do app (26/10/2026): sem ele, o atalho "Adicionar à tela inicial"
// do Android abre numa aba comum do Chrome. Com `display: standalone` o Chrome
// instala como app, em tela cheia. O iPhone continua usando `apple-icon.png`
// e `appleWebApp` do layout. Ícones em `public/icones/`, gerados a partir de
// `src/app/icon.svg` (símbolo MEGA V2.1); a versão maskable é o mesmo ícone
// sem a moldura arredondada, que o Android recortaria. Middleware libera
// `/manifest.webmanifest` e `/icones/` sem login (ver `middleware.ts`).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zatti Hub",
    short_name: "Zatti Hub",
    description: "Plataforma Zatti Consultoria",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "pt-BR",
    // Barra do sistema no tema claro = fundo off-white do app; o tema escuro
    // sobrescreve com a meta theme-color do alternador de tema.
    theme_color: "#f5f0e8",
    // Tela de abertura no tom do ícone (azul-noite), sem clarão branco.
    background_color: "#0d1f2d",
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
