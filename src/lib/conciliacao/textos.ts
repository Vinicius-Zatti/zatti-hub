// Textos da tela da Conciliação (neutro: servidor e navegador). O banco só
// guarda códigos; a explicação legível mora aqui.

const MOTIVOS: Record<string, string> = {
  arquivo_vazio: "Arquivo vazio",
  tamanho_excedido: "Arquivo maior que 4 MB",
  executavel: "Arquivo executável recusado",
  compactado_nao_suportado: "Arquivo compactado (ZIP/Excel) ainda não é aceito",
  formato_nao_suportado: "Formato não aceito",
  binario_desconhecido: "Conteúdo binário desconhecido",
  conteudo_ativo: "Arquivo com conteúdo ativo (script/HTML) recusado",
  formato_desconhecido: "Formato não reconhecido pelo conteúdo",
  pdf_protegido: "PDF protegido por senha: envie a versão sem senha",
  pdf_invalido: "PDF corrompido ou inválido",
  paginas_excedidas: "PDF com mais de 30 páginas",
  pdf_tempo_excedido: "PDF demorou demais para abrir",
  linhas_excedidas: "Mais de 5.000 linhas no arquivo",
  pdf_layout_desconhecido: "Layout de PDF sem leitura local e leitura por IA desligada",
  imagem_requer_ia: "Imagem precisa da leitura por IA, que está desligada",
  csv_sem_mapeamento: "CSV sem colunas reconhecidas (Data, Descrição, Valor)",
  csv_decimal_ambiguo: "CSV com formato de valor ambíguo",
  csv_vazio: "CSV sem linhas",
  ofx_sem_extrato: "OFX sem extrato de conta",
  ofx_cartao_nao_suportado: "OFX de cartão de crédito ainda não é aceito",
  moeda_nao_brl: "Moeda diferente de real",
  ia_resposta_invalida: "A leitura por IA voltou em formato inválido e foi recusada",
  ia_truncada: "A leitura por IA foi cortada antes do fim e foi recusada",
  ia_recusou: "A IA recusou a leitura",
  ia_sem_resposta: "A IA não respondeu a tempo",
  ia_erro_requisicao: "Falha ao enviar o documento para a IA",
  ia_sem_chave: "Leitura por IA sem configuração neste ambiente",
  ia_sem_texto: "A IA não devolveu conteúdo",
  ia_sem_movimentos: "Nenhuma movimentação encontrada no documento",
  nenhuma_linha_valida: "Nenhuma linha válida",
  saldo_divergente: "Os saldos do extrato não fecham com as movimentações lidas",
  conflito_identificador: "Mesmo identificador do banco com dados diferentes",
  linhas_com_erro: "Algumas linhas não puderam ser lidas",
  upload_expirado: "Envio não concluído a tempo",
  // Linhas
  data_invalida: "Data inválida",
  data_incoerente: "Data não confere com o texto do documento",
  ano_nao_documentado: "Ano não aparece no documento",
  data_fora_do_periodo: "Data fora do período do extrato",
  valor_invalido: "Valor ilegível",
  valor_zero: "Valor zero",
  descricao_ausente: "Sem descrição",
  descricao_invalida: "Descrição inválida",
  debito_e_credito: "Débito e crédito na mesma linha",
  saldo_invalido: "Saldo ilegível",
  saldo_ilegivel: "Saldo ilegível",
  texto_nao_reconhecido: "Texto fora do padrão do extrato",
  linha_incompleta: "Linha sem valor",
  comprovante_nao_efetivado: "Comprovante de agendamento ou cancelado: não prova pagamento",
  // Movimentos
  possivel_duplicidade: "Possível duplicidade com outro arquivo",
};

export function textoMotivo(codigo: string | null | undefined): string {
  if (!codigo) return "";
  return MOTIVOS[codigo] ?? codigo.replace(/_/g, " ");
}

export const TEXTO_SITUACAO: Record<string, string> = {
  aguardando_arquivo: "Aguardando arquivo",
  processando: "Lendo",
  concluida: "Concluída",
  parcial: "Parcial",
  falhou: "Falhou",
  quarentena: "Quarentena",
  duplicada: "Arquivo repetido",
  expirada: "Expirada",
};

export const TEXTO_NATUREZA: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia_propria: "Transferência própria",
  aplicacao_resgate: "Aplicação/resgate",
  estorno: "Estorno",
  repasse_cartao: "Repasse de cartão",
  repasse_plataforma: "Repasse de plataforma",
  desconhecido: "Revisar natureza",
};

export const TEXTO_FONTE_SUGESTAO: Record<string, string> = {
  regra_unidade: "Regra confirmada da unidade",
  fornecedor: "Fornecedor cadastrado",
  historico: "Histórico confirmado",
  regra_organizacao: "Regra compartilhada",
  descricao: "Descrição bancária",
  ia: "Sugestão da IA",
  sem_evidencia: "Sem evidência",
  natureza: "Não recebe Plano de Contas",
};

export const TEXTO_MOTIVO_SUGESTAO: Record<string, string> = {
  regra_unidade_exata: "Descrição igual a uma regra confirmada",
  regra_organizacao_exata: "Descrição igual a uma regra compartilhada",
  descricao_tarifa_bancaria: "Texto de tarifa bancária",
  ia_sugestao: "Sugestão por IA a partir da descrição",
  sem_evidencia: "Nenhuma regra ou evidência: revisão manual",
  regra_conflitante: "Regra em conflito: aguardando decisão da Gestão",
  natureza_repasse_cartao: "Repasse de cartão concilia com recebível, não cria receita",
  natureza_repasse_plataforma: "Repasse de iFood/99 concilia com recebível, não cria receita",
  natureza_aplicacao_resgate: "Aplicação ou resgate fica fora da DRE",
  natureza_transferencia_propria: "Transferência própria fica fora da DRE",
  natureza_estorno: "Estorno precisa do lançamento original",
  natureza_desconhecido: "Texto e direção não combinam: revisar",
};

export const TEXTO_CONFERENCIA: Record<string, string> = {
  conferida: "Saldos conferidos",
  conferida_exceto_inicio: "Saldos conferidos (exceto antes do primeiro saldo)",
  divergente: "Saldos não fecham",
  nao_verificavel: "Sem saldo para conferir",
};
