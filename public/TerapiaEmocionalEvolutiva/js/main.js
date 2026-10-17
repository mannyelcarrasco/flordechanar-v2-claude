// T.E.E. — interacciones de la landing
document.addEventListener('DOMContentLoaded', () => {
  // Menú móvil
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav__toggle');
  toggle?.addEventListener('click', () => {
    const abierto = nav.classList.toggle('is-abierto');
    toggle.setAttribute('aria-expanded', abierto);
  });
  nav?.querySelectorAll('.nav__links a').forEach(a =>
    a.addEventListener('click', () => {
      nav.classList.remove('is-abierto');
      toggle?.setAttribute('aria-expanded', 'false');
    })
  );

  // Checks de audiencia
  document.querySelectorAll('.check').forEach(btn =>
    btn.addEventListener('click', () => {
      const activo = btn.classList.toggle('is-activo');
      btn.setAttribute('aria-pressed', activo);
    })
  );

  // Acordeón FAQ (una pregunta abierta a la vez)
  const items = document.querySelectorAll('.faq__item');
  items.forEach(item => {
    const btn = item.querySelector('.faq__pregunta');
    btn.addEventListener('click', () => {
      const abrir = !item.classList.contains('is-abierto');
      items.forEach(i => {
        i.classList.remove('is-abierto');
        i.querySelector('.faq__pregunta').setAttribute('aria-expanded', 'false');
      });
      if (abrir) {
        item.classList.add('is-abierto');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Animación al hacer scroll
  const revelar = document.querySelectorAll('.revelar');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    revelar.forEach(el => io.observe(el));
  } else {
    revelar.forEach(el => el.classList.add('is-visible'));
  }

  // Año actual en el footer
  const anio = document.getElementById('anio');
  if (anio) anio.textContent = new Date().getFullYear();
});
