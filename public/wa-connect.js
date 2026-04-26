/* wa-connect.js
   Conecta todos los botones de WhatsApp de las páginas públicas
   al número configurado por el admin (guardado en la BD, servido via API).
   Se incluye en: index.html, escuela.html, terapias.html
*/
(function () {
    function aplicarNumero(num, msgGlobal) {
        if (!num) return;

        const links = document.querySelectorAll('a[href*="wa.me"]');
        links.forEach(function (a) {
            let texto = msgGlobal || '';
            try {
                const url = new URL(a.href);
                const textParam = url.searchParams.get('text') || '';
                // Preservar mensajes específicos de ubicación (ej: "quiero agendar en Calama")
                // Solo reemplazar el mensaje si era el genérico por defecto
                const genericos = [
                    'Hola Flor de Chañar, me gustaría obtener más información',
                    'Hola, me interesa información sobre los cursos de Flor de Chañar',
                    ''
                ];
                if (textParam && !genericos.includes(textParam)) {
                    texto = textParam; // conservar mensaje específico del botón
                }
            } catch (e) { /* ignorar */ }

            a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
        });

        // Sincronizar también en localStorage para que la página interna
        // (shared.js floating button) lo use sin hacer otra petición
        localStorage.setItem('wa_numero', num);
        if (msgGlobal) localStorage.setItem('wa_mensaje', msgGlobal);
    }

    function cargarConfig() {
        fetch('/api/config/publica')
            .then(function (r) { return r.json(); })
            .then(function (cfg) {
                if (cfg.wa_activo === '0') return; // desactivado desde admin
                aplicarNumero(cfg.wa_numero, cfg.wa_mensaje);
            })
            .catch(function () {
                // Fallback a localStorage si la API falla (ej: sin conexión)
                const num = localStorage.getItem('wa_numero');
                const msg = localStorage.getItem('wa_mensaje') || '';
                aplicarNumero(num, msg);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cargarConfig);
    } else {
        cargarConfig();
    }
})();
