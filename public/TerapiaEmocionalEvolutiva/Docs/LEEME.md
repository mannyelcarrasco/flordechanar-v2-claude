# Landing T.E.E. — cómo subirla

Estructura:
```
sitio-web/
├── index.html          ← contenido y textos
├── css/styles.css      ← todos los estilos (colores y fuentes en :root, arriba)
├── js/main.js          ← menú móvil, acordeón FAQ, checks, animaciones
└── assets/img/         ← imágenes (reemplázalas manteniendo el nombre)
```

Subir: copia el contenido de `sitio-web/` a la raíz de tu hosting (public_html, Netlify, Vercel, etc.). No requiere instalación ni compilación.

Pendientes antes de publicar:
- Busca `CAMBIAR ENLACE DE INSCRIPCIÓN AQUÍ` en index.html y pon tu URL real (formulario, WhatsApp, pago).
- Si tienes la malla en PDF, guárdala en `assets/docs/` y cambia el enlace del botón de descarga.
- Las imágenes pesan bastante; conviene comprimirlas (p. ej. squoosh.app, formato WebP) para que cargue más rápido.
