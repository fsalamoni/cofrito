#!/usr/bin/env bash
# ============================================
#  Deploy
# ============================================
# Uso: ./tools/deploy.sh [dev|staging|prod]

set -euo pipefail

ENV=${1:-staging}

if [ "$ENV" = "prod" ]; then
  echo "❌ Para prod, use o GitHub Actions (workflow 'Deploy Production')"
  echo "   Ou edite este script se tiver certeza do que está fazendo."
  exit 1
fi

echo "🚀 Deploy para $ENV..."

cd "$(dirname "$0")/.."

# 1. Validar
echo "  → Lint..."
npm run lint

echo "  → Typecheck..."
npm run typecheck

echo "  → Testes..."
npm test -- --run

echo "  → Build..."
npm run build

# 2. Selecionar projeto
firebase use "$ENV"

# 3. Deploy
echo "  → Deploy para Firebase..."
firebase deploy --only hosting,functions,firestore:rules,firestore:indexes

# 4. Verificar
URL="https://${ENV//dev/}-$(firebase projects:list --json | jq -r '.result[] | select(.projectId | startswith("agente-caocipp")) | .projectId' | head -1).web.app"
echo ""
echo "✅ Deploy concluído!"
echo "🌐 URL: $URL"
echo ""
echo "Smoke test:"
curl -sI "$URL" | head -1
