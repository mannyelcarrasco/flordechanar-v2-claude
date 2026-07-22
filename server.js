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
app.use(express.urlencoded({ extended: true }));
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
const DB_NAME = process.env.DB_NAME || 'flordechanar';
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
let dbInitError = null;

async function initDB() {
    // Crear el pool PRIMERO y directo a la BASE DE DATOS. createPool es lazy (no conecta hasta la
    // primera query), así que 'pool' SIEMPRE queda asignado. Antes el código se conectaba SIN
    // especificar base de datos para intentar CREATE DATABASE, y recién después creaba el pool —
    // pero en hosting compartido (Hostinger) el usuario está restringido a su propia BD: conectar
    // sin especificarla falla, y como ese paso iba ANTES del pool, el pool quedaba null y TODA la
    // app devolvía "Database not connected". La BD ya existe (creada en el panel), así que el paso
    // de CREATE DATABASE ya no hace falta.
    pool = mysql.createPool({ ...dbConfig, database: DB_NAME });
    try {
        console.log(`Connecting to MySQL DB "${DB_NAME}"...`);
        await pool.query('SELECT 1'); // valida que la conexión real funcione
        console.log('Connected.');

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS planes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(150) NOT NULL,
                descripcion TEXT,
                periodo ENUM('mensual','anual','unico') DEFAULT 'mensual',
                monto INT NOT NULL,
                descuento_pct INT DEFAULT 0,
                flow_plan_id VARCHAR(100) DEFAULT NULL,
                activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pagos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                tipo ENUM('matricula','curso','suscripcion') NOT NULL,
                referencia_id INT DEFAULT NULL,
                monto INT NOT NULL,
                estado ENUM('pendiente','aprobado','rechazado','anulado') DEFAULT 'pendiente',
                commerce_order VARCHAR(120) UNIQUE,
                flow_token VARCHAR(200),
                flow_order VARCHAR(100),
                metodo_pago VARCHAR(50),
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                confirmado_en DATETIME DEFAULT NULL,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS flow_customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL UNIQUE,
                flow_customer_id VARCHAR(100) NOT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS suscripciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                plan_id INT NOT NULL,
                flow_subscription_id VARCHAR(100) DEFAULT NULL,
                flow_customer_id VARCHAR(100) DEFAULT NULL,
                estado ENUM('pendiente','activa','cancelada','suspendida') DEFAULT 'pendiente',
                inicio_en DATETIME DEFAULT NULL,
                proximo_cobro DATETIME DEFAULT NULL,
                cancelada_en DATETIME DEFAULT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (plan_id) REFERENCES planes(id)
            )
        `);

        console.log('Tables checked/created: evaluaciones, preguntas, intentos, respuestas.');

        // Each statement in its own try/catch — "Duplicate column" errors are harmless
        const alterCols = [
            // ADD instead of MODIFY — if the column already exists the error is caught silently;
            // if it doesn't exist (old DB), this creates it correctly.
            `ALTER TABLE lecciones ADD COLUMN tipo VARCHAR(20) DEFAULT 'video'`,
            `ALTER TABLE lecciones ADD COLUMN duracion VARCHAR(50)`,
            `ALTER TABLE lecciones ADD COLUMN visibilidad VARCHAR(10) DEFAULT 'privada'`,
            `ALTER TABLE cursos MODIFY COLUMN estado ENUM('borrador','publicado','archivado','interno') DEFAULT 'borrador'`,
            `ALTER TABLE cursos ADD COLUMN tipo_acceso VARCHAR(20) DEFAULT 'gratis'`,
            `ALTER TABLE cursos ADD COLUMN categoria VARCHAR(100)`,
            `ALTER TABLE cursos ADD COLUMN nivel VARCHAR(50)`,
            `ALTER TABLE cursos ADD COLUMN duracion_total VARCHAR(100)`,
            `ALTER TABLE cursos ADD COLUMN idioma VARCHAR(50)`,
            `ALTER TABLE cursos ADD COLUMN descripcion_ventas LONGTEXT`,
            `ALTER TABLE cursos ADD COLUMN ventas_meta JSON`,
            `ALTER TABLE cursos ADD COLUMN certificacion BOOLEAN DEFAULT FALSE`,
            `ALTER TABLE cursos ADD COLUMN modalidad VARCHAR(50) DEFAULT 'Online (Grabado)'`,
            `ALTER TABLE usuarios ADD COLUMN matriculado BOOLEAN DEFAULT FALSE`,
            `ALTER TABLE usuarios ADD COLUMN matriculado_en DATETIME DEFAULT NULL`,
            `ALTER TABLE inscripciones ADD COLUMN pago_id INT DEFAULT NULL`,
            `ALTER TABLE planes ADD COLUMN curso_id INT DEFAULT NULL`
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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS foro_posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                usuario_id INT NOT NULL,
                contenido TEXT NOT NULL,
                tag VARCHAR(30) DEFAULT 'duda',
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS foro_respuestas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                usuario_id INT NOT NULL,
                contenido TEXT NOT NULL,
                creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (post_id) REFERENCES foro_posts(id) ON DELETE CASCADE,
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS foro_likes (
                usuario_id INT NOT NULL,
                post_id INT NOT NULL,
                PRIMARY KEY (usuario_id, post_id),
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
                FOREIGN KEY (post_id) REFERENCES foro_posts(id) ON DELETE CASCADE
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                clave VARCHAR(100) PRIMARY KEY,
                valor TEXT
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS paginas (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                titulo      VARCHAR(300) NOT NULL,
                slug        VARCHAR(300) NOT NULL UNIQUE,
                contenido   LONGTEXT,
                extracto    TEXT,
                meta_desc   VARCHAR(500),
                portada_url VARCHAR(500),
                estado      ENUM('publicado','borrador') DEFAULT 'borrador',
                orden       INT DEFAULT 0,
                creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log('Tables checked/created: usuarios, cursos, inscripciones, modulos, lecciones, progreso_lecciones.');

        const [rows] = await pool.query('SELECT * FROM usuarios WHERE email = "admin@flordechanar.cl"');
        const hash = await bcrypt.hash('admin123', 10);
        if (rows.length === 0) {
            await pool.query(
                'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
                ['Administrador Principal', 'admin@flordechanar.cl', hash, 'admin']
            );
            console.log('Default admin created: admin@flordechanar.cl / admin123');
        } else {
            await pool.query('UPDATE usuarios SET password = ? WHERE email = "admin@flordechanar.cl"', [hash]);
            console.log('Admin password forcefully reset to admin123');
        }

    } catch (err) {
        dbInitError = err;
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

// --- Helpers de IA ---
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (e) { console.warn("pdf-parse no instalado aún"); }

app.post('/api/ai/generar-ventas', verifyToken, (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        
        try {
            const { titulo, modulosText, extraContext } = req.body;
            let fullContext = `Título del curso: ${titulo || 'Sin título'}\n\n`;
            if (modulosText) {
                fullContext += `Temario (Módulos):\n${modulosText}\n\n`;
            }
            if (extraContext) {
                fullContext += `Contexto Adicional:\n${extraContext}\n\n`;
            }

            // Procesar PDF si existe
            if (req.file) {
                if (req.file.mimetype === 'application/pdf') {
                    if (!pdfParse) return res.status(500).json({ error: "Librería pdf-parse no está instalada" });
                    const dataBuffer = fs.readFileSync(req.file.path);
                    const pdfData = await pdfParse(dataBuffer);
                    fullContext += `Contenido del documento PDF:\n${pdfData.text}\n\n`;
                }
                // Limpiar el archivo subido para no ocupar espacio
                fs.unlinkSync(req.file.path);
            }

            const prompt = `Eres un experto copywriter de ventas para cursos educativos de terapias holísticas y naturales. 
Con la siguiente información del curso, redacta una página de ventas (landing page) persuasiva, estructurada en HTML limpio (usando <h2>, <h3>, <ul>, <p>, y <strong>). 
No incluyas etiquetas <html>, <head> o <body>, solo el contenido. 
Estructura sugerida:
1. Párrafo introductorio enganchador (dolor/solución).
2. "Para quién es este curso".
3. "Qué lograrás".
4. Breve resumen de por qué la metodología es la mejor.
Usa un tono profesional, inspirador y empático.

Información del curso:
${fullContext}`;

            const openaiKey = process.env.OPENAI_API_KEY;
            const geminiKey = process.env.GEMINI_API_KEY;
            let aiResponse = "";

            if (openaiKey) {
                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                    body: JSON.stringify({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: "Eres un copywriter experto en marketing educativo." },
                            { role: "user", content: prompt }
                        ]
                    })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                aiResponse = data.choices[0].message.content;

            } else if (geminiKey) {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                aiResponse = data.candidates[0].content.parts[0].text;
            } else {
                return res.status(500).json({ error: "No hay ninguna API Key de IA configurada en el servidor (.env)" });
            }

            // Remove markdown code block wrapping if present
            aiResponse = aiResponse.replace(/^```html/i, '').replace(/```$/i, '').trim();

            res.json({ result: aiResponse });

        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message || "Error al generar texto" });
        }
    });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validEmail(e) { return typeof e === 'string' && EMAIL_RE.test(e.trim()); }
function validStr(s, min = 1, max = 300) { return typeof s === 'string' && s.trim().length >= min && s.trim().length <= max; }

// --- Auth Routes ---
app.post('/api/auth/register', loginLimiter, async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        if (!nombre?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Todos los campos son requeridos' });
        if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        if (!validEmail(email)) return res.status(400).json({ error: 'Email inválido' });
        const [existing] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase().trim()]);
        if (existing.length) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            "INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, 'estudiante')",
            [nombre.trim(), email.toLowerCase().trim(), hash]
        );
        const token = jwt.sign(
            { id: result.insertId, nombre: nombre.trim(), email: email.toLowerCase().trim(), rol: 'estudiante' },
            process.env.JWT_SECRET || 'fallback_secret_flordechanar',
            { expiresIn: '7d' }
        );
        res.json({ token, rol: 'estudiante', nombre: nombre.trim() });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear la cuenta' });
    }
});

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
            { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, email: usuario.email },
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

// Editar usuario (admin)
app.put('/api/usuarios/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { nombre, email, rol, password } = req.body;
        const rolesPermitidos = ['estudiante', 'profesor', 'admin'];
        if (!validStr(nombre, 2, 150)) return res.status(400).json({ error: 'Nombre inválido' });
        if (!validEmail(email)) return res.status(400).json({ error: 'Email inválido' });
        if (rol && !rolesPermitidos.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query('UPDATE usuarios SET nombre=?, email=?, rol=?, password=? WHERE id=?',
                [nombre, email, rol || 'estudiante', hash, req.params.id]);
        } else {
            await pool.query('UPDATE usuarios SET nombre=?, email=?, rol=? WHERE id=?',
                [nombre, email, rol || 'estudiante', req.params.id]);
        }
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'El email ya está en uso' });
        res.status(500).json({ error: 'Error al actualizar usuario' });
    }
});

// Activar / Suspender usuario (admin)
app.patch('/api/usuarios/:id/activo', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    const { activo } = req.body;
    try {
        await pool.query('UPDATE usuarios SET activo=? WHERE id=?', [activo ? 1 : 0, req.params.id]);
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error' }); }
});

// --- Rutas de Cursos y LMS ---

app.get('/api/cursos', async (req, res) => {
    try {
        if (!pool) return res.status(500).json({ error: 'Database not connected' });
        const [cursos] = await pool.query('SELECT c.id, c.titulo, c.descripcion, c.precio, c.tipo_acceso, c.portada_url, u.nombre as profesor FROM cursos c LEFT JOIN usuarios u ON c.profesor_id = u.id WHERE c.estado = "publicado"');
        res.json(cursos);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener cursos' });
    }
});

app.post('/api/cursos', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { titulo, descripcion, precio, tipo_acceso, portada_url, estado, profesor_id, categoria, nivel, duracion_total, idioma, certificacion, modalidad, descripcion_ventas, ventas_meta } = req.body;
        if (!validStr(titulo, 3, 300)) return res.status(400).json({ error: 'Título del curso requerido (3-300 caracteres)' });
        const estadosPermitidos = ['borrador', 'publicado', 'archivado', 'interno'];
        if (estado && !estadosPermitidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
        
        let profAsignado = req.usuario.rol === 'admin' ? (profesor_id || req.usuario.id) : req.usuario.id;
        let vMetaStr = null;
        if(ventas_meta) {
            vMetaStr = typeof ventas_meta === 'object' ? JSON.stringify(ventas_meta) : ventas_meta;
        }

        const [result] = await pool.query(
            'INSERT INTO cursos (titulo, descripcion, precio, tipo_acceso, portada_url, estado, profesor_id, categoria, nivel, duracion_total, idioma, certificacion, modalidad, descripcion_ventas, ventas_meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [titulo, descripcion, precio, tipo_acceso || 'gratis', portada_url, estado, profAsignado, categoria||null, nivel||null, duracion_total||null, idioma||null, certificacion ? 1 : 0, modalidad||'Online (Grabado)', descripcion_ventas||null, vMetaStr]
        );
        res.json({ success: true, id: result.insertId });
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
        const [cursos] = await pool.query('SELECT tipo_acceso, precio FROM cursos WHERE id = ?', [curso_id]);
        if (!cursos.length) return res.status(404).json({ error: 'Curso no encontrado' });
        const { tipo_acceso, precio } = cursos[0];
        if (tipo_acceso === 'pago_unico' && precio > 0) {
            const [pagos] = await pool.query(
                "SELECT id FROM pagos WHERE usuario_id = ? AND tipo = 'curso' AND referencia_id = ? AND estado = 'aprobado'",
                [req.usuario.id, curso_id]
            );
            if (!pagos.length) return res.status(402).json({ error: 'Este curso requiere pago previo', tipo_acceso, precio });
        }
        if (tipo_acceso === 'suscripcion') {
            const [sub] = await pool.query("SELECT id FROM suscripciones WHERE usuario_id = ? AND estado = 'activa'", [req.usuario.id]);
            if (!sub.length) return res.status(402).json({ error: 'Este curso requiere suscripción activa', tipo_acceso });
        }
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

// Obtener Curso Público por ID (Para la Landing Page)
app.get('/api/cursos/publico/:id', async (req, res) => {
    try {
        const [cursos] = await pool.query(
            `SELECT c.*, u.nombre as profesor_nombre
             FROM cursos c
             LEFT JOIN usuarios u ON c.profesor_id = u.id
             WHERE c.id = ? AND c.estado IN ('publicado', 'interno')`,
            [req.params.id]
        );
        if (cursos.length === 0) return res.status(404).json({ error: 'Curso no encontrado o no disponible' });
        
        const curso = cursos[0];
        const [planes] = await pool.query('SELECT * FROM planes WHERE curso_id = ? AND activo = 1', [curso.id]);
        curso.planes = planes;
        
        res.json(curso);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error interno' });
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
        const { titulo, descripcion, precio, tipo_acceso, portada_url, estado, profesor_id, categoria, nivel, duracion_total, idioma, certificacion, modalidad, descripcion_ventas, ventas_meta } = req.body;
        let profAsignado = req.usuario.rol === 'admin' ? (profesor_id || req.usuario.id) : req.usuario.id;

        let vMetaStr = null;
        if(ventas_meta) {
            vMetaStr = typeof ventas_meta === 'object' ? JSON.stringify(ventas_meta) : ventas_meta;
        }

        await pool.query(
            'UPDATE cursos SET titulo=?, descripcion=?, precio=?, tipo_acceso=?, portada_url=?, estado=?, profesor_id=?, categoria=?, nivel=?, duracion_total=?, idioma=?, certificacion=?, modalidad=?, descripcion_ventas=?, ventas_meta=? WHERE id=?',
            [titulo, descripcion, precio, tipo_acceso || 'gratis', portada_url, estado, profAsignado, categoria||null, nivel||null, duracion_total||null, idioma||null, certificacion ? 1 : 0, modalidad||'Online (Grabado)', descripcion_ventas||null, vMetaStr, req.params.id]
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
        const cid = req.params.id;
        
        // Manual cascading delete to prevent foreign key issues on strict DBs without CASCADE
        await pool.query('DELETE FROM progreso_lecciones WHERE leccion_id IN (SELECT id FROM lecciones WHERE modulo_id IN (SELECT id FROM modulos WHERE curso_id = ?))', [cid]);
        await pool.query('DELETE FROM lecciones WHERE modulo_id IN (SELECT id FROM modulos WHERE curso_id = ?)', [cid]);
        await pool.query('DELETE FROM modulos WHERE curso_id = ?', [cid]);
        
        await pool.query('DELETE FROM respuestas WHERE intento_id IN (SELECT id FROM intentos WHERE evaluacion_id IN (SELECT id FROM evaluaciones WHERE curso_id = ?))', [cid]);
        await pool.query('DELETE FROM intentos WHERE evaluacion_id IN (SELECT id FROM evaluaciones WHERE curso_id = ?)', [cid]);
        await pool.query('DELETE FROM preguntas WHERE evaluacion_id IN (SELECT id FROM evaluaciones WHERE curso_id = ?)', [cid]);
        await pool.query('DELETE FROM evaluaciones WHERE curso_id = ?', [cid]);

        await pool.query('DELETE FROM inscripciones WHERE curso_id = ?', [cid]);
        await pool.query('DELETE FROM clases_vivo WHERE curso_id = ?', [cid]);
        
        await pool.query('DELETE FROM cursos WHERE id = ?', [cid]);
        res.json({ success: true, message: 'Curso eliminado' });
    } catch (e) {
        console.error('DELETE ERROR:', e);
        res.status(500).json({ error: e.message || 'Error al eliminar curso' });
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

// ── Libro de notas: estudiantes + sus calificaciones por curso ────────────
app.get('/api/profesor/cursos/:id/notas', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Sin acceso' });
    try {
        const cursoId = req.params.id;

        // Estudiantes activos en el curso
        const [estudiantes] = await pool.query(
            `SELECT u.id, u.nombre
             FROM inscripciones i
             JOIN usuarios u ON u.id = i.usuario_id
             WHERE i.curso_id = ? AND i.estado = 'activo'
             ORDER BY u.nombre`,
            [cursoId]
        );

        // Evaluaciones del curso
        const [evals] = await pool.query(
            `SELECT id, titulo FROM evaluaciones WHERE curso_id = ? ORDER BY id`,
            [cursoId]
        );

        // Total de lecciones del curso (para calcular progreso)
        const [[{ totalLec }]] = await pool.query(
            `SELECT COUNT(*) AS totalLec FROM lecciones l
             JOIN modulos m ON m.id = l.modulo_id WHERE m.curso_id = ?`,
            [cursoId]
        );

        // Para cada estudiante: mejor nota por evaluación + porcentaje de avance
        const estudiantesConNotas = await Promise.all(
            estudiantes.map(async (est) => {
                const grades = await Promise.all(
                    evals.map(async (ev) => {
                        const [[row]] = await pool.query(
                            `SELECT nota FROM intentos
                             WHERE evaluacion_id = ? AND usuario_id = ? AND estado = 'entregado'
                             ORDER BY nota DESC LIMIT 1`,
                            [ev.id, est.id]
                        );
                        return row ? row.nota : null;
                    })
                );

                let progreso = 0;
                if (totalLec > 0) {
                    const [[{ completadas }]] = await pool.query(
                        `SELECT COUNT(*) AS completadas FROM progreso_lecciones pl
                         JOIN lecciones l ON l.id = pl.leccion_id
                         JOIN modulos m ON m.id = l.modulo_id
                         WHERE m.curso_id = ? AND pl.usuario_id = ? AND pl.completada = 1`,
                        [cursoId, est.id]
                    );
                    progreso = Math.round((completadas / totalLec) * 100);
                }

                return { id: est.id, nombre: est.nombre, grades, progreso };
            })
        );

        res.json({ evaluaciones: evals, estudiantes: estudiantesConNotas });
    } catch(e) {
        console.error(e);
        res.status(500).json({ error: 'Error al cargar notas' });
    }
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

app.get('/api/admin/estadisticas', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [[stats]] = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM usuarios) as total_usuarios,
                (SELECT COUNT(*) FROM cursos WHERE estado = 'publicado') as cursos_publicados,
                (SELECT COUNT(*) FROM inscripciones) as total_inscripciones
        `);
        res.json(stats);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

