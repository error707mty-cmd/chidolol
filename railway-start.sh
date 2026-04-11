#!/bin/bash
set -e

echo "🚀 Starting ERROR707 DTF Studio deployment..."

# Get the actual app directory
APP_DIR=${APP_DIR:-/app}
cd "$APP_DIR"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  WARNING: DATABASE_URL not set. Make sure to configure it in Railway dashboard."
fi

# Set PORT if not provided by Railway
export PORT=${PORT:-8001}

echo "✅ Working directory: $(pwd)"
echo "✅ PORT: $PORT"
echo "✅ Node version: $(node --version)"
echo "✅ Yarn version: $(yarn --version)"

# Check if backend dist exists
if [ ! -d "$APP_DIR/artifacts/api-server/dist" ]; then
  echo "❌ Backend dist not found. Build may have failed."
  exit 1
fi

# Check if frontend dist exists
if [ ! -d "$APP_DIR/artifacts/dtf-pliego/dist" ]; then
  echo "⚠️  Frontend dist not found. Frontend may not serve correctly."
fi

# Start the backend server (it serves the frontend too)
echo "🌐 Starting backend server..."
cd "$APP_DIR/artifacts/api-server"
exec node --enable-source-maps ./dist/index.mjs
