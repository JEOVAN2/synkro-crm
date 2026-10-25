const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend (HTML, CSS, JS)
app.use(express.static('public'));

// ==========================================
// RUTAS DE CLIENTES
// ==========================================

// Obtener todos los clientes
app.get('/api/clients', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar nuevo cliente
app.post('/api/clients', async (req, res) => {
    const { business_name, contact_name, phone, city, delivery_address } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO clients (business_name, contact_name, phone, city, delivery_address) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [business_name, contact_name, phone, city, delivery_address]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar cliente por ID
app.delete('/api/clients/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
        res.json({ message: 'Cliente eliminado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// RUTAS DE PRODUCTOS
// ==========================================

// Obtener todos los productos
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar / Actualizar producto (Upsert por SKU)
app.post('/api/products', async (req, res) => {
    const { sku, name, category, brand, price, stock_quantity } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO products (sku, name, category, brand, price, stock_quantity)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (sku) DO UPDATE 
             SET price = EXCLUDED.price, stock_quantity = EXCLUDED.stock_quantity
             RETURNING *`,
            [sku.toUpperCase(), name, category, brand, price, stock_quantity]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar producto por ID
app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});