app.get('/api/admin/cursos', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const [cursos] = await pool.query(`
            SELECT c.*, u.nombre as profesor,
                   (SELECT COUNT(*) FROM inscripciones WHERE curso_id = c.id) as alumnos
            FROM cursos c
            LEFT JOIN usuarios u ON c.profesor_id = u.id
            ORDER BY c.creado_en DESC
        `);
        res.json(cursos);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener cursos admin' });
    }
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

// =============================================
// FORO
// =============================================
app.get('/api/foro', verifyToken, async (req, res) => {
    try {
        const [posts] = await pool.query(
            `SELECT fp.id, fp.contenido, fp.tag, fp.creado_en,
                    u.nombre AS autor,
                    (SELECT COUNT(*) FROM foro_respuestas fr WHERE fr.post_id = fp.id) AS respuestas,
                    (SELECT COUNT(*) FROM foro_likes fl WHERE fl.post_id = fp.id) AS likes,
                    (SELECT COUNT(*) > 0 FROM foro_likes fl WHERE fl.post_id = fp.id AND fl.usuario_id = ?) AS liked_by_me
             FROM foro_posts fp
             JOIN usuarios u ON fp.usuario_id = u.id
             ORDER BY fp.creado_en DESC LIMIT 60`,
            [req.usuario.id]
        );
        res.json(posts);
    } catch (e) { res.status(500).json({ error: 'Error al cargar foro' }); }
});

