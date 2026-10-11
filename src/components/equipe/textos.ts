/** Texto que a gestão vê depois de um envio de acesso pelo WhatsApp. Só diz
 * "enviado" quando o Vini confirmou que aceitou a mensagem. */
export function textoEnvio(
  envio: "aceito" | "falhou" | "incerto" | null,
  contaExistente: boolean,
): { tom: "ok" | "aviso" | "erro"; texto: string } {
  if (envio === "aceito") {
    return {
      tom: "ok",
      texto: contaExistente
        ? "Acesso liberado. Essa pessoa já tinha conta: o aviso para entrar com a senha que ela já usa foi aceito pelo WhatsApp."
        : "Cadastrado. O envio do login e da senha provisória foi aceito pelo WhatsApp. Confirme com a pessoa que chegou.",
    };
  }
  if (envio === "incerto") {
    return {
      tom: "aviso",
      texto:
        "Cadastrado, mas não tivemos confirmação do envio no WhatsApp. Confira com a pessoa antes de reenviar.",
    };
  }
  return {
    tom: "erro",
    texto: "Cadastrado, mas o WhatsApp não saiu. Confira o número e use \"Reenviar acesso\".",
  };
}

export const ROTULO_FUNCAO: Record<string, string> = {
  gestao: "Gestão",
  operacional: "Operacional",
};
