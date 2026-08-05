#!/usr/bin/env bash
# ============================================
#  Ver logs em tempo real
# ============================================
# Uso: ./tools/logs.sh [dev|staging|prod] [function-name]

set -euo pipefail

ENV=${1:-dev}
FN=${2:-}

echo "📋 Logs de $ENV (Ctrl+C para sair)..."
firebase use "$ENV"

if [ -n "$FN" ]; then
  firebase functions:log --only "$FN" --follow
else
  firebase functions:log --follow
fi
