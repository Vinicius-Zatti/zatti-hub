import type { Metadata, Viewport } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["600", "700"],
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
    >
      <body className="min-h-full flex flex-col bg-off-white text-cinza">
        {children}
      </body>
    </html>
  );
}
