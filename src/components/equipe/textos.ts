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

/** Texto depois de gerar senha provisória para conta que já existe (24/10).
 * `equipe`: a gestão não vê a senha, depende só do WhatsApp. */
export function textoEnvioProvisoria(
  envio: "aceito" | "falhou" | "incerto",
  equipe: boolean,
): { tom: "ok" | "aviso" | "erro"; texto: string } {
  if (envio === "aceito") {
    return { tom: "ok", texto: "Senha provisória gerada. O envio pelo WhatsApp foi aceito. Confirme com a pessoa que chegou." };
  }
  if (envio === "incerto") {
    return {
      tom: "aviso",
      texto: "Senha provisória gerada, mas não tivemos confirmação do envio no WhatsApp. Confira com a pessoa antes de reenviar.",
    };
  }
  return {
    tom: "erro",
    texto: equipe
      ? "A senha atual já deixou de valer, mas o WhatsApp não saiu. Confira o número e use \"Reenviar senha\" daqui a 2 minutos."
      : "Senha provisória gerada, mas o WhatsApp não saiu. Repasse a senha acima para a pessoa.",
  };
}
