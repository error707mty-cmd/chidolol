# 🚀 CONFIGURACIÓN SUPER RÁPIDA PARA BOLT.DIY

## ⚡ Opción 1: SOLO FRONTEND (Más Rápido)

Si solo quieres ver el diseño del POS sin complicaciones:

### Paso 1: En Bolt.diy, ejecuta:
```bash
yarn dev
```

**¡Eso es todo!** Ve a `http://localhost:3000/admin/pos`

### Paso 2 (Opcional): Para ver el POS sin login
Reemplaza el contenido de `artifacts/dtf-pliego/src/App.tsx` con esto:

```tsx
import POS from "@/pages/POS/index";
import { Toaster } from "@/components/ui/toaster";

export default function App() {
  return (
    <>
      <POS />
      <Toaster />
    </>
  );
}
```

¡Listo! Ahora verás el POS directamente sin login ni backend.

---

## 🔥 Opción 2: CON BACKEND (Completo)

Si quieres que TODO funcione:

### Paso 1: Configura PostgreSQL
Consigue una BD PostgreSQL gratis en:
- **Supabase**: https://supabase.com (Recomendado)
- **Neon**: https://neon.tech
- **ElephantSQL**: https://elephantsql.com

### Paso 2: Actualiza la conexión
En `artifacts/api-server/.env`:
```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Paso 3: Construye e inicia
```bash
# Instala dependencias
yarn install

# Construye el backend (esto ya no dará error)
yarn workspace @workspace/api-server build

# Inicia todo
yarn dev
```

---

## 📋 RESUMEN DE COMANDOS BOLT.DIY

### Ver solo el diseño (sin backend):
```bash
yarn dev:frontend
```

### Ver con backend funcionando:
```bash
yarn dev
```

### Limpiar y reiniciar:
```bash
rm -rf node_modules
yarn install
yarn dev:frontend
```

---

## 🎨 ACCESO AL POS

- **Con login**: http://localhost:3000/admin/pos
- **Sin login** (con App.tsx modificado): http://localhost:3000/

**Credenciales admin**:
- Usuario: `error707mty`
- Contraseña: `buentello0607`

---

## ✅ CHECKLIST

- [ ] ¿Solo quieres ver el diseño? → Usa Opción 1
- [ ] ¿Quieres funcionalidad completa? → Usa Opción 2
- [ ] ¿Error de build? → Ya está arreglado (agregué stripe a externals)
- [ ] ¿No se ve nada? → Ejecuta `yarn dev:frontend`
- [ ] ¿Quieres POS directo? → Modifica App.tsx según Opción 1

---

**¿Sigues sin ver la vista previa?** Asegúrate de:
1. Tener `yarn` instalado
2. Ejecutar `yarn install` primero
3. Usar `yarn dev:frontend` o `yarn dev`
4. Que el puerto 3000 esté libre
