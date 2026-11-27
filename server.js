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

// Helper para obtener cliente dedicado en transacciones ACID
async function getTransactionClient() {
    const pool = typeof db.connect === 'function'
        ? db
        : (db.pool && typeof db.pool.connect === 'function' ? db.pool : null);

    if (pool) {
        const client = await pool.connect();
        return { client, release: () => client.release() };
    }
    return { client: db, release: () => {} };
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
    const cleanSku = (sku ? sku : '').trim().toUpperCase();
    try {
        const result = await db.query(
            'INSERT INTO products (sku, name, category, brand, price, stock_quantity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [cleanSku, name, category, brand, price, stock_quantity]
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

// Escáner QR/Barras - Validación DFA (SKU interno o EAN/UPC) y descuento atómico
app.patch('/api/products/:sku/decrement', authenticateToken, async (req, res) => {
    const sku = (req.params.sku ? req.params.sku : '').trim().toUpperCase();

    // Validación Léxica / Autómata Finito Determinista (DFA)
    const skuRegex = /^([A-Z]{3,4}-[A-Z0-9]{3,6}-\d{2}|\d{8,14})$/;
    if (!skuRegex.test(sku)) {
        return res.status(400).json({
            error: 'Código "' + sku + '" rechazado por el analizador léxico (formato esperado: XXX-XXX-00 o código de barras EAN/UPC).'
        });
    }

    try {
        const result = await db.query(
            'UPDATE products SET stock_quantity = stock_quantity - 1 WHERE sku = $1 AND stock_quantity > 0 RETURNING id, sku, name, category, brand, price, stock_quantity',
            [sku]
        );

        if (result.rowCount === 0) {
            const check = await db.query('SELECT stock_quantity FROM products WHERE sku = $1', [sku]);
            if (check.rowCount === 0) {
                return res.status(404).json({ error: 'El código ' + sku + ' no está registrado en el catálogo.' });
            }
            return res.status(409).json({ error: 'Sin existencias disponibles para ' + sku + ' (Stock: 0).' });
        }

        const updatedProduct = result.rows[0];

        res.json({
            message: 'Salida registrada: -1 unidad de ' + updatedProduct.name,
            product: updatedProduct,
            low_stock_alert: updatedProduct.stock_quantity <= 5
        });
    } catch (err) {
        console.error('Error al descontar código escaneado:', err);
        res.status(500).json({ error: 'Error interno al actualizar el inventario en Neon DB.' });
    }
});

// --- RUTAS DE KARDEX Y COTIZACIONES / ÓRDENES B2B ---

// 1. Historial real de movimientos (Kardex) y serie agrupada para Dashboard
app.get('/api/movements', authenticateToken, async (req, res) => {
    const range = req.query.range ? req.query.range : 'week';
    const intervalMap = {
        day: '24 hours',
        week: '7 days',
        month: '30 days',
        year: '12 months'
    };
    const formatMap = {
        day: 'HH24:00',
        week: 'DD/MM',
        month: 'DD/MM',
        year: 'YYYY-MM'
    };

    const interval = intervalMap[range] ? intervalMap[range] : '7 days';
    const dateFormat = formatMap[range] ? formatMap[range] : 'DD/MM';

    try {
        const logsResult = await db.query(
            'SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 40'
        );

        const chartSql = [
            "SELECT TO_CHAR(bucket, $1) AS label, SUM(ABS(quantity_change))::int AS total_units",
            "FROM (",
            "  SELECT quantity_change,",
            "    CASE",
            "      WHEN $3 = 'day' THEN DATE_TRUNC('hour', created_at AT TIME ZONE 'America/Mexico_City')",
            "      WHEN $3 = 'year' THEN DATE_TRUNC('month', created_at AT TIME ZONE 'America/Mexico_City')",
            "      ELSE DATE_TRUNC('day', created_at AT TIME ZONE 'America/Mexico_City')",
            "    END AS bucket",
            "  FROM inventory_movements",
            "  WHERE created_at >= NOW() - $2::interval",
            ") sub",
            "GROUP BY bucket",
            "ORDER BY bucket ASC"
        ].join(' ');

        const chartResult = await db.query(chartSql, [dateFormat, interval, range]);

        res.json({
            logs: logsResult.rows,
            chart: chartResult.rows
        });
    } catch (err) {
        console.error('Error al consultar Kardex:', err);
        res.status(500).json({ error: 'Error al obtener movimientos de inventario.' });
    }
});

// 2. Listar cotizaciones y órdenes B2B con sus partidas
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const ordersSql = [
            "SELECT o.*, c.phone AS client_phone,",
            "COALESCE(",
            "  json_agg(",
            "    json_build_object(",
            "      'product_id', oi.product_id,",
            "      'sku', oi.sku,",
            "      'product_name', oi.product_name,",
            "      'quantity', oi.quantity,",
            "      'unit_price', oi.unit_price,",
            "      'line_total', oi.line_total",
            "    )",
            "  ) FILTER (WHERE oi.id IS NOT NULL),",
            "  '[]'",
            ") AS items",
            "FROM orders o",
            "LEFT JOIN clients c ON c.id = o.client_id",
            "LEFT JOIN order_items oi ON oi.order_id = o.id",
            "GROUP BY o.id, c.phone",
            "ORDER BY o.created_at DESC"
        ].join(' ');

        const result = await db.query(ordersSql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Crear Cotización o Venta Confirmada con Transacción ACID (BEGIN / COMMIT / ROLLBACK)
app.post('/api/orders', authenticateToken, async (req, res) => {
    const body = req.body ? req.body : {};
    const client_id = body.client_id;
    const items = body.items;
    const discount_percent = body.discount_percent !== undefined ? body.discount_percent : 0;
    const status = body.status ? body.status : 'CONFIRMADA';

    if (!client_id || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Selecciona un cliente y al menos un producto.' });
    }

    const { client, release } = await getTransactionClient();

    try {
        await client.query('BEGIN');

        const clientRes = await client.query(
            'SELECT id, business_name, phone FROM clients WHERE id = $1',
            [client_id]
        );
        if (clientRes.rowCount === 0) {
            throw new Error('El cliente seleccionado no existe.');
        }
        const customer = clientRes.rows[0];

        let subtotal = 0;
        const processedItems = [];

        for (const item of items) {
            const qty = parseInt(item.quantity, 10);
            if (!qty || qty <= 0) {
                throw new Error('Cantidad inválida en los productos.');
            }

            const prodRes = await client.query(
                'SELECT id, sku, name, price, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
                [item.product_id]
            );
            if (prodRes.rowCount === 0) {
                throw new Error('Producto ID ' + item.product_id + ' no encontrado.');
            }

            const prod = prodRes.rows[0];

            if (status === 'CONFIRMADA') {
                if (prod.stock_quantity < qty) {
                    throw new Error('Stock insuficiente para ' + prod.name + ' (Disponible: ' + prod.stock_quantity + ', Solicitado: ' + qty + ').');
                }
                await client.query(
                    'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                    [qty, prod.id]
                );
            }

            const unitPrice = parseFloat(prod.price);
            const lineTotal = unitPrice * qty;
            subtotal += lineTotal;

            processedItems.push({
                product_id: prod.id,
                sku: prod.sku,
                product_name: prod.name,
                quantity: qty,
                unit_price: unitPrice,
                line_total: lineTotal
            });
        }

        const parsedDisc = parseFloat(discount_percent);
        const safeDisc = Number.isNaN(parsedDisc) ? 0 : parsedDisc;
        const disc = Math.min(Math.max(safeDisc, 0), 100);
        const discountedSubtotal = subtotal * (1 - disc / 100);
        const tax = discountedSubtotal * 0.16;
        const total = discountedSubtotal + tax;
        const folio = 'SYN-' + Date.now().toString().slice(-6);

        const orderRes = await client.query(
            'INSERT INTO orders (folio, client_id, client_name, discount_percent, subtotal, tax, total, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [folio, customer.id, customer.business_name, disc, subtotal.toFixed(2), tax.toFixed(2), total.toFixed(2), status]
        );
        const newOrder = orderRes.rows[0];

        for (const pItem of processedItems) {
            await client.query(
                'INSERT INTO order_items (order_id, product_id, sku, product_name, quantity, unit_price, line_total) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [newOrder.id, pItem.product_id, pItem.sku, pItem.product_name, pItem.quantity, pItem.unit_price, pItem.line_total]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: status === 'CONFIRMADA'
                ? 'Venta ' + folio + ' confirmada y stock descontado'
                : 'Cotización ' + folio + ' generada',
            order: { ...newOrder, items: processedItems, client_phone: customer.phone }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        release();
    }
});

// 4. Convertir una Cotización existente en Venta Confirmada (descuenta stock con ACID)
app.patch('/api/orders/:id/confirm', authenticateToken, async (req, res) => {
    const { client, release } = await getTransactionClient();

    try {
        await client.query('BEGIN');

        const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (orderRes.rowCount === 0) throw new Error('Orden no encontrada.');

        const order = orderRes.rows[0];
        if (order.status === 'CONFIRMADA') {
            throw new Error('La orden ' + order.folio + ' ya está confirmada.');
        }

        const itemsRes = await client.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);

        for (const item of itemsRes.rows) {
            const prodRes = await client.query(
                'SELECT id, name, stock_quantity FROM products WHERE id = $1 FOR UPDATE',
                [item.product_id]
            );
            if (prodRes.rowCount === 0) {
                throw new Error('El producto ' + item.product_name + ' ya no existe en el catálogo.');
            }
            const prod = prodRes.rows[0];
            if (prod.stock_quantity < item.quantity) {
                throw new Error('Stock insuficiente para ' + prod.name + ' (Disponible: ' + prod.stock_quantity + ', Requerido: ' + item.quantity + ').');
            }

            await client.query(
                'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
                [item.quantity, prod.id]
            );
        }

        await client.query("UPDATE orders SET status = 'CONFIRMADA' WHERE id = $1", [order.id]);
        await client.query('COMMIT');

        res.json({ message: 'Cotización ' + order.folio + ' convertida en venta confirmada' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        release();
    }
});

app.listen(PORT, () => {
    console.log('🚀 Servidor Synkro activo en puerto ' + PORT);
});
