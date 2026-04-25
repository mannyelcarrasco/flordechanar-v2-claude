const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// Fail-fast: exigir JWT_SECRET en producción
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET no configurado. Define la variable de entorno antes de arrancar en producción.');
    process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cors());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Demasiados intentos de inicio de sesión. Intenta en 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Create DB Connection Pool
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
};

let pool;

async function initDB() {
    try {
        console.log('Connecting to MySQL DB...');
        let connection = await mysql.createConnection(dbConfig);

        await connection.query('CREATE DATABASE IF NOT EXISTS flordechanar CHARACTER SET utf8mb4');
        console.log('Database flordechanar checked/created.');
        await connection.end();

        pool = mysql.createPool({ ...dbConfig, database: 'flordechanar' });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                email VARCHAR(200) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                rol ENUM('estudiante','profesor','admin') DEFAULT 'estudiante',
                activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cursos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                titulo VARCHAR(300) NOT NULL,
                descripcion TEXT,
                precio INT DEFAULT 0,
                portada_url VARCHAR(500),
                estado ENUM('borrador','publicado','archivado') DEFAULT 'borrador',
                profesor_id INT,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profesor_id) REFERENCES usuarios(id)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS inscripciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                curso_id INT NOT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (usuario_id, curso_id),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS modulos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                curso_id INT NOT NULL,
                titulo VARCHAR(300) NOT NULL,
                orden INT DEFAULT 0,
                FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS lecciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                modulo_id INT NOT NULL,
                titulo VARCHAR(300) NOT NULL,
                descripcion TEXT,
                video_url VARCHAR(500),
                tipo VARCHAR(20) DEFAULT 'video',
                duracion VARCHAR(50),
                visibilidad VARCHAR(10) DEFAULT 'privada',
                orden INT DEFAULT 0,
                FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS progreso_lecciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                leccion_id INT NOT NULL,
                completada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (usuario_id, leccion_id),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (leccion_id) REFERENCES lecciones(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS evaluaciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                curso_id INT NOT NULL,
                titulo VARCHAR(300) NOT NULL,
                instrucciones TEXT,
                tiempo_minutos INT DEFAULT 60,
                fecha_apertura DATETIME DEFAULT NULL,
                fecha_cierre DATETIME DEFAULT NULL,
                publicada BOOLEAN DEFAULT FALSE,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS preguntas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                evaluacion_id INT NOT NULL,
                tipo ENUM('multiple','desarrollo','rubrica') DEFAULT 'multiple',
                texto TEXT NOT NULL,
                opciones JSON DEFAULT NULL,
                respuesta_correcta INT DEFAULT NULL,
                puntaje DECIMAL(5,2) DEFAULT 1,
                orden INT DEFAULT 0,
                FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS intentos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                evaluacion_id INT NOT NULL,
                usuario_id INT NOT NULL,
                iniciado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                entregado_en TIMESTAMP NULL,
                puntaje_obtenido DECIMAL(5,2) DEFAULT 0,
                puntaje_total DECIMAL(5,2) DEFAULT 0,
                UNIQUE KEY (evaluacion_id, usuario_id),
                FOREIGN KEY (evaluacion_id) REFERENCES evaluaciones(id) ON DELETE CASCADE,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS respuestas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                intento_id INT NOT NULL,
                pregunta_id INT NOT NULL,
                opcion_seleccionada INT DEFAULT NULL,
                texto_respuesta TEXT,
                puntaje_asignado DECIMAL(5,2) DEFAULT NULL,
                FOREIGN KEY (intento_id) REFERENCES intentos(id) ON DELETE CASCADE,
                FOREIGN KEY (pregunta_id) REFERENCES preguntas(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clases_vivo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                titulo VARCHAR(255) NOT NULL,
                descripcion TEXT,
                fecha_inicio DATETIME NOT NULL,
                duracion_min INT DEFAULT 60,
                meet_url VARCHAR(500),
                youtube_id VARCHAR(50),
                estado ENUM('programada','en_vivo','finalizada') DEFAULT 'programada',
                curso_id INT DEFAULT NULL,
                creado_por INT NOT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE SET NULL,
                FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);

        console.log('Tables checked/created: evaluaciones, preguntas, intentos, respuestas.');

        const alterCols = [
            // Use VARCHAR for tipo — more flexible than ENUM, no migration issues
            `ALTER TABLE lecciones MODIFY COLUMN tipo VARCHAR(20) DEFAULT 'video'`,
            `ALTER TABLE lecciones ADD COLUMN IF NOT EXISTS duracion VARCHAR(50)`,
            `ALTER TABLE lecciones MODIFY COLUMN visibilidad VARCHAR(10) DEFAULT 'privada'`,
            `ALTER TABLE lecciones ADD COLUMN IF NOT EXISTS orden INT DEFAULT 0`
        ];
        for(const sql of alterCols) { try { await pool.query(sql); } catch(e) {} }

        // Migrate: fix lessons whose video_url starts with 'clase_vivo:' but tipo is wrong
        try {
            await pool.query(
                `UPDATE lecciones SET tipo='clase_vivo' WHERE video_url LIKE 'clase_vivo:%' AND tipo != 'clase_vivo'`
            );
        } catch(e) {}

        // Migrate: fix meet_url that's missing https:// prefix
        try {
            await pool.query(
                `UPDATE clases_vivo SET meet_url = CONCAT('https://', meet_url)
                 WHERE meet_url IS NOT NULL AND meet_url != ''
                 AND meet_url NOT LIKE 'http://%' AND meet_url NOT LIKE 'https://%'`
            );
        } catch(e) {}

        console.log('Tables checked/created: usuarios, cursos, inscripciones, modulos, lecciones, progreso_lecciones.');

        const [rows] = await pool.query('SELECT * FROM usuarios WHERE rol = "admin"');
        if (rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
                ['Administrador Principal', 'admin@flordechanar.cl', hash, 'admin']
            );
            console.log('Default admin created: admin@flordechanar.cl / admin123');
        }

    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

initDB();

// --- File Upload (Multer) ---
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) return cb(null, true);
        cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG, WEBP y PDF.'));
    }
});

