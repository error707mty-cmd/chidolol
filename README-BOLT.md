# DTF Studio + Sistema POS - Configuración para Bolt.diy

## 🚀 Inicio Rápido en Bolt.diy

### ✅ Paso 1: Ejecuta en la terminal
```bash
yarn dev
```

Eso es todo! El frontend arrancará automáticamente en el puerto 3000.

## 📦 Estructura del Proyecto

```
/app
├── artifacts/
│   ├── dtf-pliego/     → Frontend React + Vite (Puerto 3000)
│   └── api-server/     → Backend Node.js (Puerto 8001)
├── lib/
│   └── db/             → Schemas de Drizzle ORM
└── package.json        → Scripts principales
```

## 🎨 Sistema POS

El POS está en: `/admin/pos` (requiere login como admin)

**Credenciales de prueba**:
- Usuario: `error707mty`
- Contraseña: `buentello0607`

### Características del POS:
✅ Diseño premium oscuro con glassmorphism  
✅ Filtros de ventas (día/semana/mes/año/custom)  
✅ Carga de imágenes (logo + productos)  
✅ Generación de tickets  
✅ Impresión térmica POS58  

## 🔧 Configuración de Base de Datos

### Para desarrollo local en Bolt.diy:

**Opción A**: Usar PostgreSQL externo (Supabase, Neon, etc.)
1. Crea una base de datos PostgreSQL gratuita
2. Actualiza `artifacts/api-server/.env`:
   ```
   DATABASE_URL=postgresql://user:pass@host:5432/dbname
   ```

**Opción B**: Solo frontend (sin backend)
- Ejecuta solo `yarn dev:frontend`
- El diseño se verá perfectamente
- Las funcionalidades del backend no funcionarán

## 🎯 Scripts Disponibles

```bash
# Inicia el frontend (recomendado para Bolt.diy)
yarn dev

# O explícitamente
yarn dev:frontend

# Solo backend (requiere PostgreSQL)
yarn dev:backend

# Build para producción
yarn build

# Preview del build
yarn preview
```

## ⚠️ Limitaciones en Bolt.diy

1. **Base de datos**: PostgreSQL debe estar en un servicio externo
2. **Uploads**: Las imágenes subidas se perderán al reiniciar
3. **Monorepo**: Bolt.diy funciona mejor con proyectos simples

## 💡 Recomendación

Si solo quieres ver el diseño del POS:
```bash
yarn dev:frontend
```

Luego ve a: `http://localhost:3000/admin/pos`

El login no funcionará sin backend, pero puedes comentar la protección de rutas en `App.tsx` temporalmente para ver el POS.

## 🐛 Solución de Problemas

**"No se ve la vista previa"**
- Asegúrate de estar ejecutando `yarn dev:frontend`
- Verifica que el puerto 3000 esté disponible
- Revisa la consola de Bolt.diy por errores

**"Error de base de datos"**
- El backend necesita PostgreSQL
- Usa solo el frontend o configura una BD externa

**"Las imágenes no cargan"**
- Verifica que `/uploads` exista
- Revisa permisos de escritura
