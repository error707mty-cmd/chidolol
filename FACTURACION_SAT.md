# Sistema de Facturación Electrónica SAT México - CFDI 4.0

## Investigación Completa

### ¿Qué es CFDI 4.0?
Comprobante Fiscal Digital por Internet versión 4.0 - Estándar obligatorio del SAT desde 2022 para facturación electrónica en México.

### Componentes Necesarios

#### 1. PAC (Proveedor Autorizado de Certificación)
- **Función**: Timbrar y validar facturas ante el SAT
- **Opciones Recomendadas**:
  - **Facturama** (https://facturama.mx) - Incluye 100 folios iniciales, API REST
  - **Facturapi** (https://facturapi.io) - API moderna, JSON, ambiente de pruebas
  - **Conectia** (https://conectia.mx) - Multi-PAC, timbres sin caducidad
  - **FiscalCloud** (https://fiscalcloud.mx) - Sin cuotas anuales

- **Costos**: Desde $399 MXN/año + timbres individuales (aprox $0.50-$1.50 por timbre)

#### 2. Certificados Requeridos
- **CSD (Certificado de Sello Digital)**: Obtenido del SAT
- **e.firma**: Para solicitar el CSD

#### 3. Requisitos Técnicos
- RFC activo del negocio
- Constancia de situación fiscal
- Régimen fiscal correcto
- Código postal del establecimiento

### Flujo de Facturación

```
1. Usuario solicita factura
   ↓
2. Sistema genera XML con datos (emisor, receptor, conceptos, impuestos)
   ↓
3. Pre-validación local (estructura, catálogos SAT)
   ↓
4. Envío a PAC vía API
   ↓
5. PAC valida y timbra (asigna UUID + sello SAT)
   ↓
6. Sistema recibe XML/PDF timbrado
   ↓
7. Almacenamiento (obligatorio 5 años mínimo)
   ↓
8. Envío al cliente
```

### Datos Obligatorios en CFDI 4.0
- **Emisor**: RFC, Nombre, Código Postal, Régimen Fiscal
- **Receptor**: RFC, Nombre, Código Postal, Régimen Fiscal, Uso de CFDI
- **Conceptos**: Clave Producto/Servicio SAT, Unidad, Cantidad, Descripción, Precio
- **Impuestos**: IVA, ISR (según aplique)
- **Forma de Pago**: Efectivo, Tarjeta, Transferencia, etc.
- **Método de Pago**: PUE (Pago en una exhibición), PPD (Pago en parcialidades)

### Catálogos SAT Importantes
- **c_ClaveProdServ**: Códigos de productos/servicios
- **c_ClaveUnidad**: Unidades de medida
- **c_UsoCFDI**: Uso que dará el receptor (G03 - Gastos en general, etc.)
- **c_FormaPago**: 01-Efectivo, 03-Transferencia, 04-Tarjeta crédito, etc.

### Complementos Adicionales
- **Complemento de Pagos 2.0**: Para registrar pagos relacionados a facturas
- **Carta Porte 2.0**: Para transporte de mercancías
- **Nómina 1.2**: Para recibos de nómina

### Implementación en el Sistema POS

#### Página de Facturación (Pendiente)
**Ubicación**: `/admin/facturacion`

**Funcionalidades**:
1. **Configuración de Emisor**
   - RFC, Nombre Fiscal, Régimen Fiscal
   - Certificados CSD (carga de archivos .cer y .key)
   - Configuración de PAC (API keys)

2. **Generación de Facturas**
   - Seleccionar venta del historial
   - Solicitar datos del receptor (RFC, Nombre, CP, Uso CFDI)
   - Asignar claves de productos SAT
   - Calcular impuestos automáticamente

3. **Timbrado**
   - Validación previa
   - Envío a PAC vía API
   - Recepción de UUID
   - Descarga de XML/PDF

4. **Gestión de Facturas**
   - Listado de facturas emitidas
   - Cancelación de facturas (con motivo SAT)
   - Reenvío de XML/PDF
   - Generación de complementos de pago

5. **Reportes**
   - Facturas por período
   - Ingresos facturados vs no facturados
   - Exportación para contabilidad

### Pasos para Activar Facturación

1. **Obtener CSD del SAT**
   - Ingresar al portal del SAT con e.firma
   - Generar CSD (válido 4 años)
   - Descargar archivos .cer y .key

2. **Contratar PAC**
   - Registrarse en Facturama/Facturapi/otro
   - Obtener API keys
   - Configurar ambiente de pruebas

3. **Configurar en el Sistema**
   - Subir certificados CSD
   - Configurar datos fiscales
   - Configurar API del PAC
   - Mapear productos a catálogo SAT

4. **Pruebas**
   - Generar facturas de prueba
   - Verificar timbrado en ambiente sandbox
   - Validar XML en portal SAT

5. **Producción**
   - Activar ambiente productivo
   - Capacitar usuarios
   - Monitorear primeras facturas

### Costos Estimados
- **PAC**: $399-$1,500 MXN/año
- **Timbres**: $0.50-$1.50 por factura
- **CSD**: Gratuito (desde SAT)
- **e.firma**: Gratuito (desde SAT)

### APIs Recomendadas

**Facturama**:
```javascript
// Ejemplo de timbrado
const response = await fetch('https://api.facturama.mx/api/3/cfdi', {
  method: 'POST',
  headers: {
    'Authorization': 'Basic ' + btoa('username:password'),
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    Receiver: { Rfc: 'XAXX010101000', Name: 'Cliente' },
    Items: [
      {
        ProductCode: '01010101',
        Description: 'Impresión DTF',
        Unit: 'Metros',
        Quantity: 10,
        UnitPrice: 250
      }
    ],
    // ... más datos
  })
});

const factura = await response.json();
console.log('UUID:', factura.Complement.TaxStamp.Uuid);
```

### Notas Importantes
- Las facturas se deben emitir máximo 72 horas después de la venta
- El UUID es único e irrepetible
- Las cancelaciones requieren aceptación del receptor para montos >$5,000 MXN
- Conservar XML y PDF por 5 años mínimo
- El sistema debe validar RFC contra padrón SAT en tiempo real

### Referencias
- SAT: https://www.sat.gob.mx/factura
- Documentación CFDI 4.0: https://www.sat.gob.mx/consulta/91447/comprobante-fiscal-digital-por-internet
- Lista de PACs autorizados: https://www.sat.gob.mx/consulta/16703/conoce-los-proveedores-de-certificacion-de-cfdi-autorizados-por-el-sat

---

**Estado**: Investigación completa ✅  
**Implementación**: Pendiente (para siguiente fase)  
**Prioridad**: Media (después de completar funcionalidades básicas del POS)
