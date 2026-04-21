const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Create DB Connection Pool
// Note: We don't specify database yet to ensure we can create it if it doesn't exist
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function initDB() {
    try {
        console.log('Connecting to MySQL DB...');
        let connection = await mysql.createConnection(dbConfig);
        
        // Ensure Database exists
        await connection.query('CREATE DATABASE IF NOT EXISTS flordechanar CHARACTER SET utf8mb4');
        console.log('Database flordechanar checked/created.');
        await connection.end();

        // Reconnect pool with the specific database
        pool = mysql.createPool({ ...dbConfig, database: 'flordechanar' });
        
        // Initialize tables
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

        // Tabla Cursos
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

        // Tabla Inscripciones
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

        // Tabla Modulos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS modulos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                curso_id INT NOT NULL,
                titulo VARCHAR(300) NOT NULL,
                orden INT DEFAULT 0,
                FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE
            )
        `);

        // Tabla Lecciones
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lecciones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                modulo_id INT NOT NULL,
                titulo VARCHAR(300) NOT NULL,
                descripcion TEXT,
                video_url VARCHAR(500),
                tipo ENUM('video','texto','archivo','link') DEFAULT 'video',
                duracion VARCHAR(50),
                visibilidad ENUM('privada','muestra') DEFAULT 'privada',
                orden INT DEFAULT 0,
                FOREIGN KEY (modulo_id) REFERENCES modulos(id) ON DELETE CASCADE
            )
        `);
        // Agregar columnas nuevas si ya existe la tabla (migración segura)
        const alterCols = [
            "ALTER TABLE lecciones ADD COLUMN IF NOT EXISTS tipo ENUM('video','texto','archivo','link') DEFAULT 'video'",
            "ALTER TABLE lecciones ADD COLUMN IF NOT EXISTS duracion VARCHAR(50)",
            "ALTER TABLE lecciones ADD COLUMN IF NOT EXISTS visibilidad ENUM('privada','muestra') DEFAULT 'privada'"
        ];
        for(const sql of alterCols) { try { await pool.query(sql); } catch(e) {} }
        console.log('Tables checked/created: usuarios, cursos, inscripciones, modulos, lecciones.');

        // Insert default admin if none exists
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

// Call initDB once
initDB();

// --- Auth Routes ---
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

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

// --- Rutas de Cursos y LMS ---

// Obtener lista de profesores (Para el frontend de Creador de Cursos / Admin)
app.get('/api/usuarios/profesores', verifyToken, async (req, res) => {
    try {
        const [profesores] = await pool.query('SELECT id, nombre, email FROM usuarios WHERE rol = "profesor" OR rol = "admin"');
        res.json(profesores);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener profesores' });
    }
});

// Obtener lista completa de usuarios (Para Admin)
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

// Crear nuevo usuario (Admin)
app.post('/api/usuarios/crear', verifyToken, async (req, res) => {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { nombre, email, password, rol } = req.body;
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
// Obtener solo profesores (para el selector de curso-crear)
app.get('/api/usuarios/profesores', verifyToken, async (req, res) => {
    try {
        const [profs] = await pool.query(
            'SELECT id, nombre, email FROM usuarios WHERE rol = "profesor" ORDER BY nombre ASC'
        );
        res.json(profs);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al obtener profesores' });
    }
});

// Obtener todos los cursos (Público - para la vitrina)
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

// Crear Curso (Protegido Admin/Profesor)
app.post('/api/cursos', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        const { titulo, descripcion, precio, portada_url, estado, profesor_id } = req.body;
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

// Cursos del Profesor (Para el panel del Profesor)
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

// Cursos del Alumno
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

// Inscribirse
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

// Actualizar Curso (Protegido Admin/Profesor)
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

// Eliminar Curso (Protegido Admin)
app.delete('/api/cursos/:id', verifyToken, async (req, res) => {
    if (req.usuario.rol === 'estudiante') return res.status(403).json({ error: 'Permission denied' });
    try {
        // ON DELETE CASCADE en modulos/lecciones/inscripciones se encarga automáticamente
        await pool.query('DELETE FROM cursos WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Curso eliminado' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar curso' });
    }
});

// --- Curriculum: Módulos y Lecciones ---

// Obtener curriculum completo de un curso (módulos + lecciones anidadas)
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

// Crear módulo
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

// Eliminar módulo (ON DELETE CASCADE borra sus lecciones automáticamente)
app.delete('/api/modulos/:id', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM modulos WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar módulo' });
    }
});

// Crear lección (vacía inicialmente)
app.post('/api/lecciones', verifyToken, async (req, res) => {
    try {
        const { modulo_id, titulo } = req.body;
        const [result] = await pool.query('INSERT INTO lecciones (modulo_id, titulo, descripcion, video_url) VALUES (?, ?, "", "")', [modulo_id, titulo]);
        res.json({ success: true, id: result.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al crear lección' });
    }
});

// Actualizar lección (título, descripción, video, tipo, duración, visibilidad)
app.put('/api/lecciones/:id', verifyToken, async (req, res) => {
    try {
        const { titulo, descripcion, video_url, tipo, duracion, visibilidad } = req.body;
        await pool.query(
            'UPDATE lecciones SET titulo=?, descripcion=?, video_url=?, tipo=?, duracion=?, visibilidad=? WHERE id=?',
            [titulo, descripcion, video_url, tipo || 'video', duracion || null, visibilidad || 'privada', req.params.id]
        );
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al actualizar lección' });
    }
});

// Eliminar lección
app.delete('/api/lecciones/:id', verifyToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM lecciones WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al eliminar lección' });
    }
});

// Any Uncaught API routes return 404
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Frontend fallback: For any GET route not matched by static or api, serve index.html
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
