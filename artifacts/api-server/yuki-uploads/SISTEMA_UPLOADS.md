# 📁 Sistema de Uploads - ERROR707 Studio

## 📊 Resumen
Sistema completo de gestión de archivos para DTF con backend robusto y frontend responsive.

## ✅ Estado Actual
**COMPLETAMENTE FUNCIONAL Y EN PRODUCCIÓN**

## 🏗️ Arquitectura

### Backend (`/api/uploads/*`)
```
POST    /uploads                    # Subir archivo con procesamiento
GET     /uploads/recent             # Uploads recientes del usuario  
GET     /uploads/quota              # Cuota de almacenamiento (10GB)
POST    /uploads/:id/remove-bg      # AI Remove Background (rembg U2Net)
POST    /uploads/:id/upscale        # AI Upscale (waifu2x)
POST    /uploads/:id/halftone       # Semitono DTF
POST    /uploads/:id/inpaint        # Relleno con OpenCV
POST    /uploads/:id/duplicate      # Duplicar imagen
POST    /uploads/:id/replace        # Reemplazar archivo
DELETE  /uploads/:id                # Eliminar upload
```

### Frontend Components
```
📱 MobileUploadPanel.tsx    # Upload para móvil (drag & drop)
💻 SidebarLeft.tsx          # Upload para desktop  
🖼️ MobileImageActionSheet  # Acciones AI sobre imágenes
⚡ MobileAIPanel            # Panel de herramientas AI
```

## 🎯 Características Principales

### 1. **Subida de Archivos**
- **Formatos soportados**: PNG, JPG, JPEG, SVG, WEBP, HEIC, AVIF
- **Drag & Drop** en móvil y desktop
- **Procesamiento automático**:
  - Trim de transparencia (opcional)
  - Remover semi-transparencia (opcional)
  - Conversión a PNG optimizado

### 2. **Cuota de Almacenamiento**
- **10GB por usuario** regular
- **Ilimitado** para administradores
- **Verificación en tiempo real** antes de cada upload
- **Endpoint `/uploads/quota`** para monitoreo

### 3. **Herramientas AI Integradas**
- **Remove Background**: rembg U2Net (servidor Python persistente)
- **Upscale**: waifu2x cunet (2x, 3x, 4x)
- **Halftone DTF**: Semitono profesional para transfer digital
- **Inpaint**: Relleno inteligente con OpenCV

### 4. **Gestión de Archivos**
- **Historial completo** (undo/redo todas las operaciones)
- **Duplicación masiva** (hasta 50 copias)
- **Reemplazo in-place** (usado por editor de texto)
- **Limpieza automática** de archivos no referenciados

### 5. **Interfaces Responsive**
- **Mobile**: Panel deslizable con tabs (Subir, Pliego, Imágenes, Semitono)
- **Desktop**: Sidebar izquierda con zona de upload visual
- **Progreso animado** con círculo de porcentaje
- **Feedback visual** con toasts de Sonner

## 🔧 Tecnologías Utilizadas

### Backend
- **Multer**: Middleware de uploads
- **Sharp**: Procesamiento de imágenes
- **Drizzle ORM**: Base de datos PostgreSQL
- **Python AI Server**: Procesamiento AI (rembg, waifu2x)

### Frontend
- **React + TypeScript**
- **TanStack Query**: Gestión de estado
- **Custom Hooks**: `useUploadImage`, `useAddImageToPliego`
- **Context API**: Historial, Auth, TextParams

## 📁 Estructura de Datos

### Tabla `uploads`
```sql
CREATE TABLE uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  filename VARCHAR(255) NOT NULL,      # UUID.png
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  width_px INTEGER,
  height_px INTEGER,
  file_size_bytes BIGINT NOT NULL,
  image_url VARCHAR(500) NOT NULL,     # /api/uploads/files/{filename}
  trimmed_image_url VARCHAR(500),      # Versión recortada
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tabla `pliego_images` (relación)
```sql
CREATE TABLE pliego_images (
  id SERIAL PRIMARY KEY,
  pliego_id INTEGER REFERENCES pliegos(id),
  upload_id INTEGER REFERENCES uploads(id),  # ← FK a uploads
  x_cm DECIMAL(10,2),
  y_cm DECIMAL(10,2),
  -- ... otros campos
);
```

## 🚀 Flujo de Trabajo Típico

### 1. Usuario sube imagen
```typescript
// Frontend llama al hook
const uploadImage = useUploadImage();
const uploaded = await uploadImage.mutateAsync({
  data: { 
    file, 
    trimTransparency: true,
    removeSemiTransparency: true 
  }
});
```

### 2. Backend procesa
```typescript
// 1. Valida tipo de archivo
// 2. Verifica cuota disponible  
// 3. Procesa con Sharp (trim, semi-transparencia)
// 4. Guarda en disco (uploads_storage/)
// 5. Inserta registro en DB
// 6. Retorna objeto upload con URL pública
```

### 3. Se añade al pliego
```typescript
const addImageToPliego = useAddImageToPliego();
const added = await addImageToPliego.mutateAsync({
  id: pliegoId,
  data: { uploadId: uploaded.id }
});
```

### 4. Operaciones AI disponibles
```typescript
// Remove background
fetch(`/api/uploads/${uploadId}/remove-bg`, {
  method: 'POST',
  body: JSON.stringify({ tolerance: 30 })
});

