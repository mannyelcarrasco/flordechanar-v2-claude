/**
 * EXTRACTOR DE PÁGINAS: WordPress → Landing Pages HTML
 * ──────────────────────────────────────────────────────
 * Qué hace:
 *   1. Trae todas las páginas publicadas del WP via REST API
 *   2. Trae los cursos con toda su info (título, precio, imagen, descripción)
 *   3. Genera archivos HTML individuales para cada curso (landing pages)
 *      ya con el diseño de Flor de Chañar v2 aplicado
 *   4. Guarda un JSON con todo el contenido para revisión
 *
 * Uso:
 *   Llenar WP_USER y WP_APP_PASS en .env (mismo que migrate-cursos.js)
 *   node migration/migrate-paginas.js
 *   → Archivos generados en: migration/output/
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
require('dotenv').config();

const WP = {
    base:    'https://flordechanar.cl/wp-json',
    usuario: process.env.WP_USER     || 'TU_USUARIO_WP',
    appPass: process.env.WP_APP_PASS || 'xxxx xxxx xxxx xxxx',
};

const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const authHeader = () => ({
    'Authorization': 'Basic ' + Buffer.from(`${WP.usuario}:${WP.appPass}`).toString('base64'),
});

async function wpGet(path) {
    const res = await fetch(`${WP.base}${path}`, { headers: authHeader() });
    if (!res.ok) throw new Error(`${res.status} en ${path}`);
    return res.json();
}

/** Limpia el HTML de Elementor/WP dejando contenido semántico */
function limpiarContenido(html = '') {
    const $ = cheerio.load(html);
    // Quitar bloques de Elementor vacíos y scripts
    $('script, style, [class*="elementor-empty"], .lp-course-progress').remove();
    // Limpiar atributos de Elementor pero conservar estructura
    $('[class*="elementor"]').each((_, el) => {
        const $el = $(el);
        const clsLimpia = ($el.attr('class') || '')
            .split(' ')
            .filter(c => !c.startsWith('elementor') && !c.startsWith('e-'))
            .join(' ');
        $el.attr('class', clsLimpia || null);
    });
    // Convertir shortcodes de LearnPress
    return $.html()
        .replace(/\[\/?\w+[^\]]*\]/g, '') // quitar shortcodes
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Formatea precio en pesos chilenos */
function formatPrecio(valor) {
    const num = parseInt(String(valor || 0).replace(/[^0-9]/g, ''));
    return num > 0 ? `$${num.toLocaleString('es-CL')}` : 'Consultar precio';
}

