# 🐘 CONFIGURACIÓN DE POSTGRESQL PARA BOLT.DIY

## 🎯 OPCIÓN 1: SUPABASE (Recomendado - Gratis Forever)

### Paso 1: Crea tu base de datos
1. Ve a [supabase.com](https://supabase.com)
2. Click en "Start your project"
3. Crea una cuenta (gratis)
4. Click en "New project"
5. Llena los datos:
   - **Name**: `dtf-pos` (o el que quieras)
   - **Database Password**: Crea una contraseña SEGURA (guárdala)
   - **Region**: Elige el más cercano a ti
   - **Plan**: Free (500MB, suficiente para empezar)
6. Click en "Create new project"
7. **Espera 2-3 minutos** mientras se crea

### Paso 2: Obtén la cadena de conexión
1. En tu proyecto de Supabase, ve a **Settings** (⚙️)
2. Click en **Database** en el menú izquierdo
3. Busca la sección **Connection string**
4. Selecciona **URI** y click en **Copy**
5. Deberías tener algo como:
   ```
   postgresql://postgres.xxxxx:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

### Paso 3: Configura tu proyecto
En Bolt.diy, edita `artifacts/api-server/.env`:

```env
DATABASE_URL=postgresql://postgres.xxxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**⚠️ IMPORTANTE**: Reemplaza `TU_PASSWORD` con la contraseña que creaste en el paso 1.

### Paso 4: Ejecuta las migraciones
En la terminal de Bolt.diy:

```bash
# Instala dependencias si no lo has hecho
yarn install

# Ejecuta las migraciones de la base de datos
cd lib/db
yarn drizzle-kit push

# Vuelve a la raíz
cd ../..
```

### Paso 5: Crea un usuario admin (seed)
Crea el archivo `artifacts/api-server/seed-admin.ts`:

```typescript
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seedAdmin() {
  const hashedPassword = await bcrypt.hash("buentello0607", 10);
  
  await db.insert(usersTable).values({
    username: "error707mty",
    email: "admin@dtfpos.com",
    passwordHash: hashedPassword,
    displayName: "Admin",
    isAdmin: true,
  });

  console.log("✅ Usuario admin creado");
  process.exit(0);
}

seedAdmin().catch(console.error);
```

Luego ejecuta:
```bash
cd artifacts/api-server
yarn tsx seed-admin.ts
cd ../..
```

### Paso 6: Inicia el proyecto completo
```bash
# Opción A: Solo backend
yarn dev:backend

# Opción B: Backend + Frontend (en terminales separadas)
# Terminal 1:
yarn dev:backend

# Terminal 2:
yarn dev:frontend
```

**¡Listo!** Ahora TODO funciona con PostgreSQL 🎉

---

## 🎯 OPCIÓN 2: NEON (Alternativa - Gratis Forever)

### Paso 1: Crea tu base de datos
1. Ve a [neon.tech](https://neon.tech)
2. Click en "Sign up" (gratis)
3. Crea una cuenta con GitHub o email
4. Click en "Create project"
5. Llena:
   - **Name**: `dtf-pos`
   - **Region**: Elige el más cercano
   - **Plan**: Free (0.5GB, suficiente)
6. Click en "Create project"

### Paso 2: Obtén la cadena de conexión
1. En el dashboard, verás **Connection string**
2. Selecciona **Node.js**
3. Click en **Copy**
4. Tendrás algo como:
   ```
   postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### Paso 3: Configura y ejecuta
Sigue los **pasos 3-6 de Supabase** usando tu connection string de Neon.

---

## 🎯 OPCIÓN 3: ELEPHANTSQL (Alternativa - Gratis 20MB)

### Paso 1: Crea tu base de datos
1. Ve a [elephantsql.com](https://www.elephantsql.com)
2. Click en "Get a managed database today"
3. Click en "Try now for FREE"
4. Crea una cuenta
5. Click en "Create New Instance"
6. Llena:
   - **Name**: `dtf-pos`
   - **Plan**: Tiny Turtle (Free)
   - **Region**: Elige el más cercano
7. Click en "Create instance"

### Paso 2: Obtén la cadena de conexión
1. Click en tu instancia recién creada
2. Verás **URL** en la sección Details
3. Click en **Copy** (icono de clipboard)
4. Tendrás algo como:
   ```
   postgresql://user:password@peanut.db.elephantsql.com/user
   ```

### Paso 3: Configura y ejecuta
Sigue los **pasos 3-6 de Supabase** usando tu connection string de ElephantSQL.

---

## 📋 RESUMEN DE COMANDOS

Una vez configurada la base de datos:

```bash
# 1. Instala dependencias
yarn install

# 2. Push schema a la base de datos
cd lib/db && yarn drizzle-kit push && cd ../..

# 3. Crea usuario admin (si no existe)
cd artifacts/api-server && yarn tsx seed-admin.ts && cd ../..

# 4. Inicia backend
yarn dev:backend

# 5. Inicia frontend (en otra terminal)
yarn dev:frontend
```

---

## 🔧 SCRIPT DE INICIO AUTOMÁTICO

Crea `start-full.sh` en la raíz:

```bash
#!/bin/bash

echo "🚀 Iniciando DTF Studio + POS con PostgreSQL"

# Verifica que DATABASE_URL esté configurado
if ! grep -q "DATABASE_URL=" artifacts/api-server/.env; then
  echo "❌ ERROR: DATABASE_URL no configurado en artifacts/api-server/.env"
  exit 1
fi

echo "✅ DATABASE_URL configurado"

# Instala dependencias
echo "📦 Instalando dependencias..."
yarn install

# Push schema
echo "🗄️  Sincronizando schema con base de datos..."
cd lib/db && yarn drizzle-kit push && cd ../..

# Inicia servicios
echo "🎯 Iniciando backend y frontend..."
echo ""
echo "Backend: http://localhost:8001"
echo "Frontend: http://localhost:3000"
echo "POS: http://localhost:3000/admin/pos"
echo ""

# Necesitas ejecutar estos en terminales separadas en Bolt.diy:
echo "Terminal 1: yarn dev:backend"
echo "Terminal 2: yarn dev:frontend"
```

Hazlo ejecutable:
```bash
chmod +x start-full.sh
```

---

## ⚠️ TROUBLESHOOTING

### Error: "password authentication failed"
- Verifica que la contraseña en `DATABASE_URL` sea correcta
- Si tiene caracteres especiales, codifícala: `%40` para `@`, `%23` para `#`, etc.

### Error: "SSL connection required"
Agrega `?sslmode=require` al final de tu DATABASE_URL:
```
postgresql://user:pass@host:5432/db?sslmode=require
```

### Error: "relation does not exist"
Ejecuta las migraciones:
```bash
cd lib/db && yarn drizzle-kit push && cd ../..
```

### Error: "Usuario no encontrado" al hacer login
Ejecuta el seed:
```bash
cd artifacts/api-server && yarn tsx seed-admin.ts && cd ../..
```

---

## 🎉 VERIFICACIÓN FINAL

Para verificar que todo funciona:

```bash
# 1. Verifica que el backend esté corriendo
curl http://localhost:8001/api/health

# 2. Verifica que puedas hacer login
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"error707mty","password":"buentello0607"}'

# Deberías recibir un token JWT
```

---

## 📊 COMPARACIÓN DE SERVICIOS

| Servicio | Gratis | Almacenamiento | Límites | Recomendación |
|----------|--------|----------------|---------|---------------|
| **Supabase** | ✅ Sí | 500 MB | 5 GB transferencia/mes | ⭐⭐⭐⭐⭐ Mejor opción |
| **Neon** | ✅ Sí | 0.5 GB | 10 proyectos | ⭐⭐⭐⭐ Excelente |
| **ElephantSQL** | ✅ Sí | 20 MB | 5 conexiones | ⭐⭐⭐ Solo para pruebas |

---

## 🚀 SIGUIENTE PASO

1. **Elige un servicio** (recomiendo Supabase)
2. **Sigue los pasos** de configuración
3. **Actualiza** `DATABASE_URL` en `.env`
4. **Ejecuta migraciones** con `drizzle-kit push`
5. **Crea usuario admin** con el seed
6. **Inicia** backend y frontend

**¡Y listo!** Tendrás el POS funcionando al 100% con base de datos real 🎉