app.post('/api/foro', verifyToken, async (req, res) => {
    try {
        const { contenido, tag } = req.body;
        if (!contenido?.trim()) return res.status(400).json({ error: 'El contenido es requerido' });
        const [ins] = await pool.query(
            'INSERT INTO foro_posts (usuario_id, contenido, tag) VALUES (?, ?, ?)',
            [req.usuario.id, contenido.trim(), tag || 'duda']
        );
        res.json({ id: ins.insertId });
    } catch (e) { res.status(500).json({ error: 'Error al publicar' }); }
});

app.post('/api/foro/:id/like', verifyToken, async (req, res) => {
    try {
        const [ex] = await pool.query('SELECT 1 FROM foro_likes WHERE post_id=? AND usuario_id=?', [req.params.id, req.usuario.id]);
        if (ex.length) {
            await pool.query('DELETE FROM foro_likes WHERE post_id=? AND usuario_id=?', [req.params.id, req.usuario.id]);
            res.json({ liked: false });
        } else {
            await pool.query('INSERT INTO foro_likes (post_id, usuario_id) VALUES (?,?)', [req.params.id, req.usuario.id]);
            res.json({ liked: true });
        }
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/foro/:id/respuestas', verifyToken, async (req, res) => {
    try {
        const { contenido } = req.body;
        if (!contenido?.trim()) return res.status(400).json({ error: 'El contenido es requerido' });
        await pool.query('INSERT INTO foro_respuestas (post_id, usuario_id, contenido) VALUES (?,?,?)', [req.params.id, req.usuario.id, contenido.trim()]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/foro/:id/respuestas', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT fr.*, u.nombre AS autor FROM foro_respuestas fr
             JOIN usuarios u ON fr.usuario_id = u.id
             WHERE fr.post_id = ? ORDER BY fr.creado_en ASC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// =============================================
// FLOW PAYMENT GATEWAY
// =============================================
const crypto = require('crypto');
const https = require('https');

const FLOW_API_KEY    = process.env.FLOW_API_KEY    || '';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || '';
const FLOW_SANDBOX    = process.env.FLOW_SANDBOX !== 'false';
const FLOW_HOST       = FLOW_SANDBOX ? 'sandbox.flow.cl' : 'www.flow.cl';
const APP_URL         = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// DEBUG ENDPOINT PARA VERIFICAR VARIABLES (Solo desarrollo/diagnóstico)
app.get('/api/debug/env', (req, res) => {
    res.json({
        FLOW_API_KEY_LOADED: !!FLOW_API_KEY,
        FLOW_API_KEY_LENGTH: FLOW_API_KEY.length,
        FLOW_SECRET_KEY_LOADED: !!FLOW_SECRET_KEY,
        NODE_ENV: process.env.NODE_ENV,
        PROCESS_CWD: process.cwd(),
        DIRNAME: __dirname
    });
});

function flowSign(params) {
    const str = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
    return crypto.createHmac('sha256', FLOW_SECRET_KEY).update(str).digest('hex');
}

function flowRequest(method, endpoint, params) {
    return new Promise((resolve, reject) => {
        const p = { ...params, apiKey: FLOW_API_KEY };
        p.s = flowSign(p);
        let path, body;
        if (method === 'GET') {
            path = `/api/${endpoint}?${new URLSearchParams(p)}`;
            body = null;
        } else {
            path = `/api/${endpoint}`;
            body = new URLSearchParams(p).toString();
        }
        const opts = {
            hostname: FLOW_HOST, path, method,
            headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}
        };
        const req = https.request(opts, (r) => {
            let raw = '';
            r.on('data', d => raw += d);
            r.on('end', () => {
                try { resolve({ status: r.statusCode, data: JSON.parse(raw) }); }
                catch (e) { reject(new Error('Flow response: ' + raw.slice(0, 300))); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}
const flowPost = (ep, p) => flowRequest('POST', ep, p);
const flowGet  = (ep, p) => flowRequest('GET',  ep, p);

// --- Planes (public) ---
app.get('/api/planes', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM planes WHERE activo = 1 AND nombre != 'matricula' ORDER BY monto ASC");
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error al cargar planes' }); }
});

// --- Webhook: Confirmación de pago (Flow llama aquí tras pago) ---
app.post('/api/pagos/confirmar', async (req, res) => {
    res.sendStatus(200);
    const { token } = req.body;
    if (!token) return;
    try {
        const { data } = await flowGet('payment/getStatus', { token });
        if (data.status !== 2) return; // 2 = pagado
        const [rows] = await pool.query(
            'SELECT * FROM pagos WHERE commerce_order = ? OR flow_token = ? LIMIT 1',
            [data.commerceOrder, token]
        );
        if (!rows.length) return;
        const pago = rows[0];
        if (pago.estado === 'aprobado') return;
        await pool.query(
            'UPDATE pagos SET estado=?, flow_order=?, metodo_pago=?, confirmado_en=NOW(), flow_token=? WHERE id=?',
            ['aprobado', String(data.flowOrder || ''), String(data.paymentData?.media || ''), token, pago.id]
        );
        if (pago.tipo === 'matricula') {
            await pool.query('UPDATE usuarios SET matriculado=TRUE, matriculado_en=NOW() WHERE id=?', [pago.usuario_id]);
        } else if (pago.tipo === 'curso') {
            await pool.query(
                'INSERT IGNORE INTO inscripciones (usuario_id, curso_id, pago_id) VALUES (?,?,?)',
                [pago.usuario_id, pago.referencia_id, pago.id]
            );
        }
    } catch (e) { console.error('Flow confirm error:', e.message); }
});

// --- Estado de pago (cliente consulta tras retorno) ---
app.get('/api/pagos/estado', verifyToken, async (req, res) => {
    try {
        const { commerce_order } = req.query;
        const [rows] = await pool.query(
            `SELECT p.*, c.titulo AS curso_titulo FROM pagos p
             LEFT JOIN cursos c ON p.referencia_id = c.id
             WHERE p.commerce_order = ? AND p.usuario_id = ?`,
            [commerce_order, req.usuario.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Pago no encontrado' });
        res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// --- Iniciar pago de matrícula ---
app.post('/api/pagos/matricula/iniciar', verifyToken, async (req, res) => {
    try {
        const [cfgRows] = await pool.query("SELECT monto FROM planes WHERE nombre='matricula' AND activo=1 LIMIT 1");
        const monto = cfgRows.length ? cfgRows[0].monto : 50000;
        const co = `M${req.usuario.id}_${Date.now()}`;
        const [ins] = await pool.query(
            "INSERT INTO pagos (usuario_id, tipo, monto, estado, commerce_order) VALUES (?,?,?,?,?)",
            [req.usuario.id, 'matricula', monto, 'pendiente', co]
        );
        const { data } = await flowPost('payment/create', {
            commerceOrder: co, subject: 'Matrícula — Flor de Chañar',
            amount: monto, email: req.usuario.email,
            urlConfirmation: `${APP_URL}/api/pagos/confirmar`,
            urlReturn: `${APP_URL}/pago-exitoso.html?co=${co}`,
            currency: 'CLP', paymentMethod: 9
        });
        if (!data.url) throw new Error(JSON.stringify(data));
        await pool.query('UPDATE pagos SET flow_token=? WHERE id=?', [data.token, ins.insertId]);
        res.json({ redirectUrl: `${data.url}?token=${data.token}` });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al iniciar pago: ' + e.message }); }
});

// --- Iniciar pago de curso (pago único) ---
app.post('/api/pagos/curso/iniciar', verifyToken, async (req, res) => {
    try {
        const { curso_id } = req.body;
        const [cursos] = await pool.query('SELECT * FROM cursos WHERE id=?', [curso_id]);
        if (!cursos.length) return res.status(404).json({ error: 'Curso no encontrado' });
        const curso = cursos[0];
        if (!curso.precio || curso.precio <= 0) return res.status(400).json({ error: 'Curso sin precio' });
        const [dup] = await pool.query(
            "SELECT id FROM pagos WHERE usuario_id=? AND tipo='curso' AND referencia_id=? AND estado='aprobado'",
            [req.usuario.id, curso_id]
        );
        if (dup.length) return res.status(400).json({ error: 'Ya tienes acceso a este curso' });
        const co = `C${curso_id}_${req.usuario.id}_${Date.now()}`;
        const [ins] = await pool.query(
            "INSERT INTO pagos (usuario_id, tipo, referencia_id, monto, estado, commerce_order) VALUES (?,?,?,?,?,?)",
            [req.usuario.id, 'curso', curso_id, curso.precio, 'pendiente', co]
        );
        const { data } = await flowPost('payment/create', {
            commerceOrder: co, subject: `Curso: ${curso.titulo}`,
            amount: curso.precio, email: req.usuario.email,
            urlConfirmation: `${APP_URL}/api/pagos/confirmar`,
            urlReturn: `${APP_URL}/pago-exitoso.html?co=${co}`,
            currency: 'CLP', paymentMethod: 9
        });
        if (!data.url) throw new Error(JSON.stringify(data));
        await pool.query('UPDATE pagos SET flow_token=? WHERE id=?', [data.token, ins.insertId]);
        res.json({ redirectUrl: `${data.url}?token=${data.token}` });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al iniciar pago: ' + e.message }); }
});

// --- Mis pagos ---
app.get('/api/pagos/mis-pagos', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.*, c.titulo AS curso_titulo FROM pagos p
             LEFT JOIN cursos c ON p.referencia_id = c.id
             WHERE p.usuario_id=? ORDER BY p.creado_en DESC`,
            [req.usuario.id]
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// --- Estado de suscripción ---
app.get('/api/suscripciones/mi-estado', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT s.*, p.nombre AS plan_nombre, p.monto, p.periodo, p.curso_id
             FROM suscripciones s JOIN planes p ON s.plan_id = p.id
             WHERE s.usuario_id=? AND s.estado='activa' ORDER BY s.creado_en DESC LIMIT 1`,
            [req.usuario.id]
        );
        res.json(rows[0] || null);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// --- Iniciar suscripción (crea cliente + registra tarjeta) ---
app.post('/api/suscripciones/iniciar', verifyToken, async (req, res) => {
    try {
        const { plan_id } = req.body;
        const [planes] = await pool.query("SELECT * FROM planes WHERE id=? AND activo=1 AND nombre!='matricula'", [plan_id]);
        if (!planes.length) return res.status(404).json({ error: 'Plan no encontrado' });
        const plan = planes[0];

        // Obtener o crear Flow customer
        let flowCustomerId;
        const [fcRows] = await pool.query('SELECT * FROM flow_customers WHERE usuario_id=?', [req.usuario.id]);
        if (fcRows.length) {
            flowCustomerId = fcRows[0].flow_customer_id;
        } else {
            const { data: custData } = await flowPost('customer/create', {
                name: req.usuario.nombre, email: req.usuario.email, externalId: String(req.usuario.id)
            });
            if (!custData.customerId) throw new Error('Error creando cliente Flow: ' + JSON.stringify(custData));
            flowCustomerId = custData.customerId;
            await pool.query('INSERT INTO flow_customers (usuario_id, flow_customer_id) VALUES (?,?)', [req.usuario.id, flowCustomerId]);
        }

        // Crear plan en Flow si no existe
        let flowPlanId = plan.flow_plan_id;
        if (!flowPlanId) {
            const { data: planData } = await flowPost('plan/create', {
                planId: `fdc_plan_${plan.id}`, name: plan.nombre,
                amount: plan.monto, currency: 'CLP',
                interval: plan.periodo === 'anual' ? 12 : 1,
                intervalType: 'month', trial: 0
            });
            flowPlanId = planData.planId || `fdc_plan_${plan.id}`;
            await pool.query('UPDATE planes SET flow_plan_id=? WHERE id=?', [flowPlanId, plan.id]);
        }

        // Guardar suscripción pendiente
        await pool.query(
            `INSERT INTO suscripciones (usuario_id, plan_id, flow_customer_id, estado)
             VALUES (?,?,?,'pendiente')
             ON DUPLICATE KEY UPDATE flow_customer_id=VALUES(flow_customer_id), estado='pendiente'`,
            [req.usuario.id, plan.id, flowCustomerId]
        );

        // Registrar tarjeta
        const { data: regData } = await flowPost('customer/register', {
            customerId: flowCustomerId,
            url_return: `${APP_URL}/suscripcion.html?estado=ok&plan=${plan.id}`
        });
        if (!regData.url) throw new Error('Error registro tarjeta: ' + JSON.stringify(regData));
        res.json({ redirectUrl: `${regData.url}?token=${regData.token}` });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al iniciar suscripción: ' + e.message }); }
});

// --- Webhook: confirmación de registro de tarjeta ---
app.post('/api/suscripciones/confirmar-registro', async (req, res) => {
    res.sendStatus(200);
    const { token } = req.body;
    if (!token) return;
    try {
        const { data } = await flowGet('customer/getRegisterStatus', { token });
        if (data.status !== 1) return;
        const customerId = data.customerId;
        const [subRows] = await pool.query(
            `SELECT s.*, p.flow_plan_id FROM suscripciones s JOIN planes p ON s.plan_id=p.id
             WHERE s.flow_customer_id=? AND s.estado='pendiente' LIMIT 1`,
            [customerId]
        );
        if (!subRows.length) return;
        const sub = subRows[0];
        const { data: subData } = await flowPost('subscription/create', {
            planId: sub.flow_plan_id, customerId,
            start: new Date().toISOString().split('T')[0]
        });
        await pool.query(
            "UPDATE suscripciones SET estado='activa', flow_subscription_id=?, inicio_en=NOW(), proximo_cobro=? WHERE id=?",
            [subData.subscriptionId || '', subData.nextPaymentDate || null, sub.id]
        );
    } catch (e) { console.error('Sub confirm error:', e.message); }
});

// --- Webhook: renovación periódica ---
app.post('/api/suscripciones/renovacion', async (req, res) => {
    res.sendStatus(200);
    const { token } = req.body;
    if (!token) return;
    try {
        const { data } = await flowGet('payment/getStatus', { token });
        if (data.status !== 2) return;
        const [rows] = await pool.query(
            "SELECT * FROM suscripciones WHERE flow_customer_id=? AND estado='activa' LIMIT 1",
            [data.customerId]
        );
        if (!rows.length) return;
        await pool.query('UPDATE suscripciones SET proximo_cobro=? WHERE id=?', [data.nextPaymentDate || null, rows[0].id]);
        await pool.query(
            "INSERT INTO pagos (usuario_id, tipo, monto, estado, commerce_order, flow_token, metodo_pago, confirmado_en) VALUES (?,'suscripcion',?,'aprobado',?,?,?,NOW())",
            [rows[0].usuario_id, data.amount, data.commerceOrder || '', token, data.paymentData?.media || '']
        );
    } catch (e) { console.error('Sub renewal error:', e.message); }
});

// --- Cancelar suscripción ---
app.delete('/api/suscripciones/cancelar', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM suscripciones WHERE usuario_id=? AND estado='activa' LIMIT 1", [req.usuario.id]);
        if (!rows.length) return res.status(404).json({ error: 'Sin suscripción activa' });
        const sub = rows[0];
        if (sub.flow_subscription_id) {
            await flowPost('subscription/cancel', { subscriptionId: sub.flow_subscription_id }).catch(() => {});
        }
        await pool.query("UPDATE suscripciones SET estado='cancelada', cancelada_en=NOW() WHERE id=?", [sub.id]);
        res.json({ ok: true, message: 'Suscripción cancelada. Tu acceso se mantiene hasta el fin del período.' });
    } catch (e) { res.status(500).json({ error: 'Error al cancelar' }); }
});

// --- Acceso a curso ---
app.get('/api/cursos/:id/acceso', verifyToken, async (req, res) => {
    try {
        const cursoId = req.params.id;
        const userId  = req.usuario.id;
        const [cursos] = await pool.query('SELECT tipo_acceso, precio FROM cursos WHERE id=?', [cursoId]);
        if (!cursos.length) return res.status(404).json({ error: 'Curso no encontrado' });
        const { tipo_acceso, precio } = cursos[0];
        if (tipo_acceso === 'gratis' || !tipo_acceso) return res.json({ acceso: true, motivo: 'gratis' });
        const [insc] = await pool.query('SELECT id FROM inscripciones WHERE usuario_id=? AND curso_id=?', [userId, cursoId]);
        if (insc.length) return res.json({ acceso: true, motivo: 'inscrito' });
        if (tipo_acceso === 'suscripcion' || tipo_acceso === 'pago_unico') {
            const [sub] = await pool.query(
                `SELECT s.id FROM suscripciones s 
                 JOIN planes p ON s.plan_id = p.id 
                 WHERE s.usuario_id=? AND s.estado='activa' AND (p.curso_id IS NULL OR p.curso_id=?)`,
                [userId, cursoId]
            );
            if (sub.length) return res.json({ acceso: true, motivo: 'suscripcion' });
        }
        if (tipo_acceso === 'pago_unico') {
            const [pago] = await pool.query("SELECT id FROM pagos WHERE usuario_id=? AND tipo='curso' AND referencia_id=? AND estado='aprobado'", [userId, cursoId]);
            if (pago.length) return res.json({ acceso: true, motivo: 'pago' });
        }
        res.json({ acceso: false, motivo: 'sin_acceso', tipo_acceso, precio });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// --- Admin: Pagos ---
app.get('/api/admin/pagos', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        const [rows] = await pool.query(
            `SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email, c.titulo AS curso_titulo
             FROM pagos p JOIN usuarios u ON p.usuario_id=u.id
             LEFT JOIN cursos c ON p.referencia_id=c.id
             ORDER BY p.creado_en DESC LIMIT 300`
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/admin/planes', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        const [rows] = await pool.query(`
            SELECT p.*, c.titulo AS curso_nombre 
            FROM planes p 
            LEFT JOIN cursos c ON p.curso_id = c.id 
            ORDER BY p.monto ASC
        `);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.post('/api/admin/planes', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        const { nombre, descripcion, periodo, monto, descuento_pct, curso_id } = req.body;
        const cId = (curso_id && curso_id !== '') ? curso_id : null;
        if (!nombre || !monto) return res.status(400).json({ error: 'Nombre y monto requeridos' });
        const [ins] = await pool.query(
            'INSERT INTO planes (nombre, descripcion, periodo, monto, descuento_pct, curso_id) VALUES (?,?,?,?,?,?)',
            [nombre, descripcion || '', periodo || 'mensual', monto, descuento_pct || 0, cId]
        );
        res.json({ id: ins.insertId, nombre, monto, periodo, curso_id: cId });
    } catch (e) { res.status(500).json({ error: 'Error al crear plan' }); }
});

app.put('/api/admin/planes/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        const { nombre, descripcion, monto, descuento_pct, activo, curso_id } = req.body;
        const cId = (curso_id && curso_id !== '') ? curso_id : null;
        await pool.query(
            'UPDATE planes SET nombre=?, descripcion=?, monto=?, descuento_pct=?, activo=?, curso_id=? WHERE id=?',
            [nombre, descripcion, monto, descuento_pct || 0, activo ? 1 : 0, cId, req.params.id]
        );
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// ── Configuración pública (WhatsApp, etc.) ─────────────────────────────────
// GET /api/config/publica — sin autenticación, retorna wa_numero y wa_mensaje
app.get('/api/config/publica', async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT clave, valor FROM configuracion WHERE clave IN ('wa_numero','wa_mensaje','wa_activo')"
        );
        const cfg = {};
        rows.forEach(r => { cfg[r.clave] = r.valor; });
        res.json(cfg);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// GET /api/admin/config — leer toda la config (admin)
app.get('/api/admin/config', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        const [rows] = await pool.query('SELECT clave, valor FROM configuracion');
        const cfg = {};
        rows.forEach(r => { cfg[r.clave] = r.valor; });
        res.json(cfg);
    } catch (e) { res.status(500).json({ error: 'Error' }); }
});

// POST /api/admin/config — guardar/actualizar claves de config (admin)
app.post('/api/admin/config', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    try {
        const entries = Object.entries(req.body);
        if (entries.length === 0) return res.status(400).json({ error: 'Sin datos' });
        for (const [clave, valor] of entries) {
            if (valor === null || valor === '') {
                await pool.query('DELETE FROM configuracion WHERE clave = ?', [clave]);
            } else {
                await pool.query(
                    'INSERT INTO configuracion (clave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor = ?',
                    [clave, valor, valor]
                );
            }
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Error al guardar config' }); }
});

// ─── MIGRACIÓN WORDPRESS → FLORDECHANAR ─────────────────────────────────────
const WP_CURSOS = [
    { wp_id:9752, titulo:'Programa de estudio Terapeuta en Masoterapia Profesional Presencial 2026', precio:1840000, lecciones:3,  imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2025/03/Copia-de-Horario-Escolar-Universidad-Juvenil-1.jpg' },
    { wp_id:9755, titulo:'Programa de Reflexología Holística Biomagnetismo y Flores de Bach 2026',    precio:1340000, lecciones:4,  imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/02/Copia-de-Curso-de-reiki-nivel-1-4.jpg' },
    { wp_id:9603, titulo:'Curso de Terapeuta en Flores de Bach 2025',                                  precio:495000,  lecciones:18, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/01/portada_cursocompletodereflexologiapodal-Banner-para-YouTube-1440-x-900-px.jpg' },
    { wp_id:8710, titulo:'Masoterapia Profesional 2026 OnLINE',                                        precio:1240000, lecciones:15, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/04/4472777.jpg' },
    { wp_id:9375, titulo:'Curso de Reflexología Podal: Aprendizaje Paso a Paso ¡A tu Ritmo!',          precio:225000,  lecciones:12, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2021/10/imagenvideoclasegratuitarefle.png' },
    { wp_id:9251, titulo:'Reflexología Emocional',                                                      precio:495000,  lecciones:19, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2020/02/REFLEJOLO.jpg' },
    { wp_id:9186, titulo:'Reflexología Metamórfica',                                                    precio:295000,  lecciones:6,  imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2018/10/images.jpg' },
    { wp_id:8967, titulo:'Programa de estudio Terapeuta en Masoterapia Profesional Presencial 2025',   precio:1580000, lecciones:23, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2025/03/Copia-de-Horario-Escolar-Universidad-Juvenil-1.jpg' },
    { wp_id:9062, titulo:'Curso de Reflexología Podal: Aprendizaje Paso a Paso',                       precio:225000,  lecciones:13, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2021/10/imagenvideoclasegratuitarefle.png' },
    { wp_id:8588, titulo:'Curso de Terapeuta en Flores de Bach',                                       precio:495000,  lecciones:19, imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/01/portada_cursocompletodereflexologiapodal-Banner-para-YouTube-1440-x-900-px.jpg' },
    { wp_id:8507, titulo:'Programa de Terapeuta Emocional Evolutiva',                                  precio:0,       lecciones:0,  imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2023/04/2023Presentacion-tee-programadeestudios.jpg' },
    { wp_id:8013, titulo:'Curso de Formación para Terapeutas en Árbol Transgeneracional AVANZADO',     precio:0,       lecciones:0,  imagen:null },
    { wp_id:7374, titulo:'Programa de Reflexología Holística Biomagnetismo y Flores de Bach',           precio:0,       lecciones:0,  imagen:'https://i0.wp.com/flordechanar.cl/wp-content/uploads/2024/04/Copia-de-Horario-Escolar-Universidad-Juvenil-2.jpg' },
];

// POST /api/admin/migrar-wp  — importa cursos desde WordPress (sin credenciales)
app.post('/api/admin/migrar-wp', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
    try {
        // Buscar primer admin/profesor como responsable de cursos
        const [[prof]] = await pool.query(
            `SELECT id FROM usuarios WHERE rol IN ('admin','profesor') ORDER BY id LIMIT 1`
        );
        if (!prof) return res.status(400).json({ error: 'Crea al menos un usuario admin o profesor primero.' });
        const profesorId = prof.id;

        const resultados = [];

        for (const c of WP_CURSOS) {
            // Intentar obtener descripción vía API pública de WP
            let descripcion = '';
            try {
                const r = await fetch(`https://flordechanar.cl/wp-json/wp/v2/lp_course/${c.wp_id}`, { signal: AbortSignal.timeout(5000) });
                if (r.ok) {
                    const d = await r.json();
                    descripcion = (d.excerpt?.rendered || '').replace(/<[^>]+>/g, '').replace(/\s+/g,' ').trim().slice(0,1000);
                }
            } catch { /* sin descripción */ }

            const [ins] = await pool.query(
                `INSERT INTO cursos (titulo, descripcion, precio, portada_url, estado, profesor_id)
                 VALUES (?, ?, ?, ?, 'publicado', ?)
                 ON DUPLICATE KEY UPDATE
                   descripcion = IF(VALUES(descripcion)!='', VALUES(descripcion), descripcion),
                   precio      = VALUES(precio),
                   portada_url = VALUES(portada_url)`,
                [c.titulo, descripcion, c.precio, c.imagen, profesorId]
            );

            let cursoId = ins.insertId;
            if (!cursoId) {
                const [[row]] = await pool.query('SELECT id FROM cursos WHERE titulo=? LIMIT 1', [c.titulo]);
                cursoId = row?.id;
            }

            // Crear módulo + lecciones placeholder si no existen
            if (cursoId) {
                const [[modExiste]] = await pool.query('SELECT id FROM modulos WHERE curso_id=? LIMIT 1', [cursoId]);
                if (!modExiste) {
                    const [mIns] = await pool.query(
                        `INSERT INTO modulos (curso_id, titulo, orden) VALUES (?, 'Contenido del Curso', 0)`, [cursoId]
                    );
                    for (let i = 0; i < (c.lecciones || 0); i++) {
                        await pool.query(
                            `INSERT INTO lecciones (modulo_id, titulo, tipo, orden, visibilidad) VALUES (?,?,?,?,'privada')`,
                            [mIns.insertId, `Lección ${i + 1}`, 'video', i]
                        );
                    }
                }
            }
            resultados.push({ titulo: c.titulo, curso_id: cursoId, ok: true });
        }

        const [[stats]] = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM cursos)    AS cursos,
                (SELECT COUNT(*) FROM modulos)   AS modulos,
                (SELECT COUNT(*) FROM lecciones) AS lecciones`
        );
        res.json({ ok: true, importados: resultados.length, stats, resultados });
    } catch (e) {
        console.error('migrar-wp error:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/migrar-wp/completo — importa secciones y lecciones reales (requiere credenciales WP)
app.post('/api/admin/migrar-wp/completo', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
    const wpUser = process.env.WP_USER;
    const wpPass = process.env.WP_APP_PASS;
    if (!wpUser || !wpPass) {
        return res.status(400).json({
            error: 'Faltan credenciales de WordPress. Agrega WP_USER y WP_APP_PASS en las variables de entorno de EasyPanel.'
        });
    }
    const wpBase = (process.env.WP_BASE_URL || 'https://flordechanar.cl').replace(/\/$/, '');
    const authB64 = Buffer.from(`${wpUser}:${wpPass}`).toString('base64');
    const wpGet = async (path) => {
        const r = await fetch(`${wpBase}/wp-json${path}`, {
            headers: { 'Authorization': `Basic ${authB64}` },
            signal: AbortSignal.timeout(15000)
        });
        if (!r.ok) throw new Error(`WP API ${path} → ${r.status} ${r.statusText}`);
        return r.json();
    };

    try {
        const [[prof]] = await pool.query(`SELECT id FROM usuarios WHERE rol IN ('admin','profesor') ORDER BY id LIMIT 1`);
        if (!prof) return res.status(400).json({ error: 'Crea al menos un usuario admin o profesor primero.' });
        const profesorId = prof.id;

        // Verificar conexión con WP primero
        let cursosWP = [];
        try {
            for (let page = 1; page <= 5; page++) {
                const data = await wpGet(`/lp/v1/courses?per_page=20&page=${page}`);
                const items = Array.isArray(data) ? data : (data.data || data.items || []);
                cursosWP = cursosWP.concat(items);
                if (items.length < 20) break;
            }
        } catch (wpErr) {
            return res.status(502).json({
                error: `No se pudo conectar con WordPress: ${wpErr.message}. Verifica que WP_USER y WP_APP_PASS sean correctos y que WordPress tenga habilitada la API REST.`
            });
        }

        if (cursosWP.length === 0) {
            return res.status(404).json({
                error: 'WordPress respondió correctamente pero no devolvió cursos. Verifica que LearnPress esté activo y tenga cursos publicados.'
            });
        }

        let importados = 0;
        const log = [];

        for (const cResumen of cursosWP) {
            try {
                // Detalle completo
                const c = await wpGet(`/lp/v1/courses/${cResumen.id}`);
                const titulo      = c.name || cResumen.name || '';
                const descripcion = (c.description || '').replace(/<[^>]+>/g,'').slice(0,1000);
                const precio      = parseInt(String(c.price||0).replace(/[^0-9]/g,''))||0;
                const imagen      = c.image || c.thumbnail || null;

                const [ins] = await pool.query(
                    `INSERT INTO cursos (titulo, descripcion, precio, portada_url, estado, profesor_id)
                     VALUES (?,?,?,?,'publicado',?)
                     ON DUPLICATE KEY UPDATE descripcion=VALUES(descripcion), precio=VALUES(precio), portada_url=VALUES(portada_url)`,
                    [titulo, descripcion, precio, imagen, profesorId]
                );
                let cursoId = ins.insertId;
                if (!cursoId) { const [[r]] = await pool.query('SELECT id FROM cursos WHERE titulo=? LIMIT 1',[titulo]); cursoId=r?.id; }

                // Eliminar módulos/lecciones anteriores para reimportar limpio
                await pool.query('DELETE FROM modulos WHERE curso_id=?', [cursoId]);

                const secciones = c.sections || c.curriculum || [];
                for (let si = 0; si < secciones.length; si++) {
                    const sec = secciones[si];
                    const [mIns] = await pool.query(
                        `INSERT INTO modulos (curso_id, titulo, orden) VALUES (?,?,?)`,
                        [cursoId, sec.title || `Módulo ${si+1}`, si]
                    );
                    const items = sec.lessons || sec.items || [];
                    for (let li = 0; li < items.length; li++) {
                        const item = items[li];
                        // Extraer video URL del contenido
                        const html = item.content || '';
                        const ytMatch = html.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
                        const videoUrl = ytMatch ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : null;
                        await pool.query(
                            `INSERT INTO lecciones (modulo_id, titulo, descripcion, video_url, tipo, orden, visibilidad)
                             VALUES (?,?,?,?,?,?,'privada')`,
                            [mIns.insertId, item.title||`Lección ${li+1}`, '', videoUrl, videoUrl?'video':'texto', li]
                        );
                    }
                }
                log.push(`✓ [${cursoId}] ${titulo} (${secciones.length} secciones)`);
                importados++;
            } catch (e) {
                log.push(`✗ ${cResumen.name || cResumen.id}: ${e.message}`);
            }
        }

        res.json({ ok: true, importados, total: cursosWP.length, log });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/migrar-wp/paginas — importa páginas desde WordPress
app.post('/api/admin/migrar-wp/paginas', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
    const wpUser = process.env.WP_USER;
    const wpPass = process.env.WP_APP_PASS;
    const wpBase = (process.env.WP_BASE_URL || 'https://flordechanar.cl').replace(/\/$/, '');

    // Función helper — funciona con o sin credenciales
    const wpGet = async (path) => {
        const headers = wpUser && wpPass
            ? { 'Authorization': 'Basic ' + Buffer.from(`${wpUser}:${wpPass}`).toString('base64') }
            : {};
        const r = await fetch(`${wpBase}/wp-json${path}`, { headers, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`WP API ${path} → ${r.status} ${r.statusText}`);
        return r.json();
    };

    try {
        // Obtener páginas publicadas de WordPress (paginado)
        let wpPages = [];
        for (let page = 1; page <= 10; page++) {
            const items = await wpGet(`/wp/v2/pages?per_page=20&page=${page}&status=publish`);
            if (!Array.isArray(items) || !items.length) break;
            wpPages = wpPages.concat(items);
            if (items.length < 20) break;
        }

        if (!wpPages.length) {
            return res.status(404).json({ error: 'No se encontraron páginas publicadas en WordPress.' });
        }

        const log = [];
        let importadas = 0;
        const importIds = [];

        for (const wp of wpPages) {
            const titulo    = (wp.title?.rendered || '').replace(/<[^>]+>/g, '').trim();
            const slug      = wp.slug || '';
            const contenido = wp.content?.rendered || '';
            const extracto  = (wp.excerpt?.rendered || '').replace(/<[^>]+>/g, '').trim().slice(0, 500);
            const metaDesc  = extracto.slice(0, 160);

            // Intentar obtener imagen destacada si existe
            let portadaUrl = null;
            if (wp.featured_media && wp.featured_media > 0) {
                try {
                    const media = await wpGet(`/wp/v2/media/${wp.featured_media}`);
                    portadaUrl = media.source_url || null;
                } catch { /* sin imagen */ }
            }

            if (!titulo || !slug) {
                log.push(`⚠ Omitida (sin título/slug): ID ${wp.id}`);
                continue;
            }

            try {
                const [ins] = await pool.query(
                    `INSERT INTO paginas (titulo, slug, contenido, extracto, meta_desc, portada_url, estado)
                     VALUES (?,?,?,?,?,?,'publicado')
                     ON DUPLICATE KEY UPDATE
                       titulo    = VALUES(titulo),
                       contenido = VALUES(contenido),
                       extracto  = VALUES(extracto),
                       meta_desc = VALUES(meta_desc),
                       portada_url = COALESCE(VALUES(portada_url), portada_url)`,
                    [titulo, slug, contenido, extracto, metaDesc, portadaUrl]
                );
                let pid = ins.insertId;
                if (!pid) {
                    const [[row]] = await pool.query('SELECT id FROM paginas WHERE slug=? LIMIT 1',[slug]);
                    pid = row?.id;
                }
                if (pid) importIds.push(pid);
                log.push(`✓ ${titulo}`);
                importadas++;
            } catch (e) {
                log.push(`✗ ${titulo}: ${e.message}`);
            }
        }

        res.json({ ok: true, importadas, total: wpPages.length, log, ids: importIds });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ══════════════════════════════════════════════════════════
//  PÁGINAS CMS
// ══════════════════════════════════════════════════════════

// GET /api/paginas  — listado público (solo publicadas)
app.get('/api/paginas', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, titulo, slug, extracto, portada_url, meta_desc, estado, orden, actualizado_en
             FROM paginas WHERE estado='publicado' ORDER BY orden ASC, id ASC`
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/paginas/:slug  — página pública por slug
app.get('/api/paginas/:slug', async (req, res) => {
    try {
        const [[page]] = await pool.query(
            `SELECT * FROM paginas WHERE slug=? AND estado='publicado'`, [req.params.slug]
        );
        if (!page) return res.status(404).json({ error: 'Página no encontrada' });
        res.json(page);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/paginas  — listado completo (admin)
app.get('/api/admin/paginas', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    try {
        const [rows] = await pool.query(
            `SELECT id, titulo, slug, extracto, portada_url, meta_desc, estado, orden, actualizado_en
             FROM paginas ORDER BY orden ASC, id ASC`
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/paginas/:id  — detalle para editar (admin)
app.get('/api/admin/paginas/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    try {
        const [[page]] = await pool.query('SELECT * FROM paginas WHERE id=?', [req.params.id]);
        if (!page) return res.status(404).json({ error: 'No encontrada' });
        res.json(page);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/paginas  — crear
app.post('/api/admin/paginas', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const { titulo, slug, contenido, extracto, meta_desc, portada_url, estado, orden } = req.body;
    if (!titulo) return res.status(400).json({ error: 'El título es obligatorio' });
    // Auto-generar slug si no viene
    const slugFinal = (slug || titulo)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    try {
        const [ins] = await pool.query(
            `INSERT INTO paginas (titulo, slug, contenido, extracto, meta_desc, portada_url, estado, orden)
             VALUES (?,?,?,?,?,?,?,?)`,
            [titulo, slugFinal, contenido||'', extracto||'', meta_desc||'', portada_url||null,
             estado||'borrador', orden||0]
        );
        res.json({ ok: true, id: ins.insertId, slug: slugFinal });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una página con ese slug' });
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/admin/paginas/:id  — actualizar
app.put('/api/admin/paginas/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const { titulo, slug, contenido, extracto, meta_desc, portada_url, estado, orden } = req.body;
    try {
        await pool.query(
            `UPDATE paginas SET titulo=?, slug=?, contenido=?, extracto=?, meta_desc=?,
             portada_url=?, estado=?, orden=? WHERE id=?`,
            [titulo, slug, contenido||'', extracto||'', meta_desc||'', portada_url||null,
             estado||'borrador', orden||0, req.params.id]
        );
        res.json({ ok: true });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe una página con ese slug' });
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/paginas/:id  — eliminar
app.delete('/api/admin/paginas/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    try {
        await pool.query('DELETE FROM paginas WHERE id=?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/paginas/batch-delete  — eliminar varias a la vez (tickets post-importación)
app.post('/api/admin/paginas/batch-delete', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.json({ ok: true, eliminadas: 0 });
    try {
        await pool.query('DELETE FROM paginas WHERE id IN (?)', [ids]);
        res.json({ ok: true, eliminadas: ids.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/ia/proveedores — qué proveedores tienen API key configurada
app.get('/api/admin/ia/proveedores', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    res.json({
        claude:  !!process.env.ANTHROPIC_API_KEY,
        openai:  !!process.env.OPENAI_API_KEY,
        gemini:  !!process.env.GEMINI_API_KEY,
        groq:    !!process.env.GROQ_API_KEY,
    });
});

// GET /api/admin/ia/gemini-modelos — lista los modelos Gemini disponibles para esta API key
app.get('/api/admin/ia/gemini-modelos', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(400).json({ error: 'GEMINI_API_KEY no configurada' });
    try {
        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=50`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (!r.ok) {
            const e = await r.json().catch(()=>({}));
            throw new Error(e.error?.message || `Gemini ListModels ${r.status}`);
        }
        const data = await r.json();
        // Filtrar solo modelos que soportan generateContent y son tipo gemini
        const modelos = (data.models || [])
            .filter(m =>
                m.supportedGenerationMethods?.includes('generateContent') &&
                m.name.includes('gemini')
            )
            .map(m => ({
                id:          m.name.replace('models/', ''),   // "gemini-2.0-flash"
                nombre:      m.displayName || m.name,         // "Gemini 2.0 Flash"
                descripcion: (m.description || '').slice(0, 120),
                inputLimit:  m.inputTokenLimit  || 0,
                outputLimit: m.outputTokenLimit || 0,
            }))
            // Ordenar: pro primero, luego flash, luego el resto
            .sort((a, b) => {
                const rank = s => s.includes('pro') ? 0 : s.includes('flash') ? 1 : 2;
                return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
            });
        res.json({ ok: true, modelos });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/ia/pagina  — Asistente IA multi-proveedor
app.post('/api/admin/ia/pagina', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Sin acceso' });
    const { prompt, contenido, titulo, provider = 'claude', geminiModel = 'gemini-2.0-flash' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Falta el prompt' });
    // Timeout adaptivo: modelos Pro son más lentos (hasta 2 min), flash es rápido
    const isPro = provider === 'gemini' && geminiModel.includes('pro');
    const API_TIMEOUT = isPro ? 120000 : 45000;

    // Construir prompt del sistema — estructurado, incremental, sin razonamiento
    const systemPrompt = `Eres un generador de HTML estructurado para páginas web. La página se llama: "${titulo || 'Sin título'}".

REGLAS DE FORMATO (obligatorias):
1. Tu respuesta debe comenzar DIRECTAMENTE con una etiqueta HTML (<section>, <div>, <article>, etc.). NUNCA texto antes.
2. NUNCA incluyas razonamiento, explicaciones ni comentarios en la salida.
3. NUNCA uses <!DOCTYPE>, <html>, <head>, <body> ni bloques markdown \`\`\`html.
4. Si tu respuesta no empieza con "<", es un error grave.

ESTRUCTURA OBLIGATORIA (muy importante para el editor visual):
5. Organiza el contenido en SECCIONES INDEPENDIENTES. Cada bloque temático debe estar en su propio <section> o <div> con estilos propios.
6. NUNCA pongas todo el contenido en un solo párrafo o elemento.
7. Usa esta jerarquía: <section> contiene <div class="container"> que contiene h1/h2/p/ul/etc.
8. Cada sección debe tener padding propio (mínimo 40px) y fondo propio si corresponde.
9. Colores de la marca: verde #687A61 (primario), crema #F5F0E8 (fondo), navy #1E3A5F (texto oscuro).

COMPORTAMIENTO INCREMENTAL (crítico cuando hay contenido existente):
10. Si se te proporciona "CONTENIDO ACTUAL", debes MODIFICAR ÚNICAMENTE lo que el usuario pide. El resto del HTML debe permanecer IDÉNTICO, sin restructurarlo ni re-estilizarlo.
11. Si el usuario dice "agrega", "cambia solo X", "modifica la sección de...", opera solo sobre esa parte.
12. Si el usuario pide crear algo desde cero (sin contenido actual o pide "rediseño total"), genera todo nuevo.

SALIDA: HTML estructurado en secciones, comenzando con < inmediatamente.`;

    const tieneContenido = contenido && contenido.trim().length > 20 && contenido.trim() !== '<p><br></p>';
    const userMsg = tieneContenido
        ? `MODIFICACIÓN INCREMENTAL — modifica solo lo que se pide, el resto queda igual.
INSTRUCCIÓN: ${prompt}

CONTENIDO ACTUAL (modifica sobre esto, no lo reemplaces todo):
${contenido.slice(0, 8000)}`
        : `NUEVO DISEÑO — crea el HTML completo desde cero.
INSTRUCCIÓN: ${prompt}`;

    try {
        let html = '';

        /* ── Claude (Anthropic) ── */
        if (provider === 'claude') {
            const key = process.env.ANTHROPIC_API_KEY;
            if (!key) return res.status(400).json({ error: 'Agrega ANTHROPIC_API_KEY en EasyPanel → Variables de entorno.' });
            const r = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 4096,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMsg }]
                }),
                signal: AbortSignal.timeout(API_TIMEOUT)
            });
            if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message || `Claude ${r.status}`); }
            const d = await r.json();
            html = d.content?.[0]?.text || '';
        }

        /* ── ChatGPT (OpenAI) ── */
        else if (provider === 'openai') {
            const key = process.env.OPENAI_API_KEY;
            if (!key) return res.status(400).json({ error: 'Agrega OPENAI_API_KEY en EasyPanel → Variables de entorno.' });
            const r = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    max_tokens: 4096,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user',   content: userMsg }
                    ]
                }),
                signal: AbortSignal.timeout(API_TIMEOUT)
            });
            if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message || `OpenAI ${r.status}`); }
            const d = await r.json();
            html = d.choices?.[0]?.message?.content || '';
        }

        /* ── Gemini (Google) ── */
        else if (provider === 'gemini') {
            const key = process.env.GEMINI_API_KEY;
            if (!key) return res.status(400).json({ error: 'Agrega GEMINI_API_KEY en EasyPanel → Variables de entorno.' });
            const GEMINI_MODEL = geminiModel || 'gemini-2.0-flash';
            const r = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                        generationConfig: {
                            maxOutputTokens: 4096,
                            // Para thinking models (2.5/3.x Pro): desactivar thinking para
                            // obtener HTML directo sin razonamiento interno en la respuesta.
                            // thinkingBudget: 0 → sin thinking; -1 → auto (default)
                            thinkingConfig: { thinkingBudget: 0 }
                        }
                    }),
                    signal: AbortSignal.timeout(API_TIMEOUT)
                }
            );
            if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message || `Gemini ${r.status}`); }
            const d = await r.json();
            // Gemini 2.5 Pro devuelve partes "thought" (razonamiento interno) separadas de la respuesta real.
            // Filtramos SOLO las partes que NO son thought (la respuesta real).
            const parts = d.candidates?.[0]?.content?.parts || [];
            const realParts = parts.filter(p => !p.thought);
            html = realParts.map(p => p.text || '').join('') || parts.map(p => p.text || '').join('');
        }

        /* ── Groq (LLaMA) ── */
        else if (provider === 'groq') {
            const key = process.env.GROQ_API_KEY;
            if (!key) return res.status(400).json({ error: 'Agrega GROQ_API_KEY en EasyPanel → Variables de entorno.' });
            const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    max_tokens: 4096,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user',   content: userMsg }
                    ]
                }),
                signal: AbortSignal.timeout(API_TIMEOUT)
            });
            if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error?.message || `Groq ${r.status}`); }
            const d = await r.json();
            html = d.choices?.[0]?.message?.content || '';
        }

        else {
            return res.status(400).json({ error: `Proveedor desconocido: ${provider}` });
        }

        // ── Limpieza robusta de la respuesta ──────────────────────────────
        // 1. Quitar bloques markdown ```html ... ```
        html = html.replace(/^```html?\n?/i, '').replace(/\n?```\s*$/g, '').trim();
        // 2. Quitar etiquetas <think>...</think> (razonamiento de modelos extendidos)
        html = html.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        // 3. Si la respuesta empieza con texto plano (sin "<"), cortar hasta el primer "<"
        //    para eliminar razonamiento que quedó suelto antes del HTML
        const firstTag = html.indexOf('<');
        if (firstTag > 0) html = html.slice(firstTag);
        // 4. Quitar texto suelto DESPUÉS del último ">" (cierre de última etiqueta)
        const lastTag = html.lastIndexOf('>');
        if (lastTag !== -1 && lastTag < html.length - 1) html = html.slice(0, lastTag + 1);
        html = html.trim();
        // ─────────────────────────────────────────────────────────────────
        res.json({ ok: true, html, provider });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Any Uncaught API routes return 404
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Páginas CMS públicas — /p/:slug
app.get('/p/:slug', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pagina.html'));
});

// Frontend fallback
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