app.post('/api/upload', verifyToken, (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
        res.json({ url: '/uploads/' + req.file.filename });
    });
});

// --- Helpers de validación ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmail(e) { return typeof e === 'string' && EMAIL_RE.test(e.trim()); }
function validStr(s, min = 1, max = 300) { return typeof s === 'string' && s.trim().length >= min && s.trim().length <= max; }

// --- Auth Routes ---
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!validEmail(email) || !validStr(password, 4)) return res.status(400).json({ error: 'Email y contraseña requeridos' });

        if (!pool) return res.status(500).json({ error: 'Database not connected' });

        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = rows[0];
        const passOk = await bcrypt.compare(password, usuario.password);
        if (!passOk) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
            process.env.JWT_SECRET || 'fallback_secret_flordechanar',
            { expiresIn: '7d' }
        );

        res.json({ token, rol: usuario.rol, nombre: usuario.nombre });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Middleware Auth
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (!bearerHeader) return res.status(403).json({ error: 'No token provided' });

    const token = bearerHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_flordechanar', (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.usuario = decoded;
        next();
    });
}

// --- Rutas de Usuarios ---

app.get('/api/usuarios/profesores', verifyToken, async (req, res) => {
    try {
        const [profesores] = await pool.query(
            'SELECT id, nombre, email FROM usuarios WHERE rol = "profesor" OR rol = "admin" ORDER BY nombre ASC'
        );
        res.json(profesores);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener profesores' });
    }
});

