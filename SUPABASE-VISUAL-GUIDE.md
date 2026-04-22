# 📸 GUÍA VISUAL: CONFIGURAR SUPABASE PARA TU POS

## 🎯 PASO A PASO CON IMÁGENES

### PASO 1: Crear cuenta en Supabase

1. Ve a: **https://supabase.com**
2. Click en **"Start your project"**
3. Selecciona **"Sign up with GitHub"** (más rápido) o usa email

---

### PASO 2: Crear nuevo proyecto

1. En el dashboard, click en **"New project"**
2. Llena el formulario:

```
┌─────────────────────────────────────┐
│ Project name:                       │
│ dtf-pos ✏️                          │
├─────────────────────────────────────┤
│ Database Password:                  │
│ ••••••••••••••• 🔑 (GUÁRDALA!)     │
│                                     │
│ [Generate password] 🎲              │
├─────────────────────────────────────┤
│ Region:                             │
│ 🌎 South America (São Paulo) ▼      │
├─────────────────────────────────────┤
│ Pricing Plan:                       │
│ ✅ Free ($0/month)                  │
│ • 500MB Database                    │
│ • Unlimited API requests            │
│ • 50,000 monthly active users       │
└─────────────────────────────────────┘

        [Create new project] 🚀
```

3. Click en **"Create new project"**
4. **⏳ ESPERA 2-3 minutos** mientras se crea

---

### PASO 3: Obtener Connection String

Una vez creado el proyecto:

1. En el menú izquierdo, click en **⚙️ Settings**
2. Click en **Database** (en la sección Settings)
3. Baja hasta **"Connection string"**
4. Verás algo así:

```
┌─────────────────────────────────────────────────────┐
│ Connection string                                   │
├─────────────────────────────────────────────────────┤
│ Session mode    Transaction mode    URI            │
│                                      ☑️              │
├─────────────────────────────────────────────────────┤
│ postgresql://postgres.zxcasdqwe123:[YOUR-        │
│ PASSWORD]@aws-0-us-east-1.pooler.supabase.        │
│ com:6543/postgres                                  │
│                                               📋    │
└─────────────────────────────────────────────────────┘
```

5. **Asegúrate de seleccionar "URI"** (no Session mode)
6. Click en el icono de **📋 Copy**
7. **IMPORTANTE**: La cadena tendrá `[YOUR-PASSWORD]` - debes reemplazarlo con la contraseña que creaste en el Paso 2

---

### PASO 4: Configurar en tu proyecto

En Bolt.diy:

1. Abre el archivo: **`artifacts/api-server/.env`**

2. Si no existe, cópialo del ejemplo:
   ```bash
   cp artifacts/api-server/.env.example artifacts/api-server/.env
   ```

3. Edita `.env` y pega tu connection string:

   **ANTES:**
   ```env
   DATABASE_URL=postgresql://localhost:5432/dtfpliego
   ```

   **DESPUÉS:**
   ```env
   DATABASE_URL=postgresql://postgres.zxcasdqwe123:MI_PASSWORD_SEGURA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

   ⚠️ **Reemplaza `[YOUR-PASSWORD]` con tu contraseña real**

4. **Guarda el archivo** (Ctrl+S o Cmd+S)

---

### PASO 5: Ejecutar migraciones y seed

En la terminal de Bolt.diy:

```bash
# Opción A: Script automático (Recomendado)
chmod +x setup-postgres.sh
./setup-postgres.sh

# Opción B: Manual
yarn install
cd lib/db && yarn push && yarn seed && cd ../..
```

Verás algo como:

```
🗄️  Sincronizando schema con PostgreSQL...
✅ Schema sincronizado

🌱 Creando datos iniciales...
👤 Creando usuario admin...
✅ Usuario admin creado
   Username: error707mty
   Password: buentello0607

💰 Creando tiers de precios...
✅ Tiers de precios creados

👥 Creando clientes de ejemplo...
✅ Clientes de ejemplo creados

⚙️  Creando configuración del negocio...
✅ Configuración del negocio creada

🎉 ¡Seed completado exitosamente!
```

---

### PASO 6: Iniciar el proyecto

Necesitas **2 terminales**:

**Terminal 1 - Backend:**
```bash
yarn dev:backend
```

Verás:
```
Server listening on port 8001
✅ Conectado a PostgreSQL
```

**Terminal 2 - Frontend:**
```bash
yarn dev:frontend
```

Verás:
```
VITE v5.x ready in 1234 ms

➜  Local:   http://localhost:3000/
```

---

### PASO 7: ¡FUNCIONA! 🎉

Abre tu navegador y ve a:

```
http://localhost:3000/admin/pos
```

**Credenciales:**
- Usuario: `error707mty`
- Password: `buentello0607`

---

## 🔍 VERIFICAR QUE TODO FUNCIONA

### Verificar conexión a BD:

En la terminal, ejecuta:

```bash
curl http://localhost:8001/api/health
```

Deberías ver:
```json
{"status":"ok","database":"connected"}
```

### Verificar login:

```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"error707mty","password":"buentello0607"}'
```

Deberías recibir un **token JWT**.

---

## ⚠️ SOLUCIÓN DE PROBLEMAS

### ❌ "password authentication failed"

**Problema**: La contraseña en la connection string es incorrecta.

**Solución**: 
1. Ve a Supabase → Settings → Database
2. Click en "Reset database password"
3. Copia la nueva password
4. Actualiza `DATABASE_URL` en `.env`

---

### ❌ "SSL connection required"

**Problema**: Supabase requiere SSL.

**Solución**: Agrega `?sslmode=require` al final de tu DATABASE_URL:

```env
DATABASE_URL=postgresql://...postgres?sslmode=require
```

---

### ❌ "relation 'users' does not exist"

**Problema**: Las tablas no se crearon.

**Solución**: Ejecuta las migraciones:

```bash
cd lib/db
yarn push
cd ../..
```

---

### ❌ "Usuario o contraseña incorrectos"

**Problema**: El seed no se ejecutó o falló.

**Solución**: Ejecuta el seed manualmente:

```bash
cd lib/db
yarn seed
cd ../..
```

---

## 📊 VISUALIZAR TUS DATOS EN SUPABASE

En Supabase puedes ver tus tablas:

1. Ve a **Table Editor** en el menú izquierdo
2. Verás las tablas:
   - `users` (tu usuario admin)
   - `pos_customers` (clientes)
   - `pos_sales` (ventas)
   - `pos_inventory` (productos)
   - `pos_price_tiers` (precios)
   - `business_config` (configuración)

3. Puedes editar datos directamente desde aquí

---

## 🎯 SIGUIENTE PASO

¡Listo! Ahora tienes:

✅ PostgreSQL configurado  
✅ Migraciones ejecutadas  
✅ Datos de prueba creados  
✅ Usuario admin listo  
✅ Backend conectado  
✅ Frontend funcionando  

**Ve a `http://localhost:3000/admin/pos` y empieza a usar tu POS!** 🚀

---

## 💡 TIPS

**Tip 1**: Guarda tu contraseña de Supabase en un lugar seguro

**Tip 2**: Puedes ver logs en tiempo real en Supabase:
- Logs → Query Performance

**Tip 3**: Para producción, crea un usuario de BD separado (no uses postgres)

**Tip 4**: Habilita Row Level Security (RLS) para más seguridad:
- Authentication → Policies
