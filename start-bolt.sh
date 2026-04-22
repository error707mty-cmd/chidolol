#!/bin/bash

echo "🚀 Iniciando DTF Studio + POS para Bolt.diy..."
echo ""
echo "📦 Instalando dependencias..."
yarn install

echo ""
echo "🎨 Iniciando frontend en puerto 3000..."
echo "📝 Accede al POS en: http://localhost:3000/admin/pos"
echo ""

cd /app/artifacts/dtf-pliego && yarn dev
