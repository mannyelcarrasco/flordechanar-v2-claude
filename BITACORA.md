# 📋 Bitácora del Proyecto — Flor de Chañar v2
**Repositorio:** [mannyelcarrasco/flordechanar-v2-claude](https://github.com/mannyelcarrasco/flordechanar-v2-claude)  
**Última actualización:** 2026-07-22

---

## ✅ Avances completados

### 👨‍🏫 Panel de Profesores y Cursos (NUEVO)
- [x] **Panel de Edición de Cursos (`curso-crear.html`):**
  - Corrección de un error tipográfico en el ID del contenedor HTML (`professorsContainer` en lugar de `professorsPanel`) que impedía cargar y mostrar la lista de profesores para asignar a un curso ("Cargando profesores...").

### 🔒 Seguridad & Dependencias (NUEVO)
- [x] Corrección de vulnerabilidades de NPM detectadas por Hostinger (`qs`, `ip-address`).
- [x] Configuración de `overrides` en `package.json` para forzar el uso de versiones seguras en dependencias transitivas.

### 💳 Integración de Pasarela de Pagos (Flow) (NUEVO)
- [x] **Frontend (`pago.html`):**
  - Corrección visual del layout de las opciones de pago usando `.plan-grid`.
  - Diagnóstico de persistencia de caché del token JWT en el navegador para usuarios deslogueados.
- [x] **Backend & API (`server.js`):**
  - Creación del endpoint de diagnóstico `/api/debug/env` para verificar inyección de variables de entorno en producción.
  - Resolución del conflicto de credenciales Sandbox vs Producción (`FLOW_SANDBOX=false`).
  - **Fix crítico JWT:** Inclusión del campo `email` en la generación del token JWT en `/api/auth/login` para evitar el error `1620` de Flow (`The userEmail: undefined is not valid`).
  - **Fix crítico Suscripciones:** Corrección del parámetro de retorno a `url_return` (con guion bajo) en el endpoint `customer/register` de Flow para evitar el error `104` (`Missing service params: url_return`).

### 🚀 Integración de Asistente de IA & Landing Builder (NUEVO)
- [x] **Panel de Creación de Cursos (`curso-crear.html`):**
  - Reestructuración del orden de pasos: "Página de Ventas" movido al **Paso 5**.
  - Diseño nativo integrado para la caja del Asistente de IA, eliminando la antigua ventana modal emergente.
  - Implementación de campos para contexto dinámico: **Documento PDF**, **Contexto Web (URL)** y **Caja de Instrucciones**.
  - Implementación de campos estructurados para crear Landing Pages: **Video VSL (URL)** y sistema dinámico de **Testimonios**.
- [x] **Backend & API (`server.js`):**
  - Actualización del endpoint `POST /api/ai/generar-ventas` para aceptar URL, PDFs y texto.
  - Implementación de scraping de texto automático desde las URLs proporcionadas por el usuario.
  - Integración de `pdf-parse@1.1.1` para lectura y extracción de texto de archivos PDF (funcionando de forma local).
  - Configuración global para usar la API de **Gemini** o **OpenAI** (configurable en `.env`).
- [x] **Frontend Cliente (`detalle.html`):**
  - Actualización de la visualización del curso para incrustar automáticamente el Video VSL.
  - Renderizado dinámico de la grilla de Testimonios del curso extrayendo los datos JSON desde `c.ventas_meta`.

### 🔧 Infraestructura & Deploy
- [x] Repositorio GitHub configurado y sincronizado con local
- [x] Workflow de GitHub Actions creado (`.github/workflows/deploy.yml`) para deploy automático a Hostinger al hacer push a `main`
- [x] Merge del branch de trabajo `claude/build-lms-repo-page-eWLsk` → `main` completado
- [x] Deploy manual realizado desde hPanel de Hostinger (Git integration activada)

### 📅 Página de Reservas (`public/terapias.html`)
- [x] Widget de agenda **AtendIA** incrustado (`data-company="3"`) reemplazando los paneles mock de WhatsApp
- [x] Script del widget: `https://funnelstudio.click/AtendIA_dev/embed.js`
- [x] Texto corregido: "Selecciona tu ciudad" → **"Selecciona tu servicio"**
- [x] Contenedor del widget con altura controlada (`min-height:600px`, `max-height:90vh`) para evitar crecimiento excesivo de espacio en blanco

### 🌟 Muro de Testimonios & Prueba Social de Fresha (NUEVO)
- [x] **Curación y Sistema de Testimonios (`public/testimonios-data.js`):**
  - Creación de un script modular con 16 testimonios curados y verificados que representan las 115+ reseñas con 4.9⭐ en Fresha.
  - Implementación del widget dinámico `renderTestimoniosWidget` que incluye Trust Badge, filtrado por tipo de terapia y diseño en grilla con estrellas doradas e icono de verificación.
- [x] **Integración en Páginas Públicas:**
  - `terapias.html`: Incrustación del Muro de Confianza justo encima del widget de agenda de AtendIA para reducir fricción y aumentar conversiones.
  - `index.html`: Incorporación de mini-badge de 4.9⭐ en el Hero superior y nueva sección de "Lo que dicen nuestros pacientes" en la portada.
  - `curso-crear.html`: Botón "✨ Importar de Fresha (4.9★)" en el Paso 5 para autocompletar testimonios verificados al crear páginas de venta con IA.

---

## 🕐 Pendientes

### Alta prioridad
- [ ] Configurar **Secrets de GitHub** para activar el deploy automático vía GitHub Actions:
  - `HOSTINGER_HOST` — IP o dominio del servidor
  - `HOSTINGER_USER` — usuario SSH
  - `HOSTINGER_SSH_KEY` — clave privada SSH
  - `HOSTINGER_PORT` — puerto SSH (generalmente `22`)
- [ ] Configurar **PM2** en el servidor de Hostinger para mantener el proceso Node.js corriendo
- [ ] Verificar que el widget AtendIA se adapte bien en móvil (responsive)

### Media prioridad
- [ ] Evaluar si las tarjetas de terapias deben reactivarse o reemplazarse por contenido dinámico desde el panel admin
- [ ] Revisar los números de WhatsApp en los botones flotantes (actualmente usan `56912345678` de ejemplo)
- [ ] Decidir si se mantiene la sección `booking-integration` con su diseño oscuro o se adapta al tema claro del widget

### Baja prioridad
- [x] Sección de testimonios agregada en `terapias.html` y en `index.html` (Muro de Confianza 4.9⭐ de Fresha)
- [ ] Agregar meta tags SEO específicos para la página de terapias

---

## 📎 Anexos

### Anexo A — Variables de Entorno (.env)
Para activar la Inteligencia Artificial, es necesario proveer la API Key correspondiente en el archivo `.env` en la raíz del proyecto:
```env
GEMINI_API_KEY=tu_clave_de_gemini
OPENAI_API_KEY=tu_clave_de_openai
```

### Anexo B — Tarjetas de Terapias (ocultas)
Las tarjetas de servicio (Biomagnetismo Clínico, Terapia Floral, Reiki y Canalización, Masoterapia Integral) están **ocultas visualmente pero presentes en el código**.

**Archivo:** `public/terapias.html` — línea ~189

**Para reactivarlas:** buscar esta línea y eliminar `style="display:none"`:
```html
<!-- ANTES (ocultas): -->
<section class="container therapies-section" style="display:none">

<!-- DESPUÉS (visibles): -->
<section class="container therapies-section">
```
> **Nota:** Estas tarjetas son HTML estático — no se configuran desde el panel de administración ni desde AtendIA.

---

### Anexo C — Estructura de Branches
| Branch | Propósito | Estado |
|--------|-----------|--------|
| `main` | Producción — conectado a Hostinger | ✅ Activo |
| `claude/build-lms-repo-page-eWLsk` | Branch de trabajo anterior | Mergeado a main |

---

### Anexo D — Widget AtendIA
| Parámetro | Valor |
|-----------|-------|
| `data-company` | `3` |
| Script embed | `https://funnelstudio.click/AtendIA_dev/embed.js` |
| Ubicación en página | `#agendar` — sección "Agenda tu Espacio de Sanación" |
| Archivo | `public/terapias.html` línea ~228 |

---

### Anexo E — GitHub Actions Deploy
| Elemento | Detalle |
|----------|---------|
| Workflow | `.github/workflows/deploy.yml` |
| Trigger | Push a branch `main` |
| Estado actual | ⚠️ Inactivo — faltan Secrets de Hostinger |
| Secrets requeridos | `HOSTINGER_HOST`, `HOSTINGER_USER`, `HOSTINGER_SSH_KEY`, `HOSTINGER_PORT` |
| Dónde configurarlos | GitHub → Settings → Secrets and variables → Actions |

---

*Documento generado y mantenido durante el desarrollo del proyecto.*
