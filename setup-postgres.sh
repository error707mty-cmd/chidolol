#!/bin/bash

echo "🚀 SETUP COMPLETO DE POSTGRESQL PARA BOLT.DIY"
echo "=============================================="
echo ""

# Verificar que existe .env
if [ ! -f "artifacts/api-server/.env" ]; then
    echo "⚠️  No se encontró artifacts/api-server/.env"
    echo "📝 Copiando .env.example a .env..."
    cp artifacts/api-server/.env.example artifacts/api-server/.env
    echo ""
    echo "❗ IMPORTANTE: Edita artifacts/api-server/.env y configura DATABASE_URL"
    echo "   Ejemplo Supabase:"
    echo "   DATABASE_URL=postgresql://postgres.xxxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    echo ""
    exit 1
fi

# Verificar que DATABASE_URL esté configurado
DB_URL=$(grep "^DATABASE_URL=" artifacts/api-server/.env | cut -d '=' -f2-)

if [ -z "$DB_URL" ] || [ "$DB_URL" = "postgresql://localhost:5432/dtfpliego" ]; then
    echo "❌ ERROR: DATABASE_URL no está configurado correctamente"
    echo ""
    echo "📝 Pasos para configurar:"
    echo "1. Crea una base de datos gratuita en:"
    echo "   • Supabase: https://supabase.com (Recomendado)"
    echo "   • Neon: https://neon.tech"
    echo "   • ElephantSQL: https://elephantsql.com"
    echo ""
    echo "2. Obtén tu connection string"
    echo ""
    echo "3. Edita artifacts/api-server/.env y actualiza DATABASE_URL"
    echo ""
    exit 1
fi

echo "✅ DATABASE_URL configurado"
echo ""

# Instalar dependencias
echo "📦 Instalando dependencias..."
yarn install

# Push schema
echo ""
echo "🗄️  Sincronizando schema con PostgreSQL..."
cd lib/db
yarn push
cd ../..

# Seed
echo ""
echo "🌱 Creando datos iniciales (admin, clientes, precios)..."
cd lib/db
yarn seed
cd ../..

echo ""
echo "=============================================="
echo "🎉 ¡SETUP COMPLETADO EXITOSAMENTE!"
echo "=============================================="
echo ""
echo "📋 Credenciales de acceso:"
echo "   Usuario: error707mty"
echo "   Password: buentello0607"
echo ""
echo "🚀 Para iniciar el proyecto:"
echo ""
echo "   Terminal 1: yarn dev:backend"
echo "   Terminal 2: yarn dev:frontend"
echo ""
echo "   Luego ve a: http://localhost:3000/admin/pos"
echo ""
echo "=============================================="