// Upscale 2x
fetch(`/api/uploads/${uploadId}/upscale`, {
  method: 'POST', 
  body: JSON.stringify({ scale: 2 })
});
```

## 🛡️ Seguridad y Validaciones

### 1. **Autenticación Requerida**
```typescript
router.post("/uploads", requireAuth, upload.single("file"), ...);
```

### 2. **Validación de Tipos**
```typescript
const allowed = [
  "image/png", "image/jpeg", "image/jpg", 
  "image/svg+xml", "image/webp", "image/heic", 
  "image/heif", "image/avif"
];
```

### 3. **Límites de Tamaño**
- **Archivo individual**: 50MB
- **Cuota usuario**: 10GB
- **Dimensiones**: Procesadas a máximo 3000px para halftone

### 4. **Sanitización de Nombres**
- **UUID generado**: `a1b2c3d4-e5f6-...`
- **Extensión preservada**: `.png`, `.svg`
- **Sin información de ruta**

## 🎨 Interfaz de Usuario

### Mobile Upload Panel
```typescript
// Características:
// - Zona drag & drop con gradiente
// - Círculo de progreso animado
// - Soporte múltiple archivos
// - Integración con HistoryContext
// - Cierre automático al completar
```

### Desktop Upload Zone  
```typescript
// Características:
// - Gradiente violeta profesional
// - Icono animado (UploadCloud)
// - Texto descriptivo
// - Estados: idle, dragging, uploading
// - Integrado en SidebarLeft
```

## 🔄 Integración con Historial

Todas las operaciones son **deshacibles**:
```typescript
pushHistory({
  label: `Subir ${count} imágenes`,
  undo: async () => {
    // Elimina imágenes del pliego
    // No elimina uploads (pueden estar en uso)
  },
  cleanup: () => {
    // Elimina uploads no referenciados
    safeDeleteUpload(uploadId);
  }
});
```

## 📈 Métricas y Monitoreo

### Endpoints de Diagnóstico
```
GET /api/uploads/quota          # Uso de almacenamiento
GET /api/uploads/recent         # Últimos 50 uploads
```

### Logs Estructurados
```json
{
  "uploadId": 123,
  "userId": 456,
  "fileSize": 1024576,
  "width": 1920,
  "height": 1080,
  "action": "upload|remove-bg|upscale|halftone"
}
```

## 🚨 Solución de Problemas

### Error: "Almacenamiento lleno"
1. Verificar cuota: `GET /api/uploads/quota`
2. Eliminar uploads no usados
3. Contactar admin para upgrade

### Error: "Tipo de archivo no válido"
1. Verificar formato soportado
2. Convertir a PNG/JPG/SVG
3. Reducir tamaño si es HEIC/AVIF

### Error: Procesamiento AI lento
1. Verificar servidor Python (`:8765`)
2. Reintentar con fallback a Sharp
3. Reducir tamaño de imagen

## 🔮 Roadmap Futuro

### Próximas Mejoras
1. **Compresión inteligente**: WebP con transparencia
2. **Batch processing**: Procesar múltiples imágenes a la vez
3. **CDN integration**: Cloudflare Images/R2
4. **Preview avanzado**: Miniaturas con diferentes fondos
5. **Metadata extraction**: EXIF, color profiles

### Optimizaciones Técnicas
1. **Streaming uploads**: Para archivos >50MB
2. **Web Workers**: Procesamiento en cliente
3. **Cache inteligente**: ETag, If-Modified-Since
4. **Background jobs**: Procesamiento asíncrono

## 📚 Referencias

### Archivos Clave
- `artifacts/api-server/src/routes/uploads/index.ts` (Backend principal)
- `artifacts/dtf-pliego/src/components/layout/mobile/MobileUploadPanel.tsx`
- `artifacts/dtf-pliego/src/components/layout/SidebarLeft.tsx`
- `artifacts/dtf-pliego/src/lib/textRender.ts` (Integración texto)

### Dependencias
- `multer`: Upload middleware
- `sharp`: Image processing
- `@imgly/background-removal-node`: AI remove bg
- `pdf-lib`: PDF export (CMYK)

---

**Última actualización**: 8/4/2026  
**Estado**: ✅ **PRODUCCIÓN**  
**Responsable**: Yuki (雪) - Agente Autónomo ERROR707 Studio