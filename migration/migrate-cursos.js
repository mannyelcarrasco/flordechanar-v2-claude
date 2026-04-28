/**
 * MIGRACIÓN: WordPress/LearnPress → Flor de Chañar v2
 * ─────────────────────────────────────────────────────
 * Qué hace:
 *   1. Autentica con WordPress vía Application Password
 *   2. Trae los 15 cursos de LearnPress con sus secciones y lecciones
 *   3. Extrae URLs de video de YouTube/Vimeo del contenido
 *   4. Inserta todo en la nueva BD: cursos → modulos → lecciones
 *
 * Antes de correr:
 *   1. En WP Admin → Usuarios → Tu perfil → "Contraseñas de aplicación"
 *      → Crear nueva → copiar la contraseña generada (ej: "AbCd EfGh IjKl MnOp")
 *   2. Llenar las variables de entorno abajo (sección CONFIGURACIÓN)
 *   3. npm install node-fetch mysql2 cheerio   (si no están)
 *   4. node migration/migrate-cursos.js
 */

const mysql  = require('mysql2/promise');
const cheerio = require('cheerio');
require('dotenv').config();

// ══════════════════════════════════════════════════════
//  CONFIGURACIÓN — ajusta estos valores
// ══════════════════════════════════════════════════════
const WP = {
    base:     'https://flordechanar.cl/wp-json',
    usuario:  process.env.WP_USER  || 'TU_USUARIO_WP',       // usuario de WP admin
    appPass:  process.env.WP_APP_PASS || 'xxxx xxxx xxxx xxxx xxxx xxxx', // Application Password
};

const DB = {
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port:     process.env.DB_PORT || 3306,
    database: 'flordechanar',
};

// ID del profesor/admin en la nueva BD que será asignado como responsable
const PROFESOR_ID_DEFAULT = 1;

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
const authHeader = () => ({
    'Authorization': 'Basic ' + Buffer.from(`${WP.usuario}:${WP.appPass}`).toString('base64'),
    'Content-Type': 'application/json',
});

async function wpGet(path) {
    const res = await fetch(`${WP.base}${path}`, { headers: authHeader() });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`WP API ${path} → ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
}

/** Extrae URL de YouTube o Vimeo del HTML de una lección */
function extraerVideoUrl(html = '') {
    if (!html) return null;
    const $ = cheerio.load(html);

    // iframe embed (YouTube/Vimeo)
    const src = $('iframe').attr('src') || '';
    if (src.includes('youtube') || src.includes('youtu.be') || src.includes('vimeo')) return src;

    // link de youtube en el texto
    const ytMatch = html.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (ytMatch) return `https://www.youtube.com/watch?v=${ytMatch[1]}`;

    // link de vimeo en el texto
    const vMatch = html.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/);
    if (vMatch) return `https://vimeo.com/${vMatch[1]}`;

    return null;
}

/** Limpia HTML de Elementor/WordPress dejando texto legible */
function limpiarHtml(html = '') {
    if (!html) return '';
    const $ = cheerio.load(html);
    // Quitar scripts, estilos, shortcodes de LP
    $('script, style, .lp-course-progress, .learn-press-message').remove();
    return $.text().replace(/\s+/g, ' ').trim().slice(0, 2000);
}

/** Pausa entre requests para no saturar el servidor WP */
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════
//  PASO 1 — Traer lista de cursos (lp/v1)
// ══════════════════════════════════════════════════════
async function traerCursosLP() {
    console.log('\n📚 Obteniendo lista de cursos desde LearnPress API...');
    let cursos = [];
    let page = 1;
    while (true) {
        const data = await wpGet(`/lp/v1/courses?per_page=20&page=${page}`);
        // lp/v1 devuelve { data: [...], total: N } o directamente el array
        const items = Array.isArray(data) ? data : (data.data || data.items || []);
        if (!items.length) break;
        cursos = cursos.concat(items);
        console.log(`  Página ${page}: ${items.length} cursos`);
        if (items.length < 20) break;
        page++;
        await sleep(500);
    }
    console.log(`  ✅ Total: ${cursos.length} cursos encontrados`);
    return cursos;
}

// ══════════════════════════════════════════════════════
//  PASO 2 — Traer detalle de cada curso (secciones + lecciones)
// ══════════════════════════════════════════════════════
async function traerDetalleCurso(cursoId) {
    // Intentar endpoint lp/v1 primero
    try {
        const data = await wpGet(`/lp/v1/courses/${cursoId}`);
        return data;
    } catch (e) {
        // Fallback a wp/v2 CPT
        const data = await wpGet(`/wp/v2/lp_course/${cursoId}?_embed`);
        return {
            id:          data.id,
            name:        data.title?.rendered || '',
            description: data.content?.rendered || '',
            price:       0,
            image:       data._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
            sections:    [],
        };
    }
}

// ══════════════════════════════════════════════════════
//  PASO 3 — Traer contenido de lección individual
// ══════════════════════════════════════════════════════
async function traerLeccion(leccionId) {
    try {
        const data = await wpGet(`/lp/v1/lessons/${leccionId}`);
        return data;
    } catch {
        try {
            const data = await wpGet(`/wp/v2/lp_lesson/${leccionId}`);
            return {
                id:          data.id,
                title:       data.title?.rendered || '',
                content:     data.content?.rendered || '',
                duration:    '',
            };
        } catch { return null; }
    }
}

