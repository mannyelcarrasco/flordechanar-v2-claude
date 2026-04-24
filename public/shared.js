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
