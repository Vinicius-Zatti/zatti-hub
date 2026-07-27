import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Ícone usado quando salva o app na tela de início (iOS). Sem isso, o
 * Safari ignora o `icon.svg` (não serve pra apple-touch-icon) e cai no
 * fallback padrão: quadrado cinza com a primeira letra do título ("Z") -
 * era exatamente esse "Z" genérico que aparecia antes. Reaproveita o
 * símbolo da marca (mesmas curvas/pontos do `zatti-logo-invertida.svg`),
 * em fundo azul-noite sólido - ícone de app não deve ter fundo
 * transparente, o iOS composita errado. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1F2D",
        }}
      >
        <svg width="132" height="132" viewBox="193 193 814 814" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M 749.05 294.41 A 340.00 340.00 0 0 1 905.59 450.95"
            fill="none"
            stroke="#C9882A"
            strokeWidth="30"
            strokeLinecap="round"
          />
          <path
            d="M 905.59 749.05 A 340.00 340.00 0 0 1 749.05 905.59"
            fill="none"
            stroke="#C9882A"
            strokeWidth="30"
            strokeLinecap="round"
          />
          <path
            d="M 450.95 905.59 A 340.00 340.00 0 0 1 294.41 749.05"
            fill="none"
            stroke="#C9882A"
            strokeWidth="30"
            strokeLinecap="round"
          />
          <path
            d="M 294.41 450.95 A 340.00 340.00 0 0 1 450.95 294.41"
            fill="none"
            stroke="#C9882A"
            strokeWidth="30"
            strokeLinecap="round"
          />
          <circle cx="600" cy="260" r="50" fill="#F5F0E8" />
          <circle cx="940" cy="600" r="50" fill="#F5F0E8" />
          <circle cx="600" cy="940" r="50" fill="#F5F0E8" />
          <circle cx="260" cy="600" r="50" fill="#F5F0E8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
