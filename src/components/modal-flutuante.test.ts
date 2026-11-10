import { describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { ModalFlutuante } from "./modal-flutuante";

type Props = { children?: ReactNode; onClick?: (e: unknown) => void; "aria-label"?: string };

function acharBotaoFechar(no: ReactNode): ReactElement<Props> | null {
  for (const filho of Children.toArray(no)) {
    if (!isValidElement<Props>(filho)) continue;
    if (filho.props["aria-label"] === "Fechar") return filho;
    const achado = acharBotaoFechar(filho.props.children);
    if (achado) return achado;
  }
  return null;
}

function montar(extra: { semBotaoFechar?: boolean } = {}) {
  const onFechar = vi.fn();
  const fundo = ModalFlutuante({ aberto: true, onFechar, children: "conteúdo", ...extra }) as ReactElement<Props>;
  return { onFechar, fundo };
}

describe("ModalFlutuante", () => {
  it("clicar fora da janela não fecha", () => {
    const { onFechar, fundo } = montar();
    fundo.props.onClick?.({ stopPropagation() {} });
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("o X do canto fecha", () => {
    const { onFechar, fundo } = montar();
    acharBotaoFechar(fundo)?.props.onClick?.({});
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("janela com fechar próprio não ganha um segundo X", () => {
    const { fundo } = montar({ semBotaoFechar: true });
    expect(acharBotaoFechar(fundo)).toBeNull();
  });
});
