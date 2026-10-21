# 📋 Bitácora del Proyecto — Flor de Chañar v2
**Repositorio:** [mannyelcarrasco/flordechanar-v2-claude](https://github.com/mannyelcarrasco/flordechanar-v2-claude)  
**Última actualización:** 2026-10-21

---

## ✅ Avances completados

### 🖼️ Inclusión Permanente de Portadas Oficiales y Corrección de Permisos en Uploads (`server.js`, `public/img/cursos/`, `public/uploads/`) (NUEVO)
- [x] **Incorporación Permanente de Imágenes en el Repositorio Git:**
  - Se agregaron las imágenes oficiales de **Masoterapia Profesional Sede La Serena** y **Masoterapia Profesional Sede Calama** (Método Mushuu) tanto en `public/img/cursos/` como en `public/uploads/`:
    - `masoterapia-la-serena-2026.png`
    - `masoterapia-calama-2026.png`
  - Al estar versionadas directamente en el repositorio Git, quedan blindadas frente a despliegues y reinicios de contenedores en Hostinger.
- [x] **Permisos de Archivos y Directorio en Servidor (Hostinger LiteSpeed):**
  - En entornos compartidos como Hostinger LiteSpeed con CloudLinux, los procesos Node.js pueden crear archivos con umask restrictiva (`0600`), impidiendo que el servidor web LiteSpeed o la CDN de Hostinger (`hcdn`) los lea y provocando el fallo de visualización o el error 422.
  - Se incorporó `fs.chmodSync(req.file.path, 0o644)` tras cada subida en `POST /api/upload` y permisos `0o755` automáticos para la carpeta `uploadsDir`, garantizando lectura pública para el servidor web.
- [x] **Auto-asignación en `initDB()`:**
  - Actualización automática en base de datos para asignar `/img/cursos/masoterapia-la-serena-2026.png` al curso de La Serena y `/img/cursos/masoterapia-calama-2026.png` al curso de Calama.

### 🎯 Simplificación de Botones de Compra en Detalle (`public/detalle.html`) (NUEVO)
- [x] **Eliminación de Botón Redundante de Matrícula en Buy Box:**
  - Se removió el botón amarillo secundario de "Pagar Matrícula" en la tarjeta de compra de [detalle.html](file:///c:/Users/manny/OneDrive/Documents/flordechanar-v2-claude/public/detalle.html).
  - El valor de la matrícula se mantiene de forma clara y elegante en la insignia superior (`🎓 Matrícula: $XX.XXX` o `Matrícula Gratis ($0)`).
  - Ahora las acciones principales quedan limpias y directas:
    1. **"Suscribirme Ahora"** (o "Comprar Ahora" / Pago único).
    2. **"Postular / Solicitar Admisión e Info"** (formulario interactivo del funnel).

### 🐛 Corrección de Error en Detalle de Cursos (`public/detalle.html`) (NUEVO)
- [x] **Diagnóstico del Error de Conexión en `/detalle.html?id=X`:**
  - Al abrir la página de detalle de cualquier curso (ej. `/detalle.html?id=13`), la pantalla se quedaba en blanco mostrando únicamente `"⚠️ Error de conexión."`.
  - La causa raíz fue un `ReferenceError: meta is not defined` en `renderCourse()` al consultar `meta.matricula_config` (la variable `meta` no estaba declarada).
  - Dado que la llamada a `renderCourse()` estaba contenida en el mismo `try/catch` de la petición `fetch`, cualquier excepción en JavaScript saltaba al bloque `catch` y mostraba el texto `"⚠️ Error de conexión."`.
- [x] **Solución y Resiliencia en Frontend (`detalle.html`):**
  - Se declaró correctamente `parsedVm` al deserializar `c.ventas_meta` y se asoció `matCfg = (parsedVm && parsedVm.matricula_config) || {}`.
  - Se desacopló el flujo en tres fases independientes con manejo de errores granular:
    1. **Carga de datos del curso:** Muestra mensaje de conexión si la red falla.
    2. **Renderizado de la interfaz:** Si ocurre algún error visual, se reporta claramente sin confundirlo con un fallo de servidor.
    3. **Carga del currículum / temario:** Si falla o no tiene temario publicado, no interrumpe ni oculta la información general, precios ni botones de compra del curso.

### 🖼️ Corrección y Resiliencia de Imágenes de Portada en Cursos (`escuela.html`, `detalle.html`, `server.js`, `curso-crear.html`) (NUEVO)
- [x] **Diagnóstico de Imágenes No Visibles:**
  - Se identificaron dos causas por las que las imágenes no cargaban y mostraban un recuadro gris vacío (`background-color: #E2E8F0`):
    1. **Archivos de `/uploads/` faltantes o no persistentes tras redeploys:** Al solicitar `/uploads/...` y no existir el archivo en disco, la petición caía en el fallback SPA (`index.html`) devolviendo código 200 con HTML; Hostinger CDN (`hcdn`) al intentar optimizar la imagen recibía HTML y arrojaba error `422 Invalid source image`, haciendo que el CSS `background-image` fallara silenciosamente a color gris.
    2. **URLs históricas de WordPress con CDN de Jetpack (`i0.wp.com`):** Las imágenes migradas apuntaban a `flordechanar.cl/wp-content/...`, pero WordPress fue movido a `web1.flordechanar.cl`, lo que provocaba que Jetpack devolviera error `400 Bad Request`.
- [x] **Backend & API (`server.js`):**
  - **Redirección de `/wp-content`:** Nuevo middleware que redirige automáticamente cualquier solicitud a `/wp-content/*` hacia `https://web1.flordechanar.cl/wp-content/*` (donde residen todas las imágenes oficiales de WordPress).
  - **Ruta de rescate para `/uploads/:filename`:** Si un archivo subido no existe físicamente en disco, en lugar de devolver `index.html` (que producía 422 en CDN), el servidor redirige de inmediato (302) a una imagen de bienestar/terapia válida de alta resolución.
  - **Normalizador de URLs (`normalizePortadaUrl`):** En `GET /api/cursos`, `GET /api/cursos/publico/:id`, `GET /api/cursos/:id`, `GET /api/cursos/dictados`, `GET /api/cursos/mis-cursos` y `GET /api/admin/cursos`, se reescriben al vuelo las URLs de `flordechanar.cl/wp-content/` a `web1.flordechanar.cl/wp-content/`.
  - **Auto-reparación en `initDB()`:** Script de inicialización que actualiza automáticamente las portadas de los cursos existentes con sus imágenes oficiales válidas (Presencial La Serena, Reflexología Holística y Masoterapia Online).
- [x] **Frontend Público y Alumno (`escuela.html`, `detalle.html`, `dashboard.html`):**
  - Reemplazo de `background-image` en CSS estático por elementos `<img>` con `loading="lazy"` y controlador `onerror` automático: si una imagen falla por red o CDN, se reemplaza al instante por la portada de respaldo sin dejar jamás el recuadro gris vacío.
  - Efecto de zoom suave al pasar el cursor (`transform: scale(1.05)`) y cursor clicable hacia el detalle del curso.
  - En `detalle.html`: pre-carga y verificación con `new Image()` para el fondo del Hero, cayendo al fondo por defecto si falla la imagen externa.
- [x] **Panel de Creación de Cursos (`curso-crear.html`):**
  - Nuevo campo opcional para **Ingresar enlace directo (URL)** de imagen (`#coverUrlInput`), permitiendo a los administradores pegar links directos de Unsplash, Cloudinary o WordPress además de la opción de subir archivos locales.
  - Archivo `.gitkeep` agregado a `public/uploads/` para asegurar que el directorio permanezca versionado en git.

### 📅 Sistema de Calendario Organizativo, Docente y Promocional + Eventos con Cupo AtendIA (NUEVO)
- [x] **Pestaña Propia y Reorganización de Navegación en la Escuela (`public/escuela.html`):**
  - El Calendario de Actividades e Inicios ahora cuenta con su propia **pestaña dedicada** y se ubica limpiamente después del catálogo de cursos para que la oferta académica principal sea lo primero que vea el visitante al entrar.
  - **Selector Superior de Vistas:** Pestañas tipo pastilla (`Catálogo de Cursos` vs `📅 Calendario de Inicios y Talleres`) justo debajo de la portada para alternar entre ambos modos en 1 clic con persistencia en URL hash (`#catalogo`, `#calendario`).
  - **Navegación en Barra Lateral (Sidebar):** Nuevo bloque de *Modo de Vista* en la barra lateral de categorías con acceso directo a `Catálogo de Cursos` y `📅 Calendario de Inicios` con insignia de *Nuevo*.
  - **Banner al Final de los Cursos:** Tarjeta interactiva al pie del listado de cursos que invita a los alumnos a consultar las próximas fechas de clases y talleres con cupos en vivo.
- [x] **Diferenciación Clara entre Fecha de Inicio de Clases (Docencia) y Apertura de Matrícula (Ventas) (`curso-crear.html`, `server.js`, `escuela.html`, `admin.html`):**
  - Incorporación de la columna `fecha_inicio_clases` en la tabla `cursos`, separando explícitamente:
    1. **Fecha de Inicio de Clases (Docencia):** Cuándo inician efectivamente las clases o se dicta el taller (se muestra destacada en el calendario como "INICIO CLASES" y fecha oficial).
    2. **Apertura de Ventas / Matrícula:** Cuándo está disponible para comprarse o postularse (evitando que una venta abierta hoy se confunda con que el curso arranca hoy).
    3. **Fecha de Término de Clases (Opcional):** Hasta qué fecha se proyectan las clases.
  - En la tarjeta del calendario de `escuela.html`:
    - El badge superior ahora indica explícitamente `INICIO CLASES` (o `TALLER` / `EVENTO`), y debajo del título se diferencian con claridad el inicio de clases en verde y la fecha de matrícula abierta.
    - Corrección del badge de duración (`⏳ 160 hrs` en lugar de un número suelto `160`).
  - En `admin.html`:
    - El calendario y la planificación anual muestran ambos hitos (`🚀 Inicio Clases: ...` y `🛒 Apertura Matrícula: ...`) para permitir control total tanto del área académica como del área comercial.
- [x] **Motor de Proyección de Clases y API de Calendario (`server.js`):**
  - Nuevas columnas `fecha_fin_clases` y `atendia_event_id` en la tabla `cursos`, más nueva tabla `calendario_eventos` para talleres especiales, charlas abiertas, cierres de matrícula, reuniones docentes y feriados.
  - Proyección automática de días de clase recurrentes durante los próximos meses/año (`buildCourseRecurringSessions`, `parseDiasSemana`, `estimateFechaFin`) a partir de `fecha_inicio_clases`, `duracion`, `dias_clase` y `horarios_sedes` de cada curso activo o publicado.
  - Nuevos endpoints `GET /api/calendario/publico`, `GET /api/calendario/interno`, `POST/PUT/DELETE /api/calendario/eventos` y `POST /api/calendario/inscribir-evento`.
- [x] **Integración Bidireccional con Eventos con Cupo de AtendIA (`server.js` & `curso-crear.html`):**
  - Conexión en tiempo real con `GET /n8n/events?company_id=8` y `POST /n8n/event-register` de AtendIA (`X-Atendia-Token`) para compartir cupos disponibles (`capacity`, `seats_left`, `is_full`) entre el Bot de WhatsApp y la web.
  - En el editor de cursos (`curso-crear.html`, Paso 5), ahora se puede definir la **Fecha de Término de Clases** y vincular un programa o taller con un **Evento con Cupo de AtendIA**, de modo que cuando un alumno completa el formulario o se registra desde el calendario web, descuenta automáticamente el cupo en AtendIA y sincroniza su perfil con el Bot de IA.
- [x] **Calendario y Planificación para Directivos (`admin.html`):**
  - Nueva pestaña **📅 Calendario y Planificación** con 4 sub-vistas interactivas:
    1. **Grilla Mensual:** Visualización día a día con detalle de clases regulares proyectadas, inicios de curso, talleres, evaluaciones, clases en vivo y eventos de AtendIA.
    2. **Planificación Anual (Mes a Mes):** Línea de tiempo anual para planificar aperturas de programas, talleres e hitos mes por mes.
    3. **Carga por Profesor y Sede:** Resumen de sesiones proyectadas en el mes y próximos días de clase agrupados por docente y sede (*Sede Calama*, *Sede La Serena*, *Online*).
    4. **Eventos con Cupo (AtendIA):** Panel de control de eventos grupales sincronizados con el Bot de WhatsApp y barra de ocupación de cupos en vivo.
  - Modal para crear/editar/eliminar eventos, talleres promocionales e hitos internos o públicos.
- [x] **Mi Calendario de Clases para Profesores (`profesor.html`):**
  - Nueva pestaña **📅 Mi Calendario de Clases** para que cada docente consulte su grilla mensual personalizada y el listado cronológico de sus próximas clases regulares, sesiones en vivo y evaluaciones.
- [x] **Calendario Promocional Público y Reserva de Cupos (`escuela.html`):**
  - Nueva sección pública **📅 Calendario de Próximos Inicios, Talleres y Actividades** (`#calendario-actividades`) con acceso directo desde el Hero de la escuela.
  - Filtros por **Sede / Modalidad** (*Calama*, *La Serena*, *Online*) y por **Mes**, alternando entre vista de **Próximas Fechas (Tarjetas con barra de cupos en tiempo real)** y **Calendario Mensual**.
  - Modal de **Reserva Directa de Cupo** (`#pubEventRegModal`) que registra al interesado en AtendIA (`/n8n/event-register` + `/n8n/save-profile`), descuenta el cupo en vivo y ofrece confirmación inmediata vía WhatsApp.

### 🎯 Embudo Interactivo de Admisión (Funnel Editable) + Integración API con Bot AtendIA (NUEVO)
- [x] **3 Modos de Flujo de Entrada por Programa (`curso-crear.html` & `detalle.html`):**
  - En el editor de cursos (*Precio y Acceso*), ahora se puede elegir entre **3 opciones de flujo** para cada programa o curso:
    1. **`pago` (Solo Pasarela de Pago):** Envía directo al checkout/suscripción en Flow (ideal para cursos cortos grabados).
    2. **`formulario` (Solo Formulario Interactivo / Funnel):** Reemplaza el botón de compra por un cuestionario interactivo paso a paso de postulación/orientación (ideal para programas de 1 o 2 años).
    3. **`ambos` (Ambos flujos):** Muestra el botón de inscripción/pago directo y debajo el botón del formulario interactivo para quienes prefieren orientación previa.
- [x] **Constructor Editable de Preguntas y Plantillas Rápidas (`curso-crear.html`):**
  - Permite personalizar el texto del botón, título/subtítulo de la ventana interactiva y agregar/editar/eliminar preguntas (de alternativas clicables o respuesta abierta).
  - Incluye botones de **Plantilla Rápida en 1 clic** para *Programas de 1 a 2 Años* y *Cursos Cortos*.
- [x] **Integración Directa por API con AtendIA (`server.js`):**
  - Nueva tabla `prospectos_cursos` y endpoints `POST /api/prospectos`, `GET /api/prospectos`, `PUT /api/prospectos/:id`, `POST /api/prospectos/:id/resync` y `DELETE /api/prospectos/:id`.
  - Al completar el formulario en `detalle.html`, el backend sincroniza automáticamente al interesado con **AtendIA** (`POST /n8n/save-profile` con header `X-Atendia-Token` y `POST /api/submit-form.php`), creando el contacto en la empresa correspondiente (`company_id = 8`), asignando su sede (*Sede Calama*, *Sede La Serena*, *Online*) e inyectando todas sus respuestas en `personal_notes` dentro de la memoria del **Bot de IA de WhatsApp** (más disparo opcional de plantilla vía `/n8n/send`).
  - Corrección de compatibilidad en `POST /api/prospectos` para recibir indistintamente `whatsapp` o `telefono` y `sede_modalidad` o `sede_interes`.
- [x] **Gestión de Prospectos en Panel de Administración (`admin.html`):**
  - Nueva pestaña **🎯 Prospectos / Funnel** para visualizar todos los interesados, sus respuestas del cuestionario, estado de sincronización con la memoria del Bot de AtendIA (con botón de re-sincronización manual), cambio de estado (*Nuevo*, *En conversación*, *Inscrito*, *Descartado*) y acceso directo a WhatsApp.

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
  - Incorporación de **Configuración de Matrícula** por curso/programa (`tiene_matricula`, `valor_matricula`, `cobra_matricula`) en la sección *Precio y Acceso* de `curso-crear.html`, permitiendo definir si el programa incluye matrícula, su valor en CLP y si se cobra o es **Matrícula Gratis / Liberada ($0)** (mostrando el valor de referencia tachado como promoción en `escuela.html`, `detalle.html` y `pago.html`, y habilitando el cobro de matrícula por curso vía Flow).

### 🔒 Seguridad & Dependencias (NUEVO)
- [x] Corrección de vulnerabilidades de NPM detectadas por Hostinger (`qs`, `ip-address`).
- [x] Corrección final de vulnerabilidades restantes: actualización manual de `multer` a la versión `2.2.0` y `body-parser` a `2.3.0` (se descartó el PR automático de Hostinger porque eliminaba endpoints críticos del `server.js`).
- [x] Configuración de `overrides` en `package.json` para forzar el uso de versiones seguras en dependencias transitivas.

### 💳 Integración de Pasarela de Pagos y Suscripciones (Flow) (NUEVO)
- [x] **Frontend (`detalle.html`, `pago.html`, `login.html`, `suscripcion.html`):**
  - **Ventana flotante (Modal) en `detalle.html`:** Si el visitante no tiene sesión iniciada al apretar *"Suscribirme Ahora"* o *"Comprar"*, se despliega un modal de **"Paso 1 de 2: Tus datos de alumno"** con el resumen del programa y pestañas para crear cuenta rápida o iniciar sesión sin salir de la página.
  - **Checkout integrado sin rebote en `pago.html` (estilo Hotmart/Udemy):** `pago.html` ya no expulsa al usuario hacia `login.html` si no tiene sesión o si su token expiró; muestra el bloque de registro/login integrado dentro de la misma tarjeta de pago y en un solo clic registra/autentica al alumno y lo redirige a Flow.
  - Corrección del envío y preselección automática de `plan_id` y `curso_id` al pasar de `detalle.html` o `suscripcion.html` a `pago.html` (evitando que se envíe el ID del curso como `plan_id`).
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