// ══════════════════════════════════════════════════════
//  PASO 4 — Insertar en nueva BD
// ══════════════════════════════════════════════════════
async function migrarCurso(pool, cursoWP, profesorId) {
    const titulo      = cursoWP.name || cursoWP.title?.rendered || 'Sin título';
    const descripcion = limpiarHtml(cursoWP.description || cursoWP.content?.rendered || '');
    const precio      = parseInt(String(cursoWP.price || 0).replace(/[^0-9]/g, '')) || 0;
    const portada     = cursoWP.image || cursoWP.thumbnail || null;
    const estado      = 'publicado';

    const [res] = await pool.query(
        `INSERT INTO cursos (titulo, descripcion, precio, portada_url, estado, profesor_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           descripcion = VALUES(descripcion),
           precio      = VALUES(precio),
           portada_url = VALUES(portada_url),
           estado      = VALUES(estado)`,
        [titulo, descripcion, precio, portada, estado, profesorId]
    );

    const cursoId = res.insertId || res.insertId;

    // Obtener el id real si fue ON DUPLICATE
    let nuevoCursoId = cursoId;
    if (!cursoId) {
        const [[row]] = await pool.query('SELECT id FROM cursos WHERE titulo = ? LIMIT 1', [titulo]);
        nuevoCursoId = row?.id;
    }

    console.log(`  💾 Curso insertado: [${nuevoCursoId}] ${titulo} — $${precio.toLocaleString('es-CL')}`);
    return nuevoCursoId;
}

async function migrarSeccion(pool, cursoId, seccion, orden) {
    const titulo = seccion.title || seccion.name || `Módulo ${orden + 1}`;
    const [res] = await pool.query(
        `INSERT INTO modulos (curso_id, titulo, orden)
         VALUES (?, ?, ?)`,
        [cursoId, titulo, orden]
    );
    return res.insertId;
}

async function migrarLeccion(pool, moduloId, leccion, orden) {
    // Extraer video URL del contenido si existe
    const contenidoHtml = leccion.content || leccion.description || '';
    const videoUrl      = extraerVideoUrl(contenidoHtml);
    const descripcion   = limpiarHtml(contenidoHtml);
    const titulo        = leccion.title || leccion.name || `Lección ${orden + 1}`;
    const duracion      = leccion.duration || '';

    // Determinar tipo
    let tipo = 'video';
    if (leccion.type === 'lp_quiz') tipo = 'quiz';
    else if (!videoUrl && descripcion) tipo = 'texto';

    await pool.query(
        `INSERT INTO lecciones (modulo_id, titulo, descripcion, video_url, tipo, duracion, orden, visibilidad)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'privada')`,
        [moduloId, titulo, descripcion, videoUrl, tipo, duracion, orden]
    );
}

// ══════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  MIGRACIÓN WordPress/LearnPress → Flor de Chañar v2');
    console.log('═══════════════════════════════════════════════');

    // Verificar configuración
    if (WP.appPass.includes('xxxx')) {
        console.error('\n❌ Configura WP_USER y WP_APP_PASS en el archivo .env antes de continuar.');
        console.error('   Ver instrucciones al inicio del archivo.\n');
        process.exit(1);
    }

    const pool = await mysql.createPool(DB);
    console.log('\n✅ Conectado a la BD:', DB.database);

    try {
        // 1. Traer lista de cursos
        const cursosLP = await traerCursosLP();
        let cursosOk = 0, cursosError = 0;

        for (const cursoResumen of cursosLP) {
            console.log(`\n📖 Procesando: ${cursoResumen.name || cursoResumen.title}`);

            try {
                // 2. Detalle completo del curso
                const cursoDetalle = await traerDetalleCurso(cursoResumen.id);
                await sleep(400);

                // 3. Insertar curso
                const nuevoCursoId = await migrarCurso(pool, cursoDetalle, PROFESOR_ID_DEFAULT);

                // 4. Procesar secciones y lecciones
                const secciones = cursoDetalle.sections || cursoDetalle.curriculum || [];

                if (secciones.length === 0) {
                    // Sin secciones: crear un módulo genérico
                    const [res] = await pool.query(
                        `INSERT INTO modulos (curso_id, titulo, orden) VALUES (?, 'Contenido del Curso', 0)`,
                        [nuevoCursoId]
                    );
                    console.log(`    → Módulo genérico creado (sin secciones en API)`);
                } else {
                    for (let si = 0; si < secciones.length; si++) {
                        const seccion  = secciones[si];
                        const moduloId = await migrarSeccion(pool, nuevoCursoId, seccion, si);
                        const items    = seccion.lessons || seccion.items || [];

                        console.log(`    📂 [${si + 1}] ${seccion.title || 'Sección'} — ${items.length} lecciones`);

                        for (let li = 0; li < items.length; li++) {
                            const item = items[li];
                            // Traer contenido completo de cada lección
                            let leccionData = item;
                            if (!item.content && item.id) {
                                leccionData = await traerLeccion(item.id) || item;
                                await sleep(300);
                            }
                            await migrarLeccion(pool, moduloId, leccionData, li);
                            process.stdout.write(`      ✓ ${leccionData.title || item.title}\n`);
                        }
                    }
                }

                cursosOk++;
            } catch (err) {
                console.error(`  ❌ Error en curso ${cursoResumen.id}: ${err.message}`);
                cursosError++;
            }

            await sleep(600); // pausa entre cursos
        }

        console.log('\n═══════════════════════════════════════════════');
        console.log(`  ✅ Migración de cursos completada`);
        console.log(`  Cursos migrados: ${cursosOk}`);
        console.log(`  Cursos con error: ${cursosError}`);
        console.log('═══════════════════════════════════════════════\n');

    } finally {
        await pool.end();
    }
}

main().catch(err => {
    console.error('\n💥 Error fatal:', err.message);
    process.exit(1);
});
