# 📋 Bitácora del Proyecto — Flor de Chañar v2
**Repositorio:** [mannyelcarrasco/flordechanar-v2-claude](https://github.com/mannyelcarrasco/flordechanar-v2-claude)  
**Última actualización:** 2026-10-19

---

## ✅ Avances completados

### 📍 Gestión y Visualización de Sedes en Programas (NUEVO)
- [x] **Panel de Edición de Cursos (`curso-crear.html`):**
  - El bloque **Sedes y Horarios del Programa** en el Paso 1 (*Información Básica*) ahora está siempre visible para que sea fácil de encontrar en cualquier modalidad.
  - Corrección de carga asíncrona al editar cursos existentes (`renderSedesConfig()`, `renderOnlineHorarios()`, `handleModalidadChange()`) y sincronización automática con la columna `sede` y `horarios_sedes`.
  - Posibilidad de elegir una sede existente (*Sede Calama*, *Sede La Serena*, etc.) o **escribir y crear una sede directamente** desde el editor del curso sin salir de la página.
- [x] **Panel de Administración (`admin.html` & `server.js`):**
  - Botón directo **Configurar Sedes Físicas** en la pestaña *Cursos* (que redirige a *Ajustes → Sedes Físicas*).
  - Corrección en `guardarSedesGlobales()` (`localStorage.getItem('token')` y `showT`) y precarga por defecto de *Sede Calama* y *Sede La Serena* en `/api/configuracion/sedes`.
  - Visualización de la(s) sede(s) asignada(s) en la columna **Modalidad / Sede** de la tabla de cursos del administrador.
- [x] **Catálogo y Página de Ventas (`escuela.html` & `detalle.html`):**
  - Visualización de insignias (*badges*) de Sede y sus horarios tanto en las tarjetas de programas (`escuela.html`) como en la cabecera y tarjeta lateral de compra ("Este curso incluye") de `detalle.html`, independientemente de la modalidad del programa.

### 🌿 Landing de Terapia Emocional Evolutiva (`/TerapiaEmocionalEvolutiva`) (NUEVO)
- [x] Integración de la landing page de **Terapia Emocional Evolutiva (T.E.E.)** en `public/TerapiaEmocionalEvolutiva/` (`index.html`, `css/styles.css`, `js/main.js`, `assets/img/`).
- [x] Enlace en tiempo real (*Windows Directory Junction* `mklink /J`) entre `C:\Users\manny\OneDrive\Documents\TerapiaEmocionalEvolutiva` y `public/TerapiaEmocionalEvolutiva` para sincronización instantánea entre ambos proyectos.
- [x] Middleware en `server.js` para asegurar redirección limpia con barra final (`/TerapiaEmocionalEvolutiva/`) e insensibilidad a mayúsculas/minúsculas en Linux/Hostinger.

### 👨‍🏫 Panel de Profesores y Cursos (NUEVO)
- [x] **Panel de Edición de Cursos (`curso-crear.html` & `server.js`):**
  - Corrección de un error tipográfico en el ID del contenedor HTML (`professorsContainer` en lugar de `professorsPanel`) que impedía cargar y mostrar la lista de profesores para asignar a un curso ("Cargando profesores...").
  - Incorporación del campo **Mensualidad (CLP / mes)** directamente en la sección *Precio y Acceso* de `curso-crear.html`, sincronizado automáticamente con la tabla `planes` en `GET/POST/PUT /api/cursos` (y reinicio de `flow_plan_id` al cambiar el monto).
  - Corrección de la carga/cambio de **Imagen de portada**: ahora se muestran botones visibles de *Cambiar / Subir nueva imagen* y *Quitar imagen* tanto en Información Básica como directamente en la tarjeta lateral de *Vista Previa*, además de incluir `portada_url` al crear cursos nuevos (`POST /api/cursos`).

### 🔒 Seguridad & Dependencias (NUEVO)
- [x] Corrección de vulnerabilidades de NPM detectadas por Hostinger (`qs`, `ip-address`).
- [x] Corrección final de vulnerabilidades restantes: actualización manual de `multer` a la versión `2.2.0` y `body-parser` a `2.3.0` (se descartó el PR automático de Hostinger porque eliminaba endpoints críticos del `server.js`).
- [x] Configuración de `overrides` en `package.json` para forzar el uso de versiones seguras en dependencias transitivas.

### 💳 Integración de Pasarela de Pagos y Suscripciones (Flow) (NUEVO)
- [x] **Frontend (`detalle.html`, `pago.html`, `login.html`, `suscripcion.html`):**
  - Corrección del envío y preselección automática de `plan_id` y `curso_id` al pasar de `detalle.html` o `suscripcion.html` a `pago.html` (evitando que se envíe el ID del curso como `plan_id`).
  - Redirección inteligente con `?redirect=` hacia `login.html` cuando el usuario no ha iniciado sesión o su token expiró, regresándolo automáticamente al checkout tras iniciar sesión o registrarse.
  - Mensajes de confirmación y error claros en `suscripcion.html` al volver del enrolamiento de tarjeta en Flow.
- [x] **Backend & API (`server.js`):**
  - Corrección del endpoint oficial de Flow a `plans/create` (en plural) con `interval: 3` (mensual) / `4` (anual), `interval_count: 1`, `trial_period_days: 0` y `urlCallback`, además de verificación automática mediante `plans/get` para reparar planes previos con IDs inválidos.
  - Auto-recuperación de `flow_customer_id` si un usuario tenía un ID antiguo de Sandbox al operar en Producción.
  - Configuración de `url_return` en `customer/register` apuntando a `/api/suscripciones/confirmar-registro` (soportando `POST` y `GET`), que verifica `customer/getRegisterStatus`, ejecuta `subscription/create` en Flow, activa la suscripción, inscribe automáticamente al alumno en `inscripciones`, registra el cobro en `pagos` y redirige a `/suscripcion.html?estado=ok`.
  - Middleware `POST → GET (303)` para páginas `.html` estáticas cuando Flow redirige vía `POST`.
  - Inclusión de cursos con suscripción activa en `/api/cursos/mis-cursos` para que aparezcan siempre en el Dashboard del estudiante.
- [x] **Fixes previos de entorno y JWT:**
  - Creación del endpoint `/api/debug/env` y resolución de credenciales Sandbox vs Producción (`FLOW_SANDBOX=false`).
  - Inclusión del campo `email` en el token JWT y respaldo desde base de datos en `/api/suscripciones/iniciar`.

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
- [x] Botón flotante de WhatsApp de Reservas incrustado (`56984281226`) protegido con `data-wa-ignore="true"` para no ser sobrescrito por el número general/escuela

### 🌟 Muro de Testimonios & Prueba Social de Fresha (NUEVO)
- [x] **Curación y Sistema de Testimonios (`public/testimonios-data.js`):**
  - Creación de un script modular con 18 testimonios curados y verificados que representan las 115+ reseñas con 4.9⭐ en Fresha.
  - Actualización completa del catálogo de servicios en comentarios y pestañas de filtrado para reflejar la oferta vigente: **Terapia Energética** (reemplazando Reiki), **Acupuntura** (para dolor crónico/agudo), **Masoterapia y Masajes** (relajante, descontracturante, drenaje), **Terapia Emocional** (Flores de Bach) e **Hipnosis y Regresión**.
- [x] **Integración y Depuración en Plataforma:**
  - `terapias.html`: Incrustación del Muro de Confianza, botón de llamada a la acción en la cabecera ("Ir directo a Reservar Hora ↓") con scroll suave hacia el widget de AtendIA, y actualización de tarjetas de servicios con el catálogo vigente.
  - `admin.html`, `profesor.html`, `curso-crear.html`, `eval-crear.html`, `foro.html`: Eliminación de menciones a biomagnetismo/reiki en placeholders y ejemplos, alineando todo el ecosistema web y LMS.

---

## 🕐 Pendientes

### Alta prioridad
- [x] ~~Configurar **Secrets de GitHub**~~ (Cancelado: Hostinger ya actualiza automáticamente con su propia integración Git al hacer push)
- [x] Configurar **PM2** en el servidor de Hostinger para mantener el proceso Node.js corriendo (Asumido resuelto, servidor ya operativo)
- [ ] Verificar que el widget AtendIA se adapte bien en móvil (responsive)

### Media prioridad
- [ ] Evaluar si las tarjetas de terapias deben reactivarse o reemplazarse por contenido dinámico desde el panel admin
- [/] Revisar los números de WhatsApp en los botones flotantes (actualizado número de reservas a `56984281226`; escuela/general mantiene su número independiente)
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
