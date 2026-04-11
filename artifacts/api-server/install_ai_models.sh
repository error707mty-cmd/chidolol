#!/bin/bash
# Script de instalación de mejores modelos AI - 100% GRATIS

echo "🚀 Instalando mejores modelos AI (esto puede tardar 5-10 minutos)..."

# Instalar dependencias para Real-ESRGAN (mejor upscaling)
pip3 install basicsr realesrgan gfpgan --no-cache-dir

# Instalar utilidades de optimización
pip3 install aiofiles diskcache --no-cache-dir

echo "✅ Instalación completada!"
echo ""
echo "📊 Modelos instalados:"
echo "  - Real-ESRGAN: Upscaling 4x de calidad comercial"
echo "  - GFPGAN: Mejora de rostros"
echo "  - BasicSR: Framework de super-resolution"
echo "  - Caché: Para velocidad"
echo ""
echo "🔄 Ahora reinicia el AI server con: sudo supervisorctl restart ai-server"
