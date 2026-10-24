// =========================================================
// Método Mushuu · Academia de Masajes (Flor de Chañar)
// Conexión con FunnelStudio + AtendIA (Bot WhatsApp ID=8)
// =========================================================

(function () {
  'use strict';

  // Configuración de integración
  const CONFIG = {
    funnelStudioEndpoint: 'https://funnelstudio.click/api/submit-form.php',
    funnelId: 'id-p925j171',
    funnelTitle: 'masocalama',
    companyId: '8', // ID de empresa / Bot WhatsApp en AtendIA
    adminEmail: 'flordechanar+maso@gmail.com',
    whatsappDefault: '56984281226' // Número del Bot WhatsApp ID=8
  };

  let whatsappNumber = CONFIG.whatsappDefault;

  // Sincronizar número si estamos en el entorno de Flor de Chañar
  function sincronizarWhatsAppFlorDeChanar() {
    fetch('/api/config/publica')
      .then(r => r.json())
      .then(cfg => {
        if (cfg && cfg.wa_numero) {
          whatsappNumber = cfg.wa_numero.replace(/\D/g, '');
          actualizarEnlacesWhatsApp();
        }
      })
      .catch(() => {
        // Fallback a localStorage si existiera
        const guardado = localStorage.getItem('wa_numero');
        if (guardado) {
          whatsappNumber = guardado.replace(/\D/g, '');
          actualizarEnlacesWhatsApp();
        }
      });
  }

  function construirMensajeWhatsApp(programaTexto, nombre) {
    let msg = 'Hola! Me interesa la formación en Masoterapia Profesional (Método Mushuu)';
    if (programaTexto) {
      msg += ` para el programa ${programaTexto}`;
    }
    if (nombre) {
      msg += `. Mi nombre es ${nombre}`;
    }
    msg += '. ¿Podrían compartirme valores, fechas y requisitos?';
    return encodeURIComponent(msg);
  }

  function actualizarEnlacesWhatsApp() {
    const floatBtn = document.getElementById('wa-float');
    if (floatBtn) {
      floatBtn.href = `https://wa.me/${whatsappNumber}?text=${construirMensajeWhatsApp()}`;
    }
  }

  // Pestañas de programas
  const tabs = document.querySelectorAll('.tab');
  const paneles = document.querySelectorAll('.programa');
  const selectPrograma = document.getElementById('programa-interes');

  function activar(id) {
    tabs.forEach(t => {
      const on = t.dataset.programa === id;
      t.classList.toggle('activo', on);
      t.setAttribute('aria-selected', on);
    });
    paneles.forEach(p => { p.hidden = p.id !== 'programa-' + id; });
  }

  tabs.forEach(t => t.addEventListener('click', () => activar(t.dataset.programa)));

  // "Solicitar información" preselecciona el programa en el formulario y baja
  document.querySelectorAll('[data-solicitar]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const val = a.dataset.solicitar;
      if (selectPrograma) selectPrograma.value = val;
      const destino = document.getElementById('contacto');
      if (destino) destino.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Formulario de contacto conectado a FunnelStudio + AtendIA
  const form = document.getElementById('form-contacto');
  const gracias = document.getElementById('gracias');
  const graciasPrograma = document.getElementById('gracias-programa');
  const btnSubmit = document.getElementById('btn-submit');
  const formError = document.getElementById('form-error');
  const btnWaDirecto = document.getElementById('btn-whatsapp-directo');

  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (formError) {
        formError.style.display = 'none';
        formError.textContent = '';
      }

      const nombre = (document.getElementById('form-nombre')?.value || '').trim();
      const email = (document.getElementById('form-email')?.value || '').trim();
      const telefono = (document.getElementById('form-telefono')?.value || '').trim();
      const programaVal = selectPrograma?.value || 'online';
      const programaTexto = selectPrograma?.options[selectPrograma.selectedIndex]?.text || 'Masoterapia Profesional';

      if (!nombre || !email || !telefono) {
        if (formError) {
          formError.textContent = 'Por favor completa todos los campos requeridos.';
          formError.style.display = 'block';
        }
        return;
      }

      // Estado de envío
      const textoOriginal = btnSubmit ? btnSubmit.textContent : 'Enviar solicitud';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Enviando...';
      }

      // Payload oficial para FunnelStudio Form API + AtendIA Lead Intake
      const payload = {
        formId: 'form-contacto-mushuu',
        funnelId: CONFIG.funnelId,
        funnelTitle: CONFIG.funnelTitle,
        pageId: 'metodo-mushuu',
        adminEmail: CONFIG.adminEmail,
        company_id: CONFIG.companyId,
        fields: {
          nombre: nombre,
          name: nombre,
          email: email,
          telefono: telefono,
          phone: telefono,
          programa: programaTexto,
          programa_clave: programaVal,
          company_id: CONFIG.companyId,
          origen: 'Landing Método Mushuu - Flor de Chañar'
        }
      };

      try {
        const respuesta = await fetch(CONFIG.funnelStudioEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // Incluso si el servidor responde con algún código no 200 pero registra el lead,
        // o si es exitoso, confirmamos al usuario.
        if (!respuesta.ok) {
          console.warn('FunnelStudio API respondió con código:', respuesta.status);
        }
      } catch (err) {
        console.warn('No se pudo enviar al endpoint de FunnelStudio por red/CORS, procediendo de forma local:', err);
      } finally {
        // Configurar enlace directo a WhatsApp con el Bot ID=8
        const waMsg = construirMensajeWhatsApp(programaTexto, nombre);
        if (btnWaDirecto) {
          btnWaDirecto.href = `https://wa.me/${whatsappNumber}?text=${waMsg}`;
        }

        if (graciasPrograma) graciasPrograma.textContent = programaTexto;
        form.hidden = true;
        gracias.hidden = false;

        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = textoOriginal;
        }
      }
    });
  }

  const btnEnviarOtra = document.getElementById('enviar-otra');
  if (btnEnviarOtra && form && gracias) {
    btnEnviarOtra.addEventListener('click', function () {
      form.reset();
      gracias.hidden = true;
      form.hidden = false;
    });
  }

  // Inicializar
  sincronizarWhatsAppFlorDeChanar();
  actualizarEnlacesWhatsApp();
})();
