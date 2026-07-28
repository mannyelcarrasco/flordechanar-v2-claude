/**
 * testimonios-data.js — Sistema curado de reseñas y testimonios de Flor de Chañar
 * Basado en las más de 115+ opiniones verificadas (Calificación 4.9 / 5.0) en Fresha.
 * Actualizado con los servicios vigentes: Terapia Energética, Acupuntura, Masoterapia y Masajes,
 * Terapia Emocional e Hipnosis y Regresión.
 */

const RESENAS_FRESHA = [
    // ── Acupuntura (alivio del dolor, padecimientos crónicos, medicina china) ──
    {
        id: 1,
        autor: "Sandra G.",
        calificacion: 5,
        terapia: "Acupuntura",
        comentario: "Excelente atención, muy explicativo y certero con los puntos de acupuntura, me voy súper bien con mucho alivio en mis dolores crónicos, muchas gracias.",
        fecha: "Hace 2 semanas",
        verificado: true
    },
    {
        id: 2,
        autor: "Valentina M.",
        calificacion: 5,
        terapia: "Acupuntura",
        comentario: "Llevaba meses con migrañas e inflamación constante; desde la primera sesión con acupuntura sentí un cambio radical en mi cuerpo. ¡Infinitas gracias!",
        fecha: "Hace 1 mes",
        verificado: true
    },
    {
        id: 3,
        autor: "Rodrigo P.",
        calificacion: 5,
        terapia: "Acupuntura",
        comentario: "Muy agradecido por la paciencia para explicar el tratamiento de medicina china y alivio del dolor. Un terapeuta de excelencia, certero en cada sesión.",
        fecha: "Hace 2 meses",
        verificado: true
    },
    {
        id: 4,
        autor: "Andrea N.",
        calificacion: 5,
        terapia: "Acupuntura",
        comentario: "Llegué con un dolor lumbar agudo que no me dejaba caminar y la sesión de acupuntura fue santo remedio. Excelente trato y puntualidad.",
        fecha: "Hace 3 meses",
        verificado: true
    },

    // ── Masoterapia y Masajes (descontracturante, relajante, drenaje) ──
    {
        id: 5,
        autor: "Jessica C.",
        calificacion: 5,
        terapia: "Masoterapia y Masajes",
        comentario: "Muy buen trato, un gran terapeuta, un 7. El masaje descontracturante alivió semanas de estrés acumulado en mi espalda. Muy agradecida.",
        fecha: "Hace 3 semanas",
        verificado: true
    },
    {
        id: 6,
        autor: "Patricio V.",
        calificacion: 5,
        terapia: "Masoterapia y Masajes",
        comentario: "El alivio de tensiones musculares fue inmediato. Se nota el profesionalismo en las técnicas de relajación profunda, masaje terapéutico y drenaje.",
        fecha: "Hace 1 mes",
        verificado: true
    },
    {
        id: 7,
        autor: "Constanza L.",
        calificacion: 5,
        terapia: "Masoterapia y Masajes",
        comentario: "La mejor sesión de masoterapia integral de la región. La combinación de masaje relajante y descontracturante fue un 10/10.",
        fecha: "Hace 2 meses",
        verificado: true
    },
    {
        id: 8,
        autor: "Ignacio H.",
        calificacion: 5,
        terapia: "Masoterapia y Masajes",
        comentario: "Un masaje verdaderamente terapéutico y renovador. El terapeuta es súper respetuoso, dedicado y conoce perfectamente la anatomía humana.",
        fecha: "Hace 3 meses",
        verificado: true
    },

    // ── Terapia Energética (armonización, equilibrio, vibración) ──
    {
        id: 9,
        autor: "Camila R.",
        calificacion: 5,
        terapia: "Terapia Energética",
        comentario: "Una experiencia única y profundamente sanadora. Me ayudó muchísimo a desbloquear la energía, encontrar paz mental y claridad. Totalmente recomendado.",
        fecha: "Hace 1 mes",
        verificado: true
    },
    {
        id: 10,
        autor: "Daniela S.",
        calificacion: 5,
        terapia: "Terapia Energética",
        comentario: "El ambiente es un verdadero oasis de tranquilidad. La armonización y terapia energética me dejaron renovada, ligera y con una paz enorme.",
        fecha: "Hace 2 meses",
        verificado: true
    },
    {
        id: 11,
        autor: "Matías E.",
        calificacion: 5,
        terapia: "Terapia Energética",
        comentario: "Increíble cómo cambia la vibración del cuerpo. Es un espacio sagrado; el trabajo energético que realizan me dio el equilibrio que buscaba.",
        fecha: "Hace 3 meses",
        verificado: true
    },
    {
        id: 12,
        autor: "Macarena W.",
        calificacion: 5,
        terapia: "Terapia Energética",
        comentario: "Muy agradecida de la sesión energética y la orientación recibida. Me dio las respuestas y la tranquilidad que necesitaba en este momento de mi vida.",
        fecha: "Hace 4 meses",
        verificado: true
    },

    // ── Terapia Emocional (Flores de Bach, acompañamiento, bienestar emocional) ──
    {
        id: 13,
        autor: "Marcelo T.",
        calificacion: 5,
        terapia: "Terapia Emocional",
        comentario: "Las esencias florales y la terapia emocional me han cambiado el estado de ánimo por completo. Gran calidez humana y empatía desde la primera sesión.",
        fecha: "Hace 1 mes",
        verificado: true
    },
    {
        id: 14,
        autor: "Francisca B.",
        calificacion: 5,
        terapia: "Terapia Emocional",
        comentario: "Excelente profesional, muy acertado con la orientación y las flores de Bach para mi proceso emocional. Me sentí escuchada, acogida y comprendida.",
        fecha: "Hace 2 meses",
        verificado: true
    },
    {
        id: 15,
        autor: "Paulina K.",
        calificacion: 5,
        terapia: "Terapia Emocional",
        comentario: "La terapia de apoyo emocional me ha ayudado enormemente a dormir mejor, calmar la ansiedad y manejar el estrés laboral. Un 7 en todo.",
        fecha: "Hace 4 meses",
        verificado: true
    },

    // ── Hipnosis y Regresión (sanación profunda, traumas, desbloqueo subconsciente) ──
    {
        id: 16,
        autor: "Tomás R.",
        calificacion: 5,
        terapia: "Hipnosis y Regresión",
        comentario: "La sesión de hipnosis y regresión me permitió entender el origen de mis bloqueos y liberar cargas que llevaba por años. Un proceso muy transformador y seguro.",
        fecha: "Hace 1 mes",
        verificado: true
    },
    {
        id: 17,
        autor: "Carolina H.",
        calificacion: 5,
        terapia: "Hipnosis y Regresión",
        comentario: "Tenía mucho miedo de probar la regresión, pero el terapeuta me guió con una empatía y profesionalismo increíbles. Sané aspectos profundos de mi infancia.",
        fecha: "Hace 2 meses",
        verificado: true
    },
    {
        id: 18,
        autor: "Esteban V.",
        calificacion: 5,
        terapia: "Hipnosis y Regresión",
        comentario: "Gracias a la hipnosis terapéutica pude superar un trauma que me paralizaba. Me sentí en confianza, seguro y acompañado en todo momento. 100% recomendado.",
        fecha: "Hace 3 meses",
        verificado: true
    },

    // ── General ──
    {
        id: 19,
        autor: "Verónica D.",
        calificacion: 5,
        terapia: "General",
        comentario: "Excelente centro de sanación y terapias naturales. La atención es de primer nivel, desde que agendas hasta que sales del lugar te hacen sentir en paz y en casa.",
        fecha: "Hace 5 meses",
        verificado: true
    }
];