// ──────────────────────────────────────────────────────
//  Generar landing page HTML para un curso
// ──────────────────────────────────────────────────────
function generarLandingCurso(curso) {
    const precio    = formatPrecio(curso.price);
    const imagen    = curso.image || curso.thumbnail || '';
    const titulo    = curso.name  || 'Curso';
    const extracto  = curso.excerpt || '';
    const nLecciones = curso.count_items || curso.lesson_count || 0;
    const instructor = curso.instructor?.name || 'Escuela Flor de Chañar';

    // Secciones del curriculum
    const secciones = (curso.sections || curso.curriculum || [])
        .map((sec, i) => {
            const items = (sec.lessons || sec.items || [])
                .map(l => `<li><i class="ph ph-play-circle"></i> ${l.title || l.name}</li>`)
                .join('');
            return `
            <div class="curriculum-section">
                <div class="curriculum-header">
                    <span class="sec-num">${i + 1}</span>
                    <strong>${sec.title || sec.name}</strong>
                    <span class="sec-count">${(sec.lessons || sec.items || []).length} lecciones</span>
                </div>
                <ul class="curriculum-items">${items}</ul>
            </div>`;
        }).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titulo} | Flor de Chañar</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <link rel="stylesheet" href="../public/shared.css">
    <style>
        /* ── Layout ── */
        body { background: var(--bg); }
        .lp-nav { background: var(--secondary); padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; }
        .lp-nav a { color: rgba(255,255,255,.7); font-size: .9rem; }
        .lp-nav a.logo { color: #fff; font-family: var(--serif); font-size: 1.1rem; font-weight: 700; }
        .lp-hero { background: linear-gradient(135deg, var(--secondary) 60%, var(--primary-d)); padding: 4rem 2rem 3rem; color: #fff; }
        .lp-hero-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 360px; gap: 3rem; align-items: start; }
        .lp-tag { display: inline-block; background: var(--primary); color: #fff; font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: .3rem .8rem; border-radius: 99px; margin-bottom: 1rem; }
        .lp-hero h1 { font-family: var(--serif); font-size: 2.4rem; line-height: 1.2; margin-bottom: 1rem; }
        .lp-hero p { color: rgba(255,255,255,.75); font-size: 1rem; line-height: 1.7; }
        .lp-meta { display: flex; gap: 1.5rem; margin-top: 1.5rem; flex-wrap: wrap; }
        .lp-meta span { display: flex; align-items: center; gap: .4rem; font-size: .87rem; color: rgba(255,255,255,.7); }

        /* Card lateral */
        .curso-card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,.2); position: sticky; top: 1.5rem; }
        .curso-card img { width: 100%; height: 200px; object-fit: cover; }
        .curso-card-body { padding: 1.5rem; }
        .precio { font-size: 2rem; font-weight: 700; color: var(--secondary); }
        .btn-inscribir { display: block; background: var(--primary); color: #fff; text-align: center; padding: .9rem; border-radius: 10px; font-weight: 700; font-size: 1rem; margin: 1rem 0 .75rem; transition: all .2s; }
        .btn-inscribir:hover { background: var(--primary-d); transform: translateY(-1px); }
        .btn-wa { display: block; background: #25D366; color: #fff; text-align: center; padding: .75rem; border-radius: 10px; font-weight: 600; font-size: .9rem; }
        .card-info { margin-top: 1rem; }
        .card-info-row { display: flex; align-items: center; gap: .6rem; font-size: .83rem; color: var(--light); padding: .4rem 0; border-bottom: 1px solid #F1F5F9; }
        .card-info-row:last-child { border: none; }
        .card-info-row i { color: var(--primary); font-size: 1rem; }

        /* Contenido */
        .lp-body { max-width: 1100px; margin: 3rem auto; padding: 0 2rem; display: grid; grid-template-columns: 1fr 360px; gap: 3rem; align-items: start; }
        .lp-section { background: #fff; border-radius: 14px; padding: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,.04); margin-bottom: 1.5rem; }
        .lp-section h2 { font-family: var(--serif); font-size: 1.4rem; color: var(--secondary); margin-bottom: 1.25rem; display: flex; align-items: center; gap: .6rem; }
        .beneficios-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .beneficio { display: flex; gap: .75rem; align-items: flex-start; }
        .beneficio i { color: var(--primary); font-size: 1.2rem; margin-top: .1rem; flex-shrink: 0; }
        .beneficio p { font-size: .88rem; color: var(--light); line-height: 1.6; }

        /* Curriculum */
        .curriculum-section { border: 1px solid #E5E7EB; border-radius: 10px; margin-bottom: .75rem; overflow: hidden; }
        .curriculum-header { background: #F9FAFB; padding: .85rem 1.1rem; display: flex; align-items: center; gap: .75rem; }
        .sec-num { width: 26px; height: 26px; border-radius: 50%; background: var(--primary); color: #fff; font-size: .75rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sec-count { margin-left: auto; font-size: .75rem; color: var(--light); }
        .curriculum-items { list-style: none; padding: 0; border-top: 1px solid #E5E7EB; }
        .curriculum-items li { display: flex; align-items: center; gap: .6rem; padding: .6rem 1.1rem; font-size: .85rem; color: var(--light); border-bottom: 1px solid #F3F4F6; }
        .curriculum-items li:last-child { border: none; }
        .curriculum-items i { color: var(--primary); font-size: .9rem; }

        /* Instructor */
        .instructor-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; background: var(--bg-alt); border-radius: 10px; }
        .instructor-av { width: 56px; height: 56px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 700; color: #fff; flex-shrink: 0; }
        .instructor-info strong { display: block; color: var(--secondary); font-size: .95rem; }
        .instructor-info span { font-size: .82rem; color: var(--light); }

        @media (max-width: 900px) {
            .lp-hero-inner, .lp-body { grid-template-columns: 1fr; }
            .lp-hero h1 { font-size: 1.8rem; }
            .curso-card { position: static; }
            .beneficios-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>

<!-- Nav -->
<nav class="lp-nav">
    <a href="index.html" class="logo"><img src="../public/logo.png" style="height:22px;border-radius:50%;margin-right:6px;vertical-align:middle;object-fit:cover"> Flor de Chañar</a>
    <div style="display:flex;gap:1.5rem">
        <a href="escuela.html">← Todos los cursos</a>
        <a href="dashboard.html" style="color:var(--primary-light, #a3b899)">Acceder al Aula →</a>
    </div>
</nav>

<!-- Hero -->
<section class="lp-hero">
    <div class="lp-hero-inner">
        <div>
            <span class="lp-tag">Escuela Flor de Chañar</span>
            <h1>${titulo}</h1>
            <p>${extracto}</p>
            <div class="lp-meta">
                <span><i class="ph ph-play-circle"></i> ${nLecciones} lecciones</span>
                <span><i class="ph ph-user"></i> ${instructor}</span>
                <span><i class="ph ph-certificate"></i> Certificación incluida</span>
                <span><i class="ph ph-infinity"></i> Acceso de por vida</span>
            </div>
        </div>

        <!-- Card lateral -->
        <div class="curso-card">
            ${imagen ? `<img src="${imagen}" alt="${titulo}">` : ''}
            <div class="curso-card-body">
                <div class="precio">${precio}</div>
                <a href="login.html" class="btn-inscribir"><i class="ph ph-student"></i> Inscribirme ahora</a>
                <a href="https://wa.me/56XXXXXXXXX" class="btn-wa" target="_blank" rel="noopener">
                    <i class="ph ph-whatsapp-logo"></i> Consultar por WhatsApp
                </a>
                <div class="card-info">
                    <div class="card-info-row"><i class="ph ph-play-circle"></i> ${nLecciones} lecciones en video</div>
                    <div class="card-info-row"><i class="ph ph-infinity"></i> Acceso de por vida</div>
                    <div class="card-info-row"><i class="ph ph-device-mobile"></i> Plataforma 24/7</div>
                    <div class="card-info-row"><i class="ph ph-certificate"></i> Certificado al completar</div>
                    <div class="card-info-row"><i class="ph ph-whatsapp-logo"></i> Grupo de apoyo WhatsApp</div>
                </div>
            </div>
        </div>
    </div>
</section>

<!-- Cuerpo -->
<div class="lp-body">
    <div>
        <!-- Descripción completa -->
        <div class="lp-section">
            <h2><i class="ph ph-info" style="color:var(--primary)"></i> Sobre este curso</h2>
            <div style="color:var(--light);line-height:1.8;font-size:.93rem">
                ${limpiarContenido(curso.content || curso.description || '<p>' + extracto + '</p>')}
            </div>
        </div>

        <!-- Lo que aprenderás -->
        <div class="lp-section">
            <h2><i class="ph ph-star" style="color:var(--primary)"></i> Lo que aprenderás</h2>
            <div class="beneficios-grid">
                <div class="beneficio"><i class="ph ph-check-circle"></i><p>Técnicas profesionales paso a paso con videos explicativos</p></div>
                <div class="beneficio"><i class="ph ph-check-circle"></i><p>Acceso a clases grabadas y materiales descargables</p></div>
                <div class="beneficio"><i class="ph ph-check-circle"></i><p>Retroalimentación directa con el equipo docente</p></div>
                <div class="beneficio"><i class="ph ph-check-circle"></i><p>Certificación válida para ejercer como terapeuta</p></div>
            </div>
        </div>

        <!-- Curriculum -->
        ${secciones ? `
        <div class="lp-section">
            <h2><i class="ph ph-list-bullets" style="color:var(--primary)"></i> Contenido del curso</h2>
            ${secciones}
        </div>` : ''}

        <!-- Instructor -->
        <div class="lp-section">
            <h2><i class="ph ph-user-circle" style="color:var(--primary)"></i> Tu instructor</h2>
            <div class="instructor-card">
                <div class="instructor-av">${instructor[0]?.toUpperCase() || 'F'}</div>
                <div class="instructor-info">
                    <strong>${instructor}</strong>
                    <span>Terapeuta certificado · Escuela Flor de Chañar</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Columna derecha vacía (sticky card ya está en hero en mobile) -->
    <div></div>
</div>

<script src="../public/shared.js"></script>
<script>
    // Conectar número WhatsApp desde configuración
    fetch('/api/config/publica').then(r=>r.json()).then(cfg=>{
        if (cfg.wa_numero) {
            document.querySelectorAll('a[href*="wa.me"]').forEach(a=>{
                a.href = 'https://wa.me/' + cfg.wa_numero.replace(/[^0-9]/g,'') + '?text=' + encodeURIComponent('Hola, quiero información sobre: ${titulo}');
            });
        }
    }).catch(()=>{});
</script>
</body>
</html>`;
}

// ──────────────────────────────────────────────────────
//  MAIN
// ──────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  EXTRACTOR DE PÁGINAS WordPress → Landing Pages');
    console.log('═══════════════════════════════════════════════\n');

    // 1. Traer todos los cursos con detalle
    console.log('📚 Descargando cursos desde LearnPress...');
    let cursos = [];
    let page = 1;
    while (true) {
        const data = await wpGet(`/lp/v1/courses?per_page=20&page=${page}`);
        const items = Array.isArray(data) ? data : (data.data || data.items || []);
        if (!items.length) break;
        cursos = cursos.concat(items);
        page++;
        if (items.length < 20) break;
    }
    console.log(`  ✅ ${cursos.length} cursos encontrados`);

    // 2. Detalle completo de cada curso
    const cursosDetalle = [];
    for (const c of cursos) {
        try {
            process.stdout.write(`  → ${c.name}... `);
            const detalle = await wpGet(`/lp/v1/courses/${c.id}`);
            cursosDetalle.push(detalle);
            console.log('✓');
        } catch (e) {
            cursosDetalle.push(c); // usar datos básicos si falla el detalle
            console.log('⚠ (datos parciales)');
        }
        await new Promise(r => setTimeout(r, 400));
    }

    // 3. Guardar JSON de respaldo
    const jsonPath = path.join(OUTPUT_DIR, 'cursos-wp.json');
    fs.writeFileSync(jsonPath, JSON.stringify(cursosDetalle, null, 2), 'utf8');
    console.log(`\n💾 JSON guardado en: ${jsonPath}`);

    // 4. Traer páginas WP
    console.log('\n📄 Descargando páginas de WordPress...');
    let paginas = [];
    try {
        paginas = await wpGet('/wp/v2/pages?per_page=50&status=publish&_embed');
    } catch (e) {
        console.warn('  ⚠ No se pudieron obtener páginas:', e.message);
    }
    if (paginas.length) {
        const paginasJson = path.join(OUTPUT_DIR, 'paginas-wp.json');
        fs.writeFileSync(paginasJson, JSON.stringify(paginas, null, 2), 'utf8');
        console.log(`  ✅ ${paginas.length} páginas guardadas en: ${paginasJson}`);
    }

    // 5. Generar landing pages HTML
    console.log('\n🎨 Generando landing pages HTML...');
    for (const curso of cursosDetalle) {
        const slug     = (curso.slug || curso.name || 'curso').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const html     = generarLandingCurso(curso);
        const filePath = path.join(OUTPUT_DIR, `landing-${slug}.html`);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log(`  ✓ ${filePath}`);
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(`  ✅ Listo. Archivos en: migration/output/`);
    console.log('     - cursos-wp.json        → todos los datos de cursos');
    console.log('     - paginas-wp.json        → páginas WP exportadas');
    console.log('     - landing-*.html         → landing pages generadas');
    console.log('  Revisa y mueve los landing a public/ cuando estén listos.');
    console.log('═══════════════════════════════════════════════\n');
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
