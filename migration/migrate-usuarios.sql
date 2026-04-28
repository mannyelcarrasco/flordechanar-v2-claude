-- ══════════════════════════════════════════════════════════════════════
--  MIGRACIÓN DE USUARIOS: WordPress DB → Flor de Chañar v2
-- ══════════════════════════════════════════════════════════════════════
-- Ejecutar DIRECTAMENTE en la base de datos de WordPress (phpMyAdmin o
-- terminal MySQL conectado al WordPress).
-- Los pasos 3+ se ejecutan en la BD de Flor de Chañar v2.
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
--  PASO 1: Ver qué usuarios hay en WordPress (ejecutar en BD WordPress)
-- ──────────────────────────────────────────────────────────────────────
SELECT
    u.ID,
    u.display_name                          AS nombre,
    u.user_email                            AS email,
    u.user_registered                       AS registrado_en,
    -- Roles WP: 'subscriber'=estudiante, 'lp_teacher'=profesor, 'administrator'=admin
    SUBSTRING_INDEX(
        REPLACE(REPLACE(REPLACE(
            (SELECT meta_value FROM wp_usermeta
             WHERE user_id = u.ID AND meta_key = 'wp_capabilities' LIMIT 1),
        'a:1:{s:', ''), '";b:1;}', ''), 's:"', ''), '"', 1
    )                                        AS rol_wp
FROM wp_users u
ORDER BY u.user_registered;


-- ──────────────────────────────────────────────────────────────────────
--  PASO 2: Ver matrículas (inscripciones) de LearnPress
-- ──────────────────────────────────────────────────────────────────────
SELECT
    ui.user_id          AS wp_user_id,
    u.display_name      AS nombre,
    u.user_email        AS email,
    ui.item_id          AS wp_curso_id,
    p.post_title        AS nombre_curso,
    ui.status           AS estado_matricula,  -- 'enrolled', 'finished', 'pending'
    ui.start_time       AS fecha_inscripcion,
    ui.end_time         AS fecha_fin
FROM wp_learnpress_user_items ui
JOIN wp_users u  ON u.ID  = ui.user_id
JOIN wp_posts p  ON p.ID  = ui.item_id
WHERE ui.item_type = 'lp_course'
  AND ui.status IN ('enrolled', 'finished')
ORDER BY ui.user_id, ui.item_id;


-- ──────────────────────────────────────────────────────────────────────
--  PASO 3: Ver progreso de lecciones de cada estudiante
-- ──────────────────────────────────────────────────────────────────────
SELECT
    ui.user_id          AS wp_user_id,
    u.display_name      AS nombre,
    ui.item_id          AS wp_leccion_id,
    p.post_title        AS titulo_leccion,
    ui.status           AS estado,          -- 'completed'
    ui.graduation       AS aprobacion,      -- 'passed', 'failed'
    ui.end_time         AS completada_en
FROM wp_learnpress_user_items ui
JOIN wp_users u ON u.ID  = ui.user_id
JOIN wp_posts p ON p.ID  = ui.item_id
WHERE ui.item_type = 'lp_lesson'
  AND ui.status    = 'completed'
ORDER BY ui.user_id, ui.end_time;


-- ══════════════════════════════════════════════════════════════════════
--  PASO 4: INSERT en Flor de Chañar v2 (ejecutar en BD flordechanar)
-- ══════════════════════════════════════════════════════════════════════

-- 4a. Insertar usuarios exportados de WP
--     NOTA: Las contraseñas de WordPress usan phpass y NO son compatibles
--     con bcrypt. Se asigna una contraseña temporal segura que el usuario
--     deberá cambiar en su primer login.
--     Contraseña temporal: "FlordeChanar2025!" (ya hasheada con bcrypt rounds=10)
--
--     Para generar el hash correcto:
--       node -e "const b=require('bcryptjs'); b.hash('FlordeChanar2025!',10).then(h=>console.log(h));"
--     Luego reemplaza el valor de PASSWORD_TEMPORAL abajo.

SET @PASSWORD_TEMPORAL = '$2a$10$REEMPLAZA_CON_HASH_BCRYPT_GENERADO_ARRIBA';

-- Insertar cada usuario (ejecutar una vez por usuario, ajustando valores):
INSERT INTO usuarios (nombre, email, password, rol, activo, creado_en)
VALUES
-- Estudiantes (copiar filas del resultado del PASO 1, cambiando rol):
('Nombre Estudiante 1', 'email1@ejemplo.com', @PASSWORD_TEMPORAL, 'estudiante', 1, NOW()),
('Nombre Estudiante 2', 'email2@ejemplo.com', @PASSWORD_TEMPORAL, 'estudiante', 1, NOW())
-- Agrega una fila por cada estudiante exportado del PASO 1
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), rol = VALUES(rol);


-- 4b. Insertar inscripciones
--     Primero obtén los IDs de la nueva BD:
--       SELECT id, titulo FROM cursos;
--       SELECT id, email FROM usuarios;
--     Luego mapea wp_user_id → nuevo usuario_id y wp_curso_id → nuevo curso_id

INSERT INTO inscripciones (usuario_id, curso_id, estado, creado_en)
VALUES
-- (nuevo_usuario_id, nuevo_curso_id, 'activo', fecha_inscripcion_original)
(1, 1, 'activo', '2024-03-15 10:00:00'),
(1, 2, 'activo', '2024-04-01 10:00:00')
-- Agrega una fila por cada inscripción del PASO 2
ON DUPLICATE KEY UPDATE estado = VALUES(estado);


-- 4c. Insertar progreso de lecciones
--     Requiere tener los IDs de lecciones en la nueva BD (después de migrate-cursos.js)
--       SELECT id, titulo FROM lecciones;

INSERT INTO progreso_lecciones (usuario_id, leccion_id, completada_en)
VALUES
-- (nuevo_usuario_id, nueva_leccion_id, fecha_completado_original)
(1, 5, '2024-03-20 14:30:00'),
(1, 6, '2024-03-22 16:00:00')
-- Agrega una fila por cada lección completada del PASO 3
ON DUPLICATE KEY UPDATE completada_en = VALUES(completada_en);


-- ══════════════════════════════════════════════════════════════════════
--  VERIFICACIÓN FINAL
-- ══════════════════════════════════════════════════════════════════════
-- Ejecutar en BD flordechanar para verificar resultado:

SELECT
    (SELECT COUNT(*) FROM usuarios WHERE rol = 'estudiante') AS total_estudiantes,
    (SELECT COUNT(*) FROM cursos)                             AS total_cursos,
    (SELECT COUNT(*) FROM modulos)                            AS total_modulos,
    (SELECT COUNT(*) FROM lecciones)                          AS total_lecciones,
    (SELECT COUNT(*) FROM inscripciones)                      AS total_inscripciones,
    (SELECT COUNT(*) FROM progreso_lecciones)                 AS total_progreso;
