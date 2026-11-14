"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { girarRoletaAction } from "../../acoes";
import { anguloFinal, type PremioPublico } from "@/lib/avaliacoes/roleta";

// Roleta de prêmios no fim da pesquisa dos apps (13/11/2026), modelo do Falaê: a pessoa deixa o
// WhatsApp, gira e ganha um cupom para o próximo pedido direto. O sorteio é do banco; a roda só
// mostra o resultado. As fatias têm o mesmo tamanho (a chance real fica com a gestão).

type Props = {
  /** Avaliação gravada que pode girar. Vazio só no teste da tela Configurar. */
  respostaId: string;
  /** Teste na tela Configurar (14/11/2026): sorteia aqui mesmo com os pesos da tela, sem gravar
   * nada e sem cupom de verdade. */
  teste?: { pesos: number[]; validadeDias: number };
  premios: PremioPublico[];
  nome: string;
  corPrincipal: string;
  /** Preto ou branco, o que contrastar com o fundo. */
  tinta: string;
  /** Texto dos botões (sobre a tinta). */
  textoBotao: string;
  estiloCartao: CSSProperties;
  linkPedidoDireto: string | null;
};

const GIRO_MS = 4200;

function dataBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

/** Ponto na borda do círculo de raio r (graus a partir do topo, sentido horário). */
function ponto(graus: number, r: number): [number, number] {
  const rad = ((graus - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

function Roda({ premios, corPrincipal, angulo }: { premios: PremioPublico[]; corPrincipal: string; angulo: number }) {
  const fatia = 360 / premios.length;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      {/* Ponteiro no topo */}
      <svg viewBox="0 0 24 24" className="absolute left-1/2 top-0 z-10 h-9 w-9 -translate-x-1/2 -translate-y-1" aria-hidden="true">
        <path d="M12 22 3 4h18z" fill="#111111" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <svg
        viewBox="0 0 200 200"
        className="h-full w-full drop-shadow-xl"
        style={{ transform: `rotate(${angulo}deg)`, transition: `transform ${GIRO_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)` }}
        aria-hidden="true"
      >
        <circle cx="100" cy="100" r="99" fill="#111111" />
        {premios.map((p, i) => {
          const [x1, y1] = ponto(i * fatia, 94);
          const [x2, y2] = ponto((i + 1) * fatia, 94);
          const grande = fatia > 180 ? 1 : 0;
          const cor = i % 2 === 0 ? corPrincipal : "#FFFFFF";
          const meio = i * fatia + fatia / 2;
          const [tx, ty] = ponto(meio, 58);
          return (
            <g key={p.id}>
              <path d={`M100 100 L${x1} ${y1} A94 94 0 ${grande} 1 ${x2} ${y2} Z`} fill={cor} stroke="#111111" strokeWidth="1" />
              <text
                x={tx}
                y={ty}
                transform={`rotate(${meio} ${tx} ${ty})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={premios.length > 5 ? 8 : 10}
                fontWeight="800"
                fill="#111111"
              >
                {p.nome.length > 18 ? `${p.nome.slice(0, 17)}…` : p.nome}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="14" fill="#111111" stroke="#FFFFFF" strokeWidth="3" />
      </svg>
    </div>
  );
}

export function RoletaPremios(p: Props) {
  const [whatsapp, setWhatsapp] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [angulo, setAngulo] = useState(0);
  const [girando, setGirando] = useState(false);
  const [resultado, setResultado] = useState<{ premio: string; regra: string | null; cupom: string; validoAte: string } | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [pendente, startTransition] = useTransition();

  function animar(indice: number) {
    setGirando(true);
    // Começa de onde parou, para girar de novo no teste.
    setAngulo((atual) => atual - (atual % 360) + anguloFinal(indice, p.premios.length));
    setTimeout(() => {
      setGirando(false);
      setMostrar(true);
    }, GIRO_MS + 200);
  }

  function girar() {
    setErro(null);
    if (p.teste) {
      const n = whatsapp.replace(/\D/g, "");
      if (n.length < 10 || n.length > 13) return setErro("Esse WhatsApp não parece válido. Confira o DDD e o número.");
      const pesos = p.teste.pesos.map((x) => (x > 0 ? x : 0));
      let sorte = Math.random() * pesos.reduce((a, b) => a + b, 0);
      let indice = pesos.findIndex((x) => (sorte -= x) < 0);
      if (indice < 0) indice = 0;
      const premio = p.premios[indice];
      const validade = new Date(Date.now() + p.teste.validadeDias * 86_400_000).toISOString();
      setResultado({ premio: premio.nome, regra: premio.regra, cupom: "TESTE0", validoAte: validade });
      animar(indice);
      return;
    }
    startTransition(async () => {
      const r = await girarRoletaAction(p.respostaId, whatsapp);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setResultado({ premio: r.premio, regra: r.regra, cupom: r.cupom, validoAte: r.validoAte });
      animar(Math.max(0, p.premios.findIndex((x) => x.id === r.premioId)));
    });
  }

  if (resultado && mostrar) {
    return (
      <div className="w-full max-w-sm rounded-2xl border-2 p-5 text-center" style={p.estiloCartao} aria-live="polite">
        {p.teste ? (
          <p className="mb-3 rounded-lg bg-[#F5B301] px-2 py-1 text-xs font-bold text-[#111111]">TESTE: nada foi gravado e este cupom não vale</p>
        ) : null}
        <p className="text-sm font-bold uppercase tracking-widest opacity-70">Você ganhou</p>
        <p className="mt-1 text-2xl font-extrabold leading-tight">{resultado.premio}</p>
        {resultado.regra ? <p className="mt-1 text-sm opacity-80">{resultado.regra}</p> : null}
        <div className="mx-auto mt-4 rounded-xl border-2 border-dashed px-4 py-3" style={{ borderColor: p.tinta }}>
          <p className="text-xs font-semibold opacity-70">Seu cupom</p>
          <p className="font-mono text-3xl font-extrabold tracking-[0.25em]">{resultado.cupom}</p>
        </div>
        <p className="mt-3 text-sm leading-snug opacity-80">
          Válido até {dataBr(resultado.validoAte)}, em um pedido direto com a {p.nome}. Informe o código ao fazer o pedido. Tire um print para não perder.
        </p>
        {p.linkPedidoDireto ? (
          <a
            href={p.linkPedidoDireto}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex min-h-[54px] w-full items-center justify-center rounded-2xl px-6 text-base font-bold shadow-lg"
            style={{ backgroundColor: p.tinta, color: p.textoBotao }}
          >
            Pedir direto agora
          </a>
        ) : null}
        {p.teste ? (
          <button
            type="button"
            onClick={() => {
              setResultado(null);
              setMostrar(false);
            }}
            className="mt-3 w-full rounded-2xl border-2 px-6 py-3 text-sm font-bold"
            style={{ borderColor: p.tinta }}
          >
            Girar de novo (teste)
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border-2 p-5 text-center" style={p.estiloCartao}>
      <p className="text-xl font-extrabold leading-tight">Gire a roleta e ganhe um prêmio</p>
      <p className="mt-1 text-sm leading-snug opacity-80">Para usar no seu próximo pedido direto com a {p.nome}.</p>
      <div className="mt-5">
        <Roda premios={p.premios} corPrincipal={p.corPrincipal} angulo={angulo} />
      </div>
      {!resultado ? (
        <>
          <label className="mt-5 block text-left text-sm font-semibold">
            Seu WhatsApp
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="(16) 91234-5678"
              maxLength={25}
              className="mt-1 min-h-[52px] w-full rounded-2xl border-2 bg-transparent px-4 text-base font-normal"
              style={{ borderColor: `${p.tinta}33` }}
            />
          </label>
          <p className="mt-1 text-left text-xs opacity-70">O número identifica o seu cupom (um prêmio por número a cada 30 dias) e só é usado para isso.</p>
          {erro ? (
            <p role="alert" className="mt-3 text-sm font-semibold">
              {erro}
            </p>
          ) : null}
          <button
            type="button"
            onClick={girar}
            disabled={pendente || !whatsapp.trim()}
            className="mt-4 min-h-[56px] w-full rounded-2xl px-6 text-lg font-bold shadow-lg transition active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: p.tinta, color: p.textoBotao }}
          >
            {pendente ? "Sorteando..." : "Girar a roleta"}
          </button>
        </>
      ) : (
        <p className="mt-5 text-base font-bold" aria-live="polite">
          {girando ? "Girando..." : ""}
        </p>
      )}
    </div>
  );
}
