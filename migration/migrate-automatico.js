/**
 * MIGRACIÓN AUTOMÁTICA COMPLETA — Una sola ejecución
 * ────────────────────────────────────────────────────
 * Usa la API pública (sin autenticación) para migrar
 * los datos que ya son accesibles públicamente:
 *   - 15 cursos con título, descripción, precio, imagen
 *   - Estructura básica de módulos (lo que la API pública expone)
 *
 * Para datos que requieren auth (lecciones internas, usuarios,
 * matrículas), usa migrate-cursos.js y migrate-usuarios.sql
 *
 * Uso: node migration/migrate-automatico.js
 * No requiere configuración — usa la API pública de flordechanar.cl
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const WP_BASE = 'https://flordechanar.cl/wp-json';
const DB = {
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port:     process.env.DB_PORT || 3306,
    database: 'flordechanar',
};

// Cursos descubiertos en el relevamiento (sin auth):
const CURSOS_PUBLICOS = [
    { wp_id: 9752, titulo: 'Programa de estudio Terapeuta en Masoterapia Profesional Presencial 2026',  precio: 1840000, lecciones: 3,  imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2025/03/Copia-de-Horario-Escolar-Universidad-Juvenil-1.jpg' },
    { wp_id: 9755, titulo: 'Programa de Reflexología Holística Biomagnetismo y Flores de Bach 2026',     precio: 1340000, lecciones: 4,  imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/02/Copia-de-Curso-de-reiki-nivel-1-4.jpg' },
    { wp_id: 9603, titulo: 'Curso de Terapeuta en Flores de Bach 2025',                                   precio: 495000,  lecciones: 18, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/01/portada_cursocompletodereflexologiapodal-Banner-para-YouTube-1440-x-900-px.jpg' },
    { wp_id: 8710, titulo: 'Masoterapia Profesional 2026 OnLINE',                                         precio: 1240000, lecciones: 15, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/04/4472777.jpg' },
    { wp_id: 9375, titulo: 'Curso de Reflexología Podal: Aprendizaje Paso a Paso ¡A tu Ritmo!',           precio: 225000,  lecciones: 12, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2021/10/imagenvideoclasegratuitarefle.png' },
    { wp_id: 9251, titulo: 'Reflexología Emocional',                                                       precio: 495000,  lecciones: 19, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2020/02/REFLEJOLO.jpg' },
    { wp_id: 9186, titulo: 'Reflexología Metamórfica',                                                     precio: 295000,  lecciones: 6,  imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2018/10/images.jpg' },
    { wp_id: 8967, titulo: 'Programa de estudio Terapeuta en Masoterapia Profesional Presencial 2025',    precio: 1580000, lecciones: 23, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2025/03/Copia-de-Horario-Escolar-Universidad-Juvenil-1.jpg' },
    { wp_id: 9062, titulo: 'Curso de Reflexología Podal: Aprendizaje Paso a Paso',                        precio: 225000,  lecciones: 13, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2021/10/imagenvideoclasegratuitarefle.png' },
    { wp_id: 8588, titulo: 'Curso de Terapeuta en Flores de Bach',                                        precio: 495000,  lecciones: 19, imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/01/portada_cursocompletodereflexologiapodal-Banner-para-YouTube-1440-x-900-px.jpg' },
    { wp_id: 8507, titulo: 'Programa de Terapeuta Emocional Evolutiva',                                   precio: 0,       lecciones: 0,  imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2023/04/2023Presentacion-tee-programadeestudios.jpg' },
    { wp_id: 8013, titulo: 'Curso de Formación para Terapeutas en Árbol Transgeneracional AVANZADO',      precio: 0,       lecciones: 0,  imagen: null },
    { wp_id: 7374, titulo: 'Programa de Reflexología Holística Biomagnetismo y Flores de Bach',            precio: 0,       lecciones: 0,  imagen: 'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/04/Copia-de-Horario-Escolar-Universidad-Juvenil-2.jpg' },
];

/** Intenta obtener descripción del curso via API pública */
async function obtenerDescripcion(wpId) {
    try {
        const res = await fetch(`${WP_BASE}/wp/v2/lp_course/${wpId}`);
        if (!res.ok) return '';
        const data = await res.json();
        // Extraer texto del excerpt
        const excerpt = data.excerpt?.rendered || '';
        return excerpt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    } catch { return ''; }
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  MIGRACIÓN AUTOMÁTICA — API Pública');
    console.log('  flordechanar.cl → BD flordechanar');
    console.log('═══════════════════════════════════════════════\n');

    const pool = await mysql.createPool(DB);
    console.log('✅ Conectado a BD:', DB.database);

    // Obtener o crear el profesor por defecto
    let [[admin]] = await pool.query(
        `SELECT id FROM usuarios WHERE rol IN ('admin','profesor') ORDER BY id LIMIT 1`
    );
    if (!admin) {
        console.error('❌ No hay un usuario admin/profesor en la BD. Crea uno primero desde el panel.');
        await pool.end();
        process.exit(1);
    }
    const profesorId = admin.id;
    console.log(`👤 Usando profesor ID: ${profesorId}\n`);

    let ok = 0;
    for (const curso of CURSOS_PUBLICOS) {
        process.stdout.write(`📖 ${curso.titulo.slice(0, 60)}... `);

        // Obtener descripción si no está
        const descripcion = await obtenerDescripcion(curso.wp_id);

        try {
            const [res] = await pool.query(
                `INSERT INTO cursos (titulo, descripcion, precio, portada_url, estado, profesor_id)
                 VALUES (?, ?, ?, ?, 'publicado', ?)
                 ON DUPLICATE KEY UPDATE
                   descripcion = IF(VALUES(descripcion) != '', VALUES(descripcion), descripcion),
                   precio      = VALUES(precio),
                   portada_url = VALUES(portada_url)`,
                [curso.titulo, descripcion, curso.precio, curso.imagen, profesorId]
            );

            const cursoId = res.insertId || (await pool.query(
                'SELECT id FROM cursos WHERE titulo = ? LIMIT 1', [curso.titulo]
            ).then(([r]) => r[0]?.id));

            // Crear módulo placeholder si no existe ninguno
            const [[modExiste]] = await pool.query(
                'SELECT id FROM modulos WHERE curso_id = ? LIMIT 1', [cursoId]
            );
            if (!modExiste && cursoId) {
                const [mRes] = await pool.query(
                    `INSERT INTO modulos (curso_id, titulo, orden) VALUES (?, 'Contenido del Curso', 0)`,
                    [cursoId]
                );
                const moduloId = mRes.insertId;

                // Crear lecciones placeholder numeradas
                for (let i = 0; i < (curso.lecciones || 0); i++) {
                    await pool.query(
                        `INSERT INTO lecciones (modulo_id, titulo, tipo, orden, visibilidad)
                         VALUES (?, ?, 'video', ?, 'privada')`,
                        [moduloId, `Lección ${i + 1}`, i]
                    );
                }
            }

            console.log(`✓ [${cursoId}] $${curso.precio.toLocaleString('es-CL')}`);
            ok++;
        } catch (e) {
            console.log(`❌ ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 300));
    }

    // Verificación final
    const [[stats]] = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM cursos)   AS cursos,
            (SELECT COUNT(*) FROM modulos)  AS modulos,
            (SELECT COUNT(*) FROM lecciones) AS lecciones
    `);

    console.log('\n═══════════════════════════════════════════════');
    console.log(`  ✅ ${ok}/${CURSOS_PUBLICOS.length} cursos migrados`);
    console.log(`  BD: ${stats.cursos} cursos · ${stats.modulos} módulos · ${stats.lecciones} lecciones`);
    console.log('\n  ⚠ Próximos pasos:');
    console.log('  1. Agrega WP_USER y WP_APP_PASS al .env');
    console.log('  2. Corre migrate-cursos.js para traer lecciones reales');
    console.log('  3. Usa migrate-usuarios.sql para migrar estudiantes');
    console.log('  4. Edita las lecciones desde Panel Admin → Cursos');
    console.log('═══════════════════════════════════════════════\n');

    await pool.end();
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
