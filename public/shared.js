/* shared.js — utilidades comunes del LMS */

function showToast(msg, icon) {
    const t = document.getElementById('toast');
    if (!t) return;
    const mi = document.getElementById('tI');
    const mm = document.getElementById('tM');
    if (mm) mm.textContent = msg;
    if (mi) mi.className = 'ph ' + (icon || 'ph-check-circle');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
}

// alias usado en algunas páginas
const showT = showToast;

function getToken() {
    const t = localStorage.getItem('token');
    if (!t) { location.href = '/login.html'; return null; }
    return t;
}

function decodeToken() {
    const t = localStorage.getItem('token');
    if (!t) return null;
    try { return JSON.parse(atob(t.split('.')[1])); } catch(e) { return null; }
}

// Rellena avatar y nombre en el sidebar a partir del JWT
function initSidebarUser(avId, unId, urId, expectedRol) {
    const token = getToken();
    if (!token) return;
    const p = decodeToken();
    if (!p) { location.href = '/login.html'; return; }
    if (expectedRol && p.rol !== expectedRol && !(expectedRol === 'profesor' && p.rol === 'admin')) {
        location.href = '/dashboard.html';
        return;
    }
    const av = document.getElementById(avId);
    const un = document.getElementById(unId);
    const ur = document.getElementById(urId);
    if (av) av.textContent = (p.nombre || '?')[0].toUpperCase();
    if (un) un.textContent = p.nombre || '';
    if (ur && p.rol) ur.textContent = p.rol.charAt(0).toUpperCase() + p.rol.slice(1);
}

// Formatea fecha en español (Chile)
function fmtDate(dt, opts) {
    if (!dt) return '–';
    return new Date(dt).toLocaleDateString('es-CL', opts || { day:'numeric', month:'short', year:'numeric' });
}

// Nota chilena: escala 1–7
function calcNota(obtenido, total) {
    if (!total || total === 0) return null;
    return Math.round(((obtenido / total) * 6 + 1) * 10) / 10;
}

// ── Nav móvil automática ──────────────────────────────────
// Se inyecta en todas las páginas que tienen sidebar (.sb o .sidebar)
document.addEventListener('DOMContentLoaded', () => {
    const sb = document.querySelector('.sb, aside.sidebar');
    if (!sb) return;

    // ── Header móvil ────────────────────────────────────
    const mhd = document.createElement('div');
    mhd.className = 'mhd';
    mhd.innerHTML = `
        <button class="mhd-btn" id="mhdMenu" aria-label="Abrir menú">
            <i class="ph ph-list"></i>
        </button>
        <span class="mhd-title">Flor de Chañar</span>
        <a href="configuracion.html" class="mhd-btn" aria-label="Configuración">
            <i class="ph ph-user-circle"></i>
        </a>`;
    document.body.prepend(mhd);

    // ── Overlay ─────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'sb-overlay';
    document.body.appendChild(overlay);

    const openSb  = () => { sb.classList.add('mob-open');    overlay.classList.add('mob-open'); };
    const closeSb = () => { sb.classList.remove('mob-open'); overlay.classList.remove('mob-open'); };

    document.getElementById('mhdMenu').addEventListener('click', openSb);
    overlay.addEventListener('click', closeSb);
    sb.querySelectorAll('a[href]').forEach(a => a.addEventListener('click', closeSb));

    // ── Bottom nav (solo páginas de estudiante) ──────────
    const page = location.pathname.split('/').pop() || 'dashboard.html';
    const studentPages = ['dashboard','escuela','clase-vivo','materiales','foro','ranking','evaluacion','curso','configuracion','suscripcion','pago'];
    const isStudentPage = studentPages.some(p => page.startsWith(p));
    const isAdminPage   = ['admin','profesor','curso-crear','eval-crear','eval-revisar'].some(p => page.startsWith(p));

    if (isStudentPage && !isAdminPage) {
        const bnav = document.createElement('nav');
        bnav.className = 'mob-bnav';
        const items = [
            { href:'dashboard.html',  icon:'ph-house',         label:'Mi Aula' },
            { href:'escuela.html',    icon:'ph-books',          label:'Catálogo' },
            { href:'clase-vivo.html', icon:'ph-video-camera',   label:'Clases' },
            { href:'foro.html',       icon:'ph-chats-circle',   label:'Foro' },
            { href:'configuracion.html', icon:'ph-user-circle', label:'Cuenta' },
        ];
        bnav.innerHTML = items.map(item => {
            const active = page === item.href;
            return `<a href="${item.href}" class="${active ? 'active' : ''}">
                <i class="ph ${item.icon}"></i>
                <span>${item.label}</span>
            </a>`;
        }).join('');
        document.body.appendChild(bnav);
    }
});
