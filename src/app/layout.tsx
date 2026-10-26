import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SCRIPT_TEMA_INICIAL } from "@/lib/tema";
import { SCRIPT_CAPTURA_INSTALACAO } from "@/lib/instalar-app/regras";

// Fontes auto-hospedadas (não `next/font/google`) de propósito: build
// deixa de depender de rede pra buscar fonte - uma falha passageira nesse
// fetch foi o que travou o deploy automático de produção em 16/08. Arquivos
// são o mesmo variable font que o Google serve (cobre os pesos usados).
const dmSans = localFont({
  src: "../fonts/dm-sans.woff2",
  variable: "--font-dm-sans",
  weight: "400 700",
  display: "swap",
});

const cormorant = localFont({
  src: "../fonts/cormorant-garamond.woff2",
  variable: "--font-cormorant",
  weight: "600 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zatti Hub",
  description: "Plataforma Zatti Consultoria",
  appleWebApp: {
    capable: true,
    title: "Zatti Hub",
    statusBarStyle: "default",
  },
};

// Trava o zoom automático que Safari/Chrome no iPhone dão ao focar um campo
// de contagem/quantidade - sem isso, a tela inteira amplia sozinha e sai da
// posição, mesmo com fonte de 16px no campo (achado real testando no
// celular, 03/08). Também impede pinch-zoom manual do usuário no app
// inteiro - troca deliberada, o app é usado "como app" (salvo na tela de
// início), não como página de conteúdo pra ampliar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${cormorant.variable} h-full antialiased`}
      // O script abaixo grava `data-tema` no <html> antes da hidratação.
      suppressHydrationWarning
    >
      <head>
        {/* Tema da tela antes da pintura (sem piscar claro). As cores escuras
            só valem no shell da Navegação V2 (piloto) - ver globals.css. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
        {/* Pedido de instalação do Chrome (Android) guardado antes da hidratação,
            para o convite de instalar o app (`components/convite-instalar-app.tsx`). */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_CAPTURA_INSTALACAO }} />
      </head>
      <body className="min-h-full flex flex-col bg-off-white text-cinza">
        {children}
      </body>
    </html>
  );
}
