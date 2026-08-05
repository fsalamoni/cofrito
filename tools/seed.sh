#!/usr/bin/env bash
# ============================================
#  Seed do Firestore com dados de teste
# ============================================
# Uso: ./tools/seed.sh [dev|staging|prod]
# AVISO: NUNCA rodar com prod sem aprovação!

set -euo pipefail

ENV=${1:-dev}

if [ "$ENV" = "prod" ]; then
  echo "❌ NUNCA rode seed em prod!"
  exit 1
fi

echo "📦 Semeando dados de teste em $ENV..."
cd "$(dirname "$0")/.."

firebase use "$ENV"

cd functions
npm run build
node lib/scripts/seed-test.js

echo "✅ Seed concluído"
