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
        console.log('Table usuarios checked/created.');

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

// Any Uncaught API routes return 404
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Frontend fallback: For any GET route not matched by static or api, serve index.html
app.use((req, res, next) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