app.get('/api/usuarios', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [usuarios] = await pool.query(`
            SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.creado_en,
            (SELECT COUNT(*) FROM inscripciones WHERE usuario_id = u.id) as cursos_inscritos
            FROM usuarios u
            ORDER BY u.creado_en DESC
        `);
        res.json(usuarios);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

app.post('/api/usuarios/crear', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { nombre, email, password, rol } = req.body;
        if (!validStr(nombre, 2, 150)) return res.status(400).json({ error: 'Nombre inválido' });
        if (!validEmail(email)) return res.status(400).json({ error: 'Email inválido' });
        const rolesPermitidos = ['estudiante', 'profesor', 'admin'];
        if (rol && !rolesPermitidos.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
        const pass = password || 'flordechanar123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(pass, salt);
        await pool.query('INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)', [nombre, email, hash, rol || 'estudiante']);
        res.json({ success: true, message: 'Usuario creado' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
});

// --- Rutas de Cursos y LMS ---

app.get('/api/cursos', async (req, res) => {
    try {
        if (!pool) return res.status(500).json({ error: 'Database not connected' });
        const [cursos] = await pool.query('SELECT c.id, c.titulo, c.descripcion, c.precio, c.portada_url, u.nombre as profesor FROM cursos c LEFT JOIN usuarios u ON c.profesor_id = u.id WHERE c.estado = "publicado"');
        res.json(cursos);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener cursos' });
    }
});

app.post('/api/cursos', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { titulo, descripcion, precio, portada_url, estado, profesor_id } = req.body;
        if (!validStr(titulo, 3, 300)) return res.status(400).json({ error: 'Título del curso requerido (3-300 caracteres)' });
        const estadosPermitidos = ['borrador', 'publicado', 'archivado'];
        if (estado && !estadosPermitidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
        const profAsignado = profesor_id || req.usuario.id;
        const result = await pool.query(
            'INSERT INTO cursos (titulo, descripcion, precio, portada_url, estado, profesor_id) VALUES (?, ?, ?, ?, ?, ?)',
            [titulo, descripcion, precio, portada_url, estado, profAsignado]
        );
        res.json({ success: true, id: result[0].insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear curso' });
    }
});

app.get('/api/cursos/dictados', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [cursos] = await pool.query(`
            SELECT c.*,
                   (SELECT COUNT(*) FROM inscripciones WHERE curso_id = c.id) as alumnos
            FROM cursos c
            WHERE c.profesor_id = ?
        `, [req.usuario.id]);
        res.json(cursos);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener cursos dictados' });
    }
});

app.get('/api/cursos/mis-cursos', verifyToken, async (req, res) => {
    try {
        const [cursos] = await pool.query(`
            SELECT c.* FROM cursos c
            JOIN inscripciones i ON c.id = i.curso_id
            WHERE i.usuario_id = ?
        `, [req.usuario.id]);
        res.json(cursos);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener mis cursos' });
    }
});

app.post('/api/cursos/inscribir', verifyToken, async (req, res) => {
    try {
        const { curso_id } = req.body;
        await pool.query('INSERT IGNORE INTO inscripciones (usuario_id, curso_id) VALUES (?, ?)', [req.usuario.id, curso_id]);
        res.json({ success: true, message: 'Inscrito correctamente' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error en inscripción' });
    }
});

// Marcar lección como completada
app.post('/api/lecciones/:id/completar', verifyToken, async (req, res) => {
    try {
        await pool.query(
            'INSERT IGNORE INTO progreso_lecciones (usuario_id, leccion_id) VALUES (?, ?)',
            [req.usuario.id, req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al registrar progreso' });
    }
});

// Obtener progreso de un curso para el usuario autenticado
app.get('/api/cursos/:id/progreso', verifyToken, async (req, res) => {
    try {
        const [[{ total }]] = await pool.query(`
            SELECT COUNT(*) as total FROM lecciones l
            JOIN modulos m ON l.modulo_id = m.id
            WHERE m.curso_id = ?
        `, [req.params.id]);

        const [[{ completadas }]] = await pool.query(`
            SELECT COUNT(*) as completadas FROM progreso_lecciones pl
            JOIN lecciones l ON pl.leccion_id = l.id
            JOIN modulos m ON l.modulo_id = m.id
            WHERE m.curso_id = ? AND pl.usuario_id = ?
        `, [req.params.id, req.usuario.id]);

        const [leccionesCompletadas] = await pool.query(`
            SELECT pl.leccion_id FROM progreso_lecciones pl
            JOIN lecciones l ON pl.leccion_id = l.id
            JOIN modulos m ON l.modulo_id = m.id
            WHERE m.curso_id = ? AND pl.usuario_id = ?
        `, [req.params.id, req.usuario.id]);

        const porcentaje = total > 0 ? Math.round((completadas / total) * 100) : 0;

        res.json({
            total: parseInt(total),
            completadas: parseInt(completadas),
            porcentaje,
            leccionesCompletadas: leccionesCompletadas.map(r => r.leccion_id)
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener progreso' });
    }
});

// Obtener Curso por ID (ruta genérica - debe ir DESPUÉS de las rutas específicas)
app.get('/api/cursos/:id', verifyToken, async (req, res) => {
    try {
        const [cursos] = await pool.query(
            `SELECT c.*, u.nombre as profesor_nombre
             FROM cursos c
             LEFT JOIN usuarios u ON c.profesor_id = u.id
             WHERE c.id = ?`,
            [req.params.id]
        );
        if (cursos.length === 0) return res.status(404).json({ error: 'Curso no encontrado' });
        res.json(cursos[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener curso' });
    }
});

app.put('/api/cursos/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { titulo, descripcion, precio, portada_url, estado, profesor_id } = req.body;
        const profAsignado = profesor_id || req.usuario.id;
        await pool.query(
            'UPDATE cursos SET titulo=?, descripcion=?, precio=?, portada_url=?, estado=?, profesor_id=? WHERE id=?',
            [titulo, descripcion, precio, portada_url, estado, profAsignado, req.params.id]
        );
        res.json({ success: true, message: 'Curso actualizado con éxito' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar curso' });
    }
});

app.delete('/api/cursos/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        await pool.query('DELETE FROM cursos WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Curso eliminado' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar curso' });
    }
});

// --- Curriculum: Módulos y Lecciones ---

app.get('/api/cursos/:id/curriculum', async (req, res) => {
    try {
        const [modulos] = await pool.query('SELECT * FROM modulos WHERE curso_id = ? ORDER BY orden ASC', [req.params.id]);
        for (let m of modulos) {
            const [lecciones] = await pool.query('SELECT * FROM lecciones WHERE modulo_id = ? ORDER BY orden ASC', [m.id]);
            m.lecciones = lecciones;
        }
        res.json(modulos);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener curriculum' });
    }
});

app.post('/api/modulos', verifyToken, async (req, res) => {
    try {
        const { curso_id, titulo } = req.body;
        const [result] = await pool.query('INSERT INTO modulos (curso_id, titulo) VALUES (?, ?)', [curso_id, titulo]);
        res.json({ success: true, id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear módulo' });
    }
});

app.delete('/api/modulos/:id', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM modulos WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar módulo' });
    }
});

app.post('/api/lecciones', verifyToken, async (req, res) => {
    try {
        const { modulo_id, titulo, descripcion, video_url, tipo, duracion, visibilidad } = req.body;
        const [result] = await pool.query(
            'INSERT INTO lecciones (modulo_id, titulo, descripcion, video_url, tipo, duracion, visibilidad) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [modulo_id, titulo, descripcion || null, video_url || null, tipo || 'video', duracion || null, visibilidad || 'privada']
        );
        res.json({ success: true, id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear lección' });
    }
});

app.put('/api/lecciones/:id', verifyToken, async (req, res) => {
    try {
        const { titulo, descripcion, video_url, tipo, duracion, visibilidad } = req.body;
        await pool.query(
            'UPDATE lecciones SET titulo=?, descripcion=?, video_url=?, tipo=?, duracion=?, visibilidad=? WHERE id=?',
            [titulo, descripcion || null, video_url || null, tipo || 'video', duracion || null, visibilidad || 'privada', req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar lección' });
    }
});

app.delete('/api/lecciones/:id', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM lecciones WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar lección' });
    }
});

// --- Evaluaciones ---

// Listar evaluaciones de un curso
app.get('/api/cursos/:id/evaluaciones', verifyToken, async (req, res) => {
    try {
        const [evals] = await pool.query(
            'SELECT * FROM evaluaciones WHERE curso_id = ? ORDER BY creado_en DESC',
            [req.params.id]
        );
        res.json(evals);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener evaluaciones' }); }
});

// Crear evaluación con sus preguntas
app.post('/api/evaluaciones', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { curso_id, titulo, instrucciones, tiempo_minutos, fecha_apertura, fecha_cierre, publicada, preguntas } = req.body;
        if (!validStr(titulo, 3, 300)) return res.status(400).json({ error: 'Título requerido' });
        if (!curso_id) return res.status(400).json({ error: 'curso_id requerido' });

        const [result] = await pool.query(
            'INSERT INTO evaluaciones (curso_id, titulo, instrucciones, tiempo_minutos, fecha_apertura, fecha_cierre, publicada) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [curso_id, titulo.trim(), instrucciones || null, tiempo_minutos || 60, fecha_apertura || null, fecha_cierre || null, publicada ? 1 : 0]
        );
        const evalId = result.insertId;

        if (Array.isArray(preguntas) && preguntas.length > 0) {
            for (let i = 0; i < preguntas.length; i++) {
                const p = preguntas[i];
                await pool.query(
                    'INSERT INTO preguntas (evaluacion_id, tipo, texto, opciones, respuesta_correcta, puntaje, orden) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [evalId, p.tipo || 'multiple', p.texto, p.opciones ? JSON.stringify(p.opciones) : null, p.respuesta_correcta ?? null, p.puntaje || 1, i]
                );
            }
        }

        res.json({ success: true, id: evalId });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al crear evaluación' }); }
});

// Obtener evaluación completa con preguntas
app.get('/api/evaluaciones/:id', verifyToken, async (req, res) => {
    try {
        const [[ev]] = await pool.query('SELECT * FROM evaluaciones WHERE id = ?', [req.params.id]);
        if (!ev) return res.status(404).json({ error: 'Evaluación no encontrada' });

        // Ocultar respuestas correctas a estudiantes
        const [pregs] = await pool.query('SELECT * FROM preguntas WHERE evaluacion_id = ? ORDER BY orden ASC', [req.params.id]);
        if (req.usuario.rol === 'estudiante') {
            pregs.forEach(p => { delete p.respuesta_correcta; });
        }
        pregs.forEach(p => { if (p.opciones) p.opciones = JSON.parse(p.opciones); });

        ev.preguntas = pregs;
        res.json(ev);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener evaluación' }); }
});

// Iniciar intento (o recuperar existente si ya inició)
app.post('/api/evaluaciones/:id/iniciar', verifyToken, async (req, res) => {
    try {
        const [[ev]] = await pool.query('SELECT * FROM evaluaciones WHERE id = ?', [req.params.id]);
        if (!ev) return res.status(404).json({ error: 'Evaluación no encontrada' });
        if (!ev.publicada) return res.status(403).json({ error: 'Evaluación no publicada' });

        const [[existing]] = await pool.query(
            'SELECT * FROM intentos WHERE evaluacion_id = ? AND usuario_id = ?',
            [req.params.id, req.usuario.id]
        );

        if (existing) {
            if (existing.entregado_en) return res.status(409).json({ error: 'Ya entregaste esta evaluación', intento_id: existing.id });
            return res.json({ intento_id: existing.id, ya_iniciado: true });
        }

        const [result] = await pool.query(
            'INSERT INTO intentos (evaluacion_id, usuario_id) VALUES (?, ?)',
            [req.params.id, req.usuario.id]
        );
        res.json({ intento_id: result.insertId, ya_iniciado: false });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al iniciar evaluación' }); }
});

// Entregar respuestas y calcular puntaje automático
app.post('/api/intentos/:id/entregar', verifyToken, async (req, res) => {
    try {
        const [[intento]] = await pool.query('SELECT * FROM intentos WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuario.id]);
        if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });
        if (intento.entregado_en) return res.status(409).json({ error: 'Ya entregado' });

        const { respuestas } = req.body; // [{ pregunta_id, opcion_seleccionada, texto_respuesta }]
        const [pregs] = await pool.query('SELECT * FROM preguntas WHERE evaluacion_id = ?', [intento.evaluacion_id]);

        let puntajeObtenido = 0;
        let puntajeTotal = 0;

        for (const p of pregs) {
            puntajeTotal += parseFloat(p.puntaje);
            const resp = (respuestas || []).find(r => r.pregunta_id === p.id);
            if (!resp) {
                await pool.query('INSERT INTO respuestas (intento_id, pregunta_id) VALUES (?, ?)', [intento.id, p.id]);
                continue;
            }

            let puntajeAsignado = null;
            // Auto-corrección solo para múltiple choice
            if (p.tipo === 'multiple' && p.respuesta_correcta !== null) {
                puntajeAsignado = resp.opcion_seleccionada === p.respuesta_correcta ? parseFloat(p.puntaje) : 0;
                puntajeObtenido += puntajeAsignado;
            }

            await pool.query(
                'INSERT INTO respuestas (intento_id, pregunta_id, opcion_seleccionada, texto_respuesta, puntaje_asignado) VALUES (?, ?, ?, ?, ?)',
                [intento.id, p.id, resp.opcion_seleccionada ?? null, resp.texto_respuesta || null, puntajeAsignado]
            );
        }

        await pool.query(
            'UPDATE intentos SET entregado_en = NOW(), puntaje_obtenido = ?, puntaje_total = ? WHERE id = ?',
            [puntajeObtenido, puntajeTotal, intento.id]
        );

        res.json({ success: true, puntaje_obtenido: puntajeObtenido, puntaje_total: puntajeTotal });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al entregar evaluación' }); }
});

// Ver resultado de un intento
app.get('/api/intentos/:id/resultado', verifyToken, async (req, res) => {
    try {
        const [[intento]] = await pool.query('SELECT * FROM intentos WHERE id = ? AND usuario_id = ?', [req.params.id, req.usuario.id]);
        if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });
        if (!intento.entregado_en) return res.status(400).json({ error: 'La evaluación aún no fue entregada' });

        const [respuestas] = await pool.query(`
            SELECT r.*, p.texto as pregunta_texto, p.tipo, p.puntaje as puntaje_max, p.respuesta_correcta, p.opciones
            FROM respuestas r
            JOIN preguntas p ON r.pregunta_id = p.id
            WHERE r.intento_id = ?
            ORDER BY p.orden ASC
        `, [req.params.id]);

        respuestas.forEach(r => { if (r.opciones) r.opciones = JSON.parse(r.opciones); });

        res.json({ ...intento, respuestas });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener resultado' }); }
});

// Listar intentos entregados de una evaluación (profesor/admin)
app.get('/api/evaluaciones/:id/intentos', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [intentos] = await pool.query(`
            SELECT i.id, i.usuario_id, i.iniciado_en, i.entregado_en, i.puntaje_obtenido, i.puntaje_total,
                   u.nombre as estudiante_nombre, u.email as estudiante_email,
                   (SELECT COUNT(*) FROM respuestas r
                    JOIN preguntas p ON r.pregunta_id = p.id
                    WHERE r.intento_id = i.id AND p.tipo != 'multiple' AND r.puntaje_asignado IS NULL) as pendiente_revision
            FROM intentos i
            JOIN usuarios u ON i.usuario_id = u.id
            WHERE i.evaluacion_id = ? AND i.entregado_en IS NOT NULL
            ORDER BY i.entregado_en DESC
        `, [req.params.id]);
        res.json(intentos);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener intentos' }); }
});

// Ver intento completo con respuestas (profesor/admin)
app.get('/api/intentos/:id/revisar', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [[intento]] = await pool.query(`
            SELECT i.*, u.nombre as estudiante_nombre, u.email as estudiante_email, e.titulo as eval_titulo
            FROM intentos i
            JOIN usuarios u ON i.usuario_id = u.id
            JOIN evaluaciones e ON i.evaluacion_id = e.id
            WHERE i.id = ?
        `, [req.params.id]);
        if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });

        const [respuestas] = await pool.query(`
            SELECT r.id, r.pregunta_id, r.opcion_seleccionada, r.texto_respuesta, r.puntaje_asignado,
                   p.texto as pregunta_texto, p.tipo, p.puntaje as puntaje_max,
                   p.respuesta_correcta, p.opciones, p.orden
            FROM respuestas r
            JOIN preguntas p ON r.pregunta_id = p.id
            WHERE r.intento_id = ?
            ORDER BY p.orden ASC
        `, [req.params.id]);

        respuestas.forEach(r => { if (r.opciones) r.opciones = JSON.parse(r.opciones); });
        res.json({ ...intento, respuestas });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al revisar intento' }); }
});

// Calificar preguntas de desarrollo/rúbrica (profesor/admin)
app.put('/api/intentos/:id/calificar', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [[intento]] = await pool.query('SELECT * FROM intentos WHERE id = ?', [req.params.id]);
        if (!intento) return res.status(404).json({ error: 'Intento no encontrado' });

        const { calificaciones } = req.body;
        if (!Array.isArray(calificaciones) || calificaciones.length === 0)
            return res.status(400).json({ error: 'calificaciones requerido' });

        for (const c of calificaciones) {
            const pts = parseFloat(c.puntaje_asignado);
            if (isNaN(pts) || pts < 0) continue;
            await pool.query(
                'UPDATE respuestas SET puntaje_asignado = ? WHERE id = ? AND intento_id = ?',
                [pts, c.respuesta_id, req.params.id]
            );
        }

        const [[sum]] = await pool.query(
            'SELECT COALESCE(SUM(puntaje_asignado),0) as total FROM respuestas WHERE intento_id = ?',
            [req.params.id]
        );
        await pool.query('UPDATE intentos SET puntaje_obtenido = ? WHERE id = ?', [sum.total, req.params.id]);

        res.json({ ok: true, puntaje_obtenido: sum.total });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al calificar' }); }
});

// Stats globales para admin
app.get('/api/admin/stats', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [[stats]] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM usuarios WHERE rol = 'estudiante') as estudiantes,
                (SELECT COUNT(*) FROM usuarios WHERE rol = 'profesor') as profesores,
                (SELECT COUNT(*) FROM cursos WHERE estado = 'publicado') as cursos_publicados,
                (SELECT COUNT(*) FROM inscripciones WHERE creado_en > DATE_SUB(NOW(), INTERVAL 30 DAY)) as inscripciones_mes
        `);
        res.json(stats);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener stats' }); }
});

// Listar todas las inscripciones (admin)
app.get('/api/admin/inscripciones', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [rows] = await pool.query(`
            SELECT i.id, i.creado_en,
                   u.id as usuario_id, u.nombre as usuario_nombre, u.email as usuario_email,
                   c.id as curso_id, c.titulo as curso_titulo, c.estado as curso_estado
            FROM inscripciones i
            JOIN usuarios u ON i.usuario_id = u.id
            JOIN cursos c ON i.curso_id = c.id
            ORDER BY i.creado_en DESC
        `);
        res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener inscripciones' }); }
});

// Inscribir manualmente (admin)
app.post('/api/admin/inscripciones', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    const { usuario_id, curso_id } = req.body;
    if (!usuario_id || !curso_id) return res.status(400).json({ error: 'usuario_id y curso_id requeridos' });
    try {
        await pool.query('INSERT IGNORE INTO inscripciones (usuario_id, curso_id) VALUES (?, ?)', [usuario_id, curso_id]);
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al inscribir' }); }
});

// Eliminar inscripción (admin)
app.delete('/api/admin/inscripciones/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        await pool.query('DELETE FROM inscripciones WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al eliminar inscripción' }); }
});

// Materiales descargables del estudiante (lecciones tipo arquivo)
app.get('/api/mis-materiales', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT l.id, l.titulo, l.descripcion, l.video_url as url, l.tipo,
                   c.id as curso_id, c.titulo as curso_titulo,
                   m.titulo as modulo_titulo
            FROM lecciones l
            JOIN modulos m ON l.modulo_id = m.id
            JOIN cursos c ON m.curso_id = c.id
            JOIN inscripciones i ON c.id = i.curso_id
            WHERE i.usuario_id = ? AND l.tipo = 'arquivo'
            ORDER BY c.titulo, m.titulo, l.orden
        `, [req.usuario.id]);
        res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener materiales' }); }
});

// Ranking de estudiantes por lecciones completadas
app.get('/api/ranking', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.id, u.nombre,
                   COUNT(DISTINCT pl.leccion_id) as lecciones_completadas,
                   COUNT(DISTINCT i.curso_id) as cursos_inscritos
            FROM usuarios u
            LEFT JOIN progreso_lecciones pl ON u.id = pl.usuario_id
            LEFT JOIN inscripciones i ON u.id = i.usuario_id
            WHERE u.rol = 'estudiante' AND u.activo = 1
            GROUP BY u.id, u.nombre
            ORDER BY lecciones_completadas DESC, cursos_inscritos DESC
            LIMIT 20
        `);
        res.json({ ranking: rows, mi_id: req.usuario.id });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener ranking' }); }
});

// Actualizar perfil (nombre y email)
app.put('/api/usuarios/perfil', verifyToken, async (req, res) => {
    const { nombre, email } = req.body;
    if (!validStr(nombre, 2, 100)) return res.status(400).json({ error: 'Nombre inválido' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Email inválido' });
    try {
        const [[dup]] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email.trim(), req.usuario.id]);
        if (dup) return res.status(409).json({ error: 'Ese correo ya está en uso por otra cuenta' });
        await pool.query('UPDATE usuarios SET nombre = ?, email = ? WHERE id = ?', [nombre.trim(), email.trim(), req.usuario.id]);
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al actualizar perfil' }); }
});

// Cambiar contraseña
app.put('/api/usuarios/password', verifyToken, async (req, res) => {
    const { password_actual, password_nuevo } = req.body;
    if (!validStr(password_nuevo, 6, 100)) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    try {
        const [[u]] = await pool.query('SELECT password FROM usuarios WHERE id = ?', [req.usuario.id]);
        const ok = await bcrypt.compare(password_actual || '', u.password);
        if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        const hash = await bcrypt.hash(password_nuevo, 10);
        await pool.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, req.usuario.id]);
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al cambiar contraseña' }); }
});

// ── Clases en Vivo ──────────────────────────────────────────────────────────

// Listar clases (estudiantes: próximas + grabaciones; todos los logueados)
app.get('/api/clases-vivo', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT cv.*, u.nombre as profesor_nombre,
                   c.titulo as curso_titulo
            FROM clases_vivo cv
            JOIN usuarios u ON cv.creado_por = u.id
            LEFT JOIN cursos c ON cv.curso_id = c.id
            ORDER BY cv.fecha_inicio DESC
        `);
        res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al obtener clases' }); }
});

