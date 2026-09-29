#!/usr/bin/env bash
# Concorrência real da Conciliação (duas conexões ao Postgres LOCAL do
# `supabase start`, depois de `fixture-local.sql`). Prova que:
#   1. o mesmo arquivo enviado ao mesmo tempo gera uma canônica e uma duplicada;
#   2. dois registros concorrentes da mesma tentativa produzem um único
#      resultado (o segundo é recusado, nenhum movimento em dobro).
# Uso: bash scripts/conciliacao/concorrencia-local.sh
set -euo pipefail
DB="${CONCILIACAO_DB_CONTAINER:-supabase_db_zatti-hub-acessos}"
SEGREDO="segredo-local-e2e-0123456789abcdef0123456789abcdef"
USUARIO="00000000-0000-0000-0000-0000000e2e01"
CONTA="00000000-0000-0000-0000-0000000e2ec1"
SHA=$(printf 'concorrencia-%s' "$(date +%s%N)" | sha256sum | cut -c1-64)
psql_local() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }

cabecalho="select set_config('request.jwt.claims', '{\"sub\":\"$USUARIO\",\"role\":\"authenticated\"}', true); set local role authenticated;"
criar() {
  cat <<SQL
begin;
$cabecalho
with e as (select jsonb_build_object('op','criar_importacao','kv',1,'usuario','$USUARIO','unidade','uni-e2e-teste',
  'conta','$CONTA','tipo_documento','extrato','formato','ofx','nome','c.ofx','tamanho',10,'sha256','$SHA',
  'mime','application/x-ofx','quarentena_motivo',null,'nonce',gen_random_uuid())::text t)
select public.fin_conciliacao_criar_importacao(t, encode(extensions.hmac(convert_to(t,'UTF8'), convert_to('$SEGREDO','UTF8'),'sha256'),'hex'))->>'situacao' from e;
select pg_sleep($1);
commit;
SQL
}
criar 3 | psql_local > /tmp/conc_a.txt 2>&1 &
sleep 1
criar 0 | psql_local > /tmp/conc_b.txt 2>&1
wait
A=$(grep -E 'aguardando_arquivo|duplicada' /tmp/conc_a.txt | head -1)
B=$(grep -E 'aguardando_arquivo|duplicada' /tmp/conc_b.txt | head -1)
echo "sessao 1: $A | sessao 2: $B"
[ "$A" = "aguardando_arquivo" ] && [ "$B" = "duplicada" ] || { echo "FALHOU: identidade do arquivo concorrente"; exit 1; }

# Prepara a importação para registro: arquivo "recebido" e processamento iniciado.
IMP=$(psql_local -c "select id from fin_importacoes where sha256='$SHA' and situacao='aguardando_arquivo'")
psql_local -c "insert into storage.objects (bucket_id, name) select 'fin-conciliacao', caminho_arquivo from fin_importacoes where id='$IMP'" > /dev/null
INI=$(printf '%s\n' "begin; $cabecalho" \
  "with e as (select jsonb_build_object('op','iniciar_processamento','kv',1,'usuario','$USUARIO','importacao','$IMP','sha256','$SHA')::text t)
   select public.fin_conciliacao_iniciar_processamento(t, encode(extensions.hmac(convert_to(t,'UTF8'), convert_to('$SEGREDO','UTF8'),'sha256'),'hex'))::text from e;" \
  "commit;" | psql_local | grep tentativa)
TENT=$(echo "$INI" | sed -E 's/.*"tentativa": ?([0-9]+).*/\1/')
NONCE=$(echo "$INI" | sed -E 's/.*"nonce": ?"([^"]+)".*/\1/')

registrar() {
  cat <<SQL
begin;
$cabecalho
with e as (select jsonb_build_object('op','registrar_resultado','kv',1,'usuario','$USUARIO','importacao','$IMP',
  'tentativa',$TENT,'nonce','$NONCE','versao_parser','ofx-1','versao_motor','motor-1','fonte_extracao','deterministica',
  'conferencia_aritmetica','nao_verificavel','periodo_inicio',null,'periodo_fim',null,'erro_global',null,
  'linhas', jsonb_build_array(jsonb_build_object('posicao',0,'tipo','movimento','data','2026-09-29','direcao','saida',
    'valor_centavos','$1','descricao_original','Concorrencia','descricao_normalizada','concorrencia','favorecido_normalizado',null,
    'id_banco',null,'natureza','saida','conferido',false,'sugestao',jsonb_build_object('categoria_id',null,'confianca','nenhuma',
    'fonte','sem_evidencia','motivo_codigo','sem_evidencia','evidencias','{}'::jsonb))))::text t)
select public.fin_conciliacao_registrar_resultado(t, encode(extensions.hmac(convert_to(t,'UTF8'), convert_to('$SEGREDO','UTF8'),'sha256'),'hex'))->>'situacao' from e;
select pg_sleep($2);
commit;
SQL
}
registrar 1111 3 | psql_local > /tmp/conc_c.txt 2>&1 &
sleep 1
set +e
registrar 2222 0 | psql_local > /tmp/conc_d.txt 2>&1
set -e
wait
N=$(psql_local -c "select count(*) from fin_movimentos_importados where importacao_origem_id='$IMP'")
echo "registro 1: $(grep -E 'concluida|ERROR' /tmp/conc_c.txt | head -1) | registro 2: $(grep -E 'concluida|ERROR' /tmp/conc_d.txt | head -1) | movimentos: $N"
grep -q "Tentativa expirada ou invalida" /tmp/conc_d.txt && [ "$N" = "1" ] || { echo "FALHOU: registro concorrente"; exit 1; }
echo "OK: concorrencia sem duplicar"