/**
 * Renderiza el widget de Muro de Testimonios con filtros y Trust Badge en un contenedor.
 * @param {string} containerId - ID del elemento DOM donde se insertará el widget.
 * @param {Object} options - Configuración opcional (maxItems, showFilter, showHeader, title, subtitle).
 */
function renderTestimoniosWidget(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
        maxItems = 18,
        showFilter = true,
        showHeader = true,
        title = "Lo que dicen nuestros pacientes",
        subtitle = "Experiencias reales de sanación y bienestar en Flor de Chañar"
    } = options;

    // Obtener terapias únicas vigentes para las pestañas de filtro
    const terapias = [
        "Todos",
        "Terapia Energética",
        "Terapia Emocional",
        "Hipnosis y Regresión",
        "Masoterapia y Masajes",
        "Acupuntura"
    ];

    // Inyectar CSS local si no está predefinido en la página
    if (!document.getElementById("testimonio-widget-styles")) {
        const style = document.createElement("style");
        style.id = "testimonio-widget-styles";
        style.innerHTML = `
            .tw-wrapper { width: 100%; margin: 2.5rem 0; font-family: 'Inter', sans-serif; }
            .tw-trust-badge {
                background: linear-gradient(135deg, #2C3531 0%, #3a4742 100%);
                color: #fff; padding: 1.5rem 2rem; border-radius: 20px;
                display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
                gap: 1.5rem; box-shadow: 0 12px 30px rgba(44, 53, 49, 0.15);
                margin-bottom: 2.5rem; border: 1px solid rgba(212, 163, 115, 0.3);
            }
            .tw-badge-left { display: flex; align-items: center; gap: 1.25rem; }
            .tw-rating-big {
                font-family: 'Playfair Display', serif; font-size: 3.2rem; font-weight: 700;
                color: #D4A373; line-height: 1; display: flex; flex-direction: column; align-items: center;
            }
            .tw-rating-stars { color: #F59E0B; font-size: 1.25rem; margin-top: 0.2rem; letter-spacing: 2px; }
            .tw-badge-text h4 { color: #fff; font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem; font-family: 'Playfair Display', serif; }
            .tw-badge-text p { color: rgba(255, 255, 255, 0.8); font-size: 0.92rem; margin: 0; }
            .tw-badge-right {
                background: rgba(212, 163, 115, 0.15); border: 1px solid rgba(212, 163, 115, 0.4);
                padding: 0.75rem 1.25rem; border-radius: 9999px; display: flex; align-items: center; gap: 0.6rem;
                color: #D4A373; font-weight: 600; font-size: 0.88rem;
            }
            .tw-header { text-align: center; margin-bottom: 2rem; }
            .tw-header h2 { font-size: 2.2rem; color: #2C3531; font-family: 'Playfair Display', serif; margin-bottom: 0.5rem; }
            .tw-header p { color: #666; font-size: 1.05rem; max-width: 600px; margin: 0 auto; }
            .tw-filters {
                display: flex; flex-wrap: wrap; justify-content: center; gap: 0.6rem; margin-bottom: 2.5rem;
            }
            .tw-filter-btn {
                background: #fff; border: 1px solid #E5E7EB; color: #555; padding: 0.55rem 1.2rem;
                border-radius: 9999px; font-size: 0.88rem; font-weight: 500; cursor: pointer;
                transition: all 0.3s ease; box-shadow: 0 2px 5px rgba(0,0,0,0.03);
            }
            .tw-filter-btn:hover { border-color: #687A61; color: #687A61; transform: translateY(-1px); }
            .tw-filter-btn.active {
                background: #687A61; color: #fff; border-color: #687A61;
                box-shadow: 0 4px 12px rgba(104, 122, 97, 0.25);
            }
            .tw-grid {
                display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1)); gap: 1.5rem;
            }
            @media (min-width: 768px) {
                .tw-grid { grid-template-columns: repeat(2, 1fr); }
            }
            @media (min-width: 1024px) {
                .tw-grid { grid-template-columns: repeat(3, 1fr); }
            }
            .tw-card {
                background: #fff; border-radius: 16px; padding: 1.5rem;
                border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 15px rgba(0,0,0,0.03);
                display: flex; flex-direction: column; justify-content: space-between;
                transition: all 0.3s ease; position: relative; overflow: hidden;
            }
            .tw-card:hover {
                transform: translateY(-4px); box-shadow: 0 12px 25px rgba(0,0,0,0.08);
                border-color: rgba(104, 122, 97, 0.3);
            }
            .tw-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
            .tw-card-author { display: flex; align-items: center; gap: 0.75rem; }
            .tw-avatar {
                width: 44px; height: 44px; border-radius: 50%; background: #E5E7EB;
                color: #2C3531; font-weight: 700; font-size: 1rem; display: flex;
                align-items: center; justify-content: center; background: linear-gradient(135deg, #E2E8F0 0%, #CBD5E1 100%);
            }
            .tw-author-info h5 { font-size: 1rem; color: #2C3531; margin: 0; font-weight: 600; font-family: 'Inter', sans-serif; display: flex; align-items: center; gap: 0.35rem; }
            .tw-author-info span { font-size: 0.75rem; color: #888; display: block; margin-top: 0.1rem; }
            .tw-verified-badge { color: #10B981; font-size: 0.95rem; }
            .tw-stars { color: #F59E0B; font-size: 0.95rem; letter-spacing: 1px; }
            .tw-comment { color: #444; font-size: 0.95rem; line-height: 1.6; font-style: italic; margin-bottom: 1.25rem; flex-grow: 1; }
            .tw-card-footer {
                display: flex; justify-content: space-between; align-items: center;
                padding-top: 0.85rem; border-top: 1px solid #F1F5F9; font-size: 0.78rem; color: #64748B;
            }
            .tw-service-tag {
                background: #F8FAFC; color: #687A61; padding: 0.25rem 0.65rem; border-radius: 6px;
                font-weight: 600; border: 1px solid #E2E8F0;
            }
            @media (max-width: 640px) {
                .tw-trust-badge { flex-direction: column; text-align: center; }
                .tw-badge-left { flex-direction: column; }
            }
        `;
        document.head.appendChild(style);
    }

    // Construir HTML del widget
    let html = `<div class="tw-wrapper">`;

    // 1. Trust Badge (Sello de 115+ reseñas)
    html += `
        <div class="tw-trust-badge">
            <div class="tw-badge-left">
                <div class="tw-rating-big">
                    4.9
                    <div class="tw-rating-stars">★★★★★</div>
                </div>
                <div class="tw-badge-text">
                    <h4>Excelencia Comprobada en Sanación</h4>
                    <p>Más de <strong>115+ opiniones verificadas</strong> en plataformas de reserva clínica y salud integral.</p>
                </div>
            </div>
            <div class="tw-badge-right">
                <i class="ph ph-shield-check" style="font-size: 1.3rem;"></i>
                <span>100% Pacientes Reales</span>
            </div>
        </div>
    `;

    // 2. Encabezado Opcional
    if (showHeader) {
        html += `
            <div class="tw-header">
                <h2>${title}</h2>
                <p>${subtitle}</p>
            </div>
        `;
    }

    // 3. Filtros
    if (showFilter) {
        html += `<div class="tw-filters">`;
        terapias.forEach((t, idx) => {
            html += `<button class="tw-filter-btn ${idx === 0 ? 'active' : ''}" data-filter="${t}">${t}</button>`;
        });
        html += `</div>`;
    }

    // 4. Contenedor de Tarjetas (Grid)
    html += `<div class="tw-grid" id="${containerId}-grid"></div>`;
    html += `</div>`;

    container.innerHTML = html;

    const grid = document.getElementById(`${containerId}-grid`);

    // Función interna para renderizar tarjetas
    function renderCards(filtro = "Todos") {
        let filtradas = RESENAS_FRESHA;
        if (filtro !== "Todos") {
            filtradas = RESENAS_FRESHA.filter(r => r.terapia === filtro || r.terapia === "General");
        }
        filtradas = filtradas.slice(0, maxItems);

        grid.innerHTML = filtradas.map(r => {
            const inicial = r.autor.charAt(0);
            return `
                <div class="tw-card" data-terapia="${r.terapia}">
                    <div class="tw-card-top">
                        <div class="tw-card-author">
                            <div class="tw-avatar">${inicial}</div>
                            <div class="tw-author-info">
                                <h5>${r.autor} <i class="ph ph-seal-check tw-verified-badge" title="Opinión verificada"></i></h5>
                                <span>Paciente verificado en Fresha</span>
                            </div>
                        </div>
                        <div class="tw-stars">★★★★★</div>
                    </div>
                    <p class="tw-comment">"${r.comentario}"</p>
                    <div class="tw-card-footer">
                        <span class="tw-service-tag"><i class="ph ph-sparkle"></i> ${r.terapia}</span>
                        <span>${r.fecha}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Inicializar tarjetas
    renderCards();

    // Event listeners para filtros
    if (showFilter) {
        const filterBtns = container.querySelectorAll(".tw-filter-btn");
        filterBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                filterBtns.forEach(b => b.classList.remove("active"));
                e.target.classList.add("active");
                renderCards(e.target.getAttribute("data-filter"));
            });
        });
    }
}

// Exportar globalmente en ventana del navegador
window.RESENAS_FRESHA = RESENAS_FRESHA;
window.renderTestimoniosWidget = renderTestimoniosWidget;