// Helper: link a clase_vivo to a curriculum module (creates lesson if not already linked)
async function linkClaseToModulo(claseId, moduloId, titulo) {
    const ref = `clase_vivo:${claseId}`;
    const [[existing]] = await pool.query(
        'SELECT id FROM lecciones WHERE modulo_id = ? AND video_url = ?', [moduloId, ref]
    );
    if (existing) return; // already linked
    const [[{ maxOrden }]] = await pool.query(
        'SELECT COALESCE(MAX(orden),0) as maxOrden FROM lecciones WHERE modulo_id = ?', [moduloId]
    );
    await pool.query(
        `INSERT INTO lecciones (modulo_id, titulo, descripcion, video_url, tipo, orden)
         VALUES (?, ?, '', ?, 'clase_vivo', ?)`,
        [moduloId, titulo, ref, maxOrden + 1]
    );
}

// Normalize meet URL — ensure https:// prefix
function normalizeMeetUrl(url) {
    if (!url) return null;
    const u = url.trim();
    if (!u) return null;
    if (u.startsWith('http://') || u.startsWith('https://')) return u;
    return 'https://' + u;
}

// Crear clase (prof o admin)
app.post('/api/clases-vivo', verifyToken, async (req, res) => {
    if (!['admin','profesor'].includes(req.usuario.rol)) return res.status(403).json({ error: 'Sin permiso' });
    const { titulo, descripcion, fecha_inicio, duracion_min, meet_url, curso_id, modulo_id } = req.body;
    if (!validStr(titulo, 3, 255)) return res.status(400).json({ error: 'Título requerido' });
    if (!fecha_inicio) return res.status(400).json({ error: 'Fecha requerida' });
    try {
        const [r] = await pool.query(
            `INSERT INTO clases_vivo (titulo, descripcion, fecha_inicio, duracion_min, meet_url, curso_id, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [titulo.trim(), descripcion||null, fecha_inicio, duracion_min||60, normalizeMeetUrl(meet_url), curso_id||null, req.usuario.id]
        );
        const claseId = r.insertId;
        // Auto-add to curriculum if module selected
        if (modulo_id) {
            await linkClaseToModulo(claseId, modulo_id, titulo.trim());
        }
        res.status(201).json({ id: claseId });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al crear clase' }); }
});

// Actualizar clase — también para agregar youtube_id tras la clase
app.put('/api/clases-vivo/:id', verifyToken, async (req, res) => {
    if (!['admin','profesor'].includes(req.usuario.rol)) return res.status(403).json({ error: 'Sin permiso' });
    const { titulo, descripcion, fecha_inicio, duracion_min, meet_url, youtube_id, estado, curso_id, modulo_id } = req.body;
    try {
        const [[cl]] = await pool.query('SELECT * FROM clases_vivo WHERE id = ?', [req.params.id]);
        if (!cl) return res.status(404).json({ error: 'Clase no encontrada' });
        if (req.usuario.rol !== 'admin' && cl.creado_por !== req.usuario.id)
            return res.status(403).json({ error: 'Solo puedes editar tus clases' });
        const newTitulo = titulo || cl.titulo;
        await pool.query(
            `UPDATE clases_vivo SET titulo=?, descripcion=?, fecha_inicio=?, duracion_min=?,
             meet_url=?, youtube_id=?, estado=?, curso_id=? WHERE id=?`,
            [newTitulo, descripcion??cl.descripcion, fecha_inicio||cl.fecha_inicio,
             duracion_min||cl.duracion_min, meet_url!==undefined ? normalizeMeetUrl(meet_url) : cl.meet_url, youtube_id??cl.youtube_id,
             estado||cl.estado, curso_id??cl.curso_id, req.params.id]
        );
        // Also update lesson title in curriculum and link to new module if provided
        const ref = `clase_vivo:${req.params.id}`;
        await pool.query('UPDATE lecciones SET titulo=? WHERE video_url=?', [newTitulo, ref]);
        if (modulo_id) {
            await linkClaseToModulo(req.params.id, modulo_id, newTitulo);
        }
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al actualizar clase' }); }
});

// Eliminar clase (admin)
app.delete('/api/clases-vivo/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        await pool.query('DELETE FROM clases_vivo WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al eliminar' }); }
});

// Any Uncaught API routes return 404
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Frontend fallback
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
