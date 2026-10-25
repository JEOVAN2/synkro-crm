const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'synkro_secreto_super_seguro_2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar usuario Administrador por defecto
async function initAdmin() {
    try {
        const res = await db.query('SELECT COUNT(*) FROM users');
        if (parseInt(res.rows[0].count) === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', ['admin', hashedPassword]);
            console.log('👤 Usuario por defecto creado: admin / admin123');
        }
    } catch (err) {
        console.error('Error al verificar usuario admin:', err.message);
    }
}
initAdmin();

// Middleware de Autenticación JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Acceso no autorizado' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Sesión expirada o inválida' });
        req.user = user;
        next();
    });
}

// --- RUTAS DE AUTENTICACIÓN ---

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'Usuario no encontrado' });

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Contraseña incorrecta' });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, username: user.username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registro de nuevos usuarios
app.post('/api/register', authenticateToken, async (req, res) => {
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);
        res.json({ message: 'Usuario creado con éxito' });
    } catch (err) {
        res.status(500).json({ error: 'El usuario ya existe o hubo un error' });
    }
});

// --- RUTAS PROTEGIDAS (CLIENTES Y PRODUCTOS) ---

// Clientes
app.get('/api/clients', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM clients ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clients', authenticateToken, async (req, res) => {
    const { business_name, contact_name, phone, city } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO clients (business_name, contact_name, phone, city) VALUES ($1, $2, $3, $4) RETURNING *',
            [business_name, contact_name, phone, city]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clients/:id', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
        res.json({ message: 'Cliente eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Productos
app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM products ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', authenticateToken, async (req, res) => {
    const { sku, name, category, brand, price, stock_quantity } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO products (sku, name, category, brand, price, stock_quantity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [sku, name, category, brand, price, stock_quantity]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
        res.json({ message: 'Producto eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Synkro activo en puerto ${PORT}`);
});
