# 🎯 GUÍA RÁPIDA PARA VER EL POS EN BOLT.DIY

## ⚡ Inicio Rápido (2 pasos)

### 1️⃣ En la terminal de Bolt.diy, ejecuta:
```bash
yarn dev:frontend
```

### 2️⃣ Para ver el POS sin login:

Opción A - Modifica `App.tsx` (líneas 62-67):
```tsx
function Router() {
  // Descomenta estas 5 líneas:
  return (
    <Switch>
      <Route path="/" component={POS} />
      <Route component={NotFound} />
    </Switch>
  );
  
  // Y comenta todo lo demás de la función Router
```

Opción B - Más fácil, reemplaza el contenido de `src/App.tsx` con `src/App-BoltMode.tsx`:
```bash
cp src/App-BoltMode.tsx src/App.tsx
```
Luego descomenta las líneas 36-41 en App.tsx

## 🎨 Acceso al POS

Una vez iniciado, ve a:
- **URL**: `http://localhost:3000/`
- **Ruta del POS**: `/admin/pos` (si usas auth) o `/` (si usas BoltMode)

## 📂 Estructura de Pestañas del POS

```
Sistema POS
├── 🛒 Vender      → SaleTab.tsx      (Diseño glassmorphism ✅)
├── 👥 Clientes    → CustomersTab.tsx (Diseño glassmorphism ✅)
├── 📦 Inventario  → InventoryTab.tsx (Grid con imágenes ✅)
├── 💰 Precios     → PricingTab.tsx   
├── 📊 Ventas      → HistoryTab.tsx   (Filtros + Stats ✅)
├── 📈 Dashboard   → DashboardTab.tsx
└── ⚙️  Config      → SettingsTab.tsx  (Upload logo ✅)
```

## ⚠️ Limitaciones Sin Backend

Sin PostgreSQL, estas funciones NO funcionarán:
- ❌ Login/autenticación
- ❌ Guardar ventas
- ❌ Guardar clientes/productos
- ❌ Upload de imágenes (se guardan en memoria)
- ❌ Generar tickets reales

**PERO SÍ podrás ver:**
- ✅ Todo el diseño premium glassmorphism
- ✅ Las animaciones y efectos
- ✅ La estructura de filtros
- ✅ Los modales y formularios
- ✅ El grid de productos
- ✅ La preview de tickets

## 🔧 Solución: "No se ve nada"

1. **Verifica que Vite esté corriendo**:
   ```bash
   yarn dev:frontend
   ```

2. **Revisa la consola del navegador** (F12):
   - Si ves errores de API, es normal (sin backend)
   - Si ves errores de módulos, ejecuta `yarn install`

3. **Limpia la caché**:
   ```bash
   rm -rf node_modules/.vite
   yarn dev:frontend
   ```

## 🚀 Para Producción Real

Si quieres que TODO funcione en Bolt.diy:

1. **Crea una BD PostgreSQL gratuita**:
   - [Supabase](https://supabase.com) (Gratis, fácil)
   - [Neon](https://neon.tech) (Gratis, rápido)
   - [ElephantSQL](https://www.elephantsql.com) (Gratis, 20MB)

2. **Actualiza la variable de entorno**:
   En `artifacts/api-server/.env`:
   ```
   DATABASE_URL=postgresql://usuario:contraseña@host:puerto/nombre_bd
   ```

3. **Ejecuta el backend**:
   ```bash
   yarn dev:backend
   ```

4. **Ejecuta el frontend en otra terminal**:
   ```bash
   yarn dev:frontend
   ```

## 📱 Vista Previa del Diseño

El POS tiene:
- **Glassmorphism**: Fondo oscuro + blur + transparencias
- **Gradientes animados**: Naranja → Rosa → Morado
- **Compact View**: Optimizado para ver más información
- **Grid de productos**: Con imágenes (placeholder si no hay imagen)
- **Stats cards**: Métricas visuales en Historial
- **Filtros avanzados**: Día/Semana/Mes/Año/Personalizado

## 🎨 Paleta de Colores del POS

```css
Vender:     from-orange-500 to-pink-600
Clientes:   from-blue-500 to-cyan-600
Inventario: from-purple-500 to-violet-600
Precios:    from-yellow-500 to-amber-600
Ventas:     from-indigo-500 to-blue-600
Dashboard:  from-pink-500 to-rose-600
Config:     from-gray-500 to-slate-600
```

## 💡 Tip Pro

Para ver SOLO el POS sin la app principal, en `App-BoltMode.tsx` cambia:
```tsx
<Route path="/" component={POS} />
```

Así Bolt.diy abrirá directamente en el POS!

---

**¿Dudas?** Revisa `README-BOLT.md` para más detalles.
