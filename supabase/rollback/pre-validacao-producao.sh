#!/usr/bin/env bash
# Pré-validação SOMENTE LEITURA: prova que o schema de produção equivale
# exatamente ao que 20260722_schema_base.sql + as 4 migrations de
# 20260807 esperam, ANTES de marcar ou reparar qualquer histórico de
# migration. Não escreve nada, não lê linha de tabela de cliente (usa
# --schema-only - pg_dump nunca inclui dado quando essa flag está
# presente).
#
# NÃO RODAR sem autorização explícita e sem uma connection string
# read-only de produção fornecida por Vinícius - este script não
# pressupõe nem tenta descobrir credencial nenhuma sozinho.
#
# Uso:
#   PROD_DB_URL="postgresql://<usuario_readonly>:<senha>@<host>:5432/postgres" \
#     ./pre-validacao-producao.sh
#
# Falha (exit != 0) se houver QUALQUER divergência - de propósito, não é
# pra "passar de qualquer jeito". Divergência real precisa de decisão
# humana, não de um script decidindo sozinho o que ignorar.

set -euo pipefail

if [ -z "${PROD_DB_URL:-}" ]; then
  echo "ERRO: defina PROD_DB_URL (connection string read-only) antes de rodar." >&2
  echo "Este script não tem nem tenta obter credencial de produção sozinho." >&2
  exit 2
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REFERENCIA="$DIR/referencia-schema-pre-p0.sql"
SAIDA_PROD="$DIR/producao-schema-atual.sql"
SAIDA_HISTORICO="$DIR/producao-historico-migrations.txt"

if [ ! -f "$REFERENCIA" ]; then
  echo "ERRO: referência não encontrada em $REFERENCIA" >&2
  exit 2
fi

echo "== 1. Histórico remoto de migrations (supabase_migrations.schema_migrations) =="
psql "$PROD_DB_URL" -X -v ON_ERROR_STOP=1 -c \
  "select version, name, statements is not null as tem_statements
   from supabase_migrations.schema_migrations
   order by version;" \
  | tee "$SAIDA_HISTORICO"
echo "Histórico salvo em: $SAIDA_HISTORICO"
echo

echo "== 2. Dump schema-only de produção (sem dado, sem tocar em nada) =="
pg_dump "$PROD_DB_URL" --schema-only --no-owner --schema=public \
  | grep -v -e '^\\restrict ' -e '^\\unrestrict ' \
  > "$SAIDA_PROD"
echo "Schema de produção salvo em: $SAIDA_PROD"
echo

echo "== 3. Comparando contra a referência ($REFERENCIA) =="
if diff -u "$REFERENCIA" "$SAIDA_PROD" > "$DIR/diff-producao-vs-referencia.txt"; then
  echo "OK: schema de produção é estruturalmente idêntico à referência pré-P0."
  echo "Seguro seguir para o procedimento de baseline (ver README-baseline-producao.md)."
  exit 0
else
  echo "DIVERGÊNCIA ENCONTRADA - ver $DIR/diff-producao-vs-referencia.txt" >&2
  echo "NÃO prosseguir para baseline/repair/push. Isso exige decisão humana:" >&2
  echo "cada linha do diff precisa ser entendida antes de qualquer ação." >&2
  exit 1
fi
