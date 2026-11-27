let chartCatInstance = null;
let chartCityInstance = null;
let allProductsCache = [];
let allClientsCache = [];
let allOrdersCache = [];
let currentOrderItems = [];
let currentRange = 'week';

const rangeLabelsMap = {
    day: 'Movimientos de Hoy (Unidades)',
    week: 'Movimientos de esta Semana (Unidades)',
    month: 'Movimientos de este Mes (Unidades)',
    year: 'Movimientos del Año (Unidades)'
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log(err));
    }

    // Selector de Rango Temporal conectado al Kardex real
    document.querySelectorAll('input[name="cir-range"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            currentRange = e.target.value;
            const labelText = e.target.nextElementSibling.innerText;
            showToast('📅 Kardex actualizado a: ' + labelText);
            await loadMovementsAndCharts();
        });
    });
});

// Desplegar / Ocultar Panel de Notificaciones
function toggleNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.style.display = (dropdown.style.display === 'none' || !dropdown.style.display) ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
    const notifBtn = document.querySelector('.btn-notif');
    const dropdown = document.getElementById('notif-dropdown');
    if (notifBtn && dropdown && !notifBtn.parentElement.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function checkAuth() {
    const token = localStorage.getItem('synkro_token');
    const username = localStorage.getItem('synkro_user');

    if (token) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        document.getElementById('user-display').innerText = '👤 ' + username;
        loadAllData();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = '⏳ Conectando...';

    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('synkro_token', data.token);
            localStorage.setItem('synkro_user', data.username);
            showToast('¡Bienvenido ' + data.username + '!');
            checkAuth();
        } else {
            alert(data.error || 'Credenciales incorrectas');
        }
    } catch (err) {
        alert('Error al conectar con el servidor');
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
});

function logout() {
    localStorage.removeItem('synkro_token');
    localStorage.removeItem('synkro_user');
    checkAuth();
}

async function fetchAuth(url, options = {}) {
    const token = localStorage.getItem('synkro_token');
    options.headers = {
        ...options.headers,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
    };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        logout();
        throw new Error('Sesión expirada');
    }
    return res;
}

async function loadAllData() {
    try {
        const clients = await loadClients();
        const products = await loadProducts();
        allClientsCache = clients;
        allProductsCache = products;
        updateDashboardKPIs(clients, products);
        await loadMovementsAndCharts();
        await loadOrders();
        updateSyncTimestamp();
    } catch (err) {
        console.error(err);
    }
}

function updateSyncTimestamp() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const syncEl = document.getElementById('last-sync-time');
    if (syncEl) syncEl.innerText = '⏱️ Sincronizado: ' + timeStr;
}

function switchTab(tab, btnEl) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(sec => sec.style.display = 'none');
    document.getElementById('sec-' + tab).style.display = 'block';
    const activeBtn = btnEl || (typeof event !== 'undefined' ? event.currentTarget : null);
    if (activeBtn) activeBtn.classList.add('active');
}

// --- CLIENTES ---
async function loadClients() {
    const res = await fetchAuth('/api/clients');
    const clients = await res.json();
    const tbody = document.getElementById('tbl-clientes');
    tbody.innerHTML = clients.map(c => `
        <tr>
            <td><strong>${c.business_name}</strong></td>
            <td>${c.contact_name || '-'}</td>
            <td>${c.phone || '-'}</td>
            <td>${c.city || '-'}</td>
            <td><button class="btn-danger" onclick="deleteClient(${c.id})">🗑️ Eliminar</button></td>
        </tr>
    `).join('');
    return clients;
}

// --- PRODUCTOS Y ETIQUETAS QR ---
async function loadProducts() {
    const res = await fetchAuth('/api/products');
    const products = await res.json();
    allProductsCache = products;
    renderProductsTable(products);
    return products;
}

function renderProductsTable(products) {
    const tbody = document.getElementById('tbl-productos');
    tbody.innerHTML = products.map(p => {
        const isLowStock = parseInt(p.stock_quantity, 10) <= 5;
        const stockClass = isLowStock ? 'stock-low' : 'stock-ok';
        const stockIcon = isLowStock ? '⚠️ ' : '';
        const catClass = p.category ? p.category.toLowerCase() : 'accesorios';
        const categoryClean = (p.category || 'Accesorios').replace(/_/g, ' ');

        return `
            <tr>
                <td><code>${p.sku}</code></td>
                <td>${p.name}</td>
                <td><span class="badge badge-${catClass}">${categoryClean}</span></td>
                <td>$${parseFloat(p.price).toFixed(2)}</td>
                <td><span class="stock-badge ${stockClass}">${stockIcon}${p.stock_quantity} unids.</span></td>
                <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                    <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="openQRLabel(${p.id})">🏷️ Etiqueta</button>
                    <button class="btn-danger" onclick="deleteProduct(${p.id})">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function openQRLabel(productId) {
    const prod = allProductsCache.find(p => p.id === productId);
    if (!prod) return;

    const qrBox = document.getElementById('qr-label-box');
    qrBox.innerHTML = '';
    new QRCode(qrBox, {
        text: prod.sku,
        width: 160,
        height: 160,
        colorDark: '#0F172A',
        colorLight: '#FFFFFF'
    });

    document.getElementById('label-sku').innerText = prod.sku;
    document.getElementById('label-name').innerText = prod.name;
    document.getElementById('label-price').innerText = '$' + parseFloat(prod.price).toLocaleString('es-MX', { minimumFractionDigits: 2 });
    openModal('modal-etiqueta');
}

function applyProductFilters() {
    const textQuery = document.getElementById('search-products').value.toLowerCase();
    const catQuery = document.getElementById('filter-category').value;

    const filtered = allProductsCache.filter(p => {
        const matchesText = (p.sku && p.sku.toLowerCase().includes(textQuery)) ||
                            (p.name && p.name.toLowerCase().includes(textQuery)) ||
                            (p.brand && p.brand.toLowerCase().includes(textQuery));

        const matchesCat = (catQuery === 'all') || (p.category && p.category.toLowerCase() === catQuery.toLowerCase());

        return matchesText && matchesCat;
    });

    renderProductsTable(filtered);
}

// --- DASHBOARD KPIs + KARDEX REAL ---
function updateDashboardKPIs(clients, products) {
    document.getElementById('kpi-clientes').innerText = clients.length;

    const totalStock = products.reduce((acc, p) => acc + (parseInt(p.stock_quantity, 10) || 0), 0);
    document.getElementById('kpi-stock').innerText = totalStock + ' Unids.';

    const totalValue = products.reduce((acc, p) => acc + ((parseFloat(p.price) || 0) * (parseInt(p.stock_quantity, 10) || 0)), 0);
    document.getElementById('kpi-valor').innerText = '$' + totalValue.toLocaleString('es-MX', { minimumFractionDigits: 2 });

    const lowStockItems = products.filter(p => parseInt(p.stock_quantity, 10) <= 5);
    const badge = document.getElementById('notif-badge');
    const notifList = document.getElementById('notif-list');

    if (lowStockItems.length > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = lowStockItems.length;

        notifList.innerHTML = lowStockItems.map(p => `
            <div class="notif-item">
                <strong>⚠️ Alerta de Inventario Crítico</strong>
                El producto <b>${p.name}</b> (${p.sku}) cuenta con únicamente <b>${p.stock_quantity} unidad(es)</b> en stock.
            </div>
        `).join('');
    } else {
        badge.style.display = 'none';
        notifList.innerHTML = '<p style="color: #94A3B8; font-size: 13px; margin: 10px 0; text-align: center;">Sin notificaciones pendientes</p>';
    }

    // Gráfico Doughnut: Categorías
    const catMap = {};
    products.forEach(p => {
        const catName = p.category ? p.category.replace(/_/g, ' ') : 'otros';
        catMap[catName] = (catMap[catName] || 0) + (parseInt(p.stock_quantity, 10) || 0);
    });

    if (chartCatInstance) chartCatInstance.destroy();
    const ctxCat = document.getElementById('chart-categorias').getContext('2d');
    chartCatInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catMap),
            datasets: [{
                data: Object.values(catMap),
                backgroundColor: ['#3B82F6', '#06B6D4', '#8B5CF6', '#10B981', '#F59E0B'],
                borderColor: '#1E293B',
                borderWidth: 2
            }]
        },
        options: { plugins: { legend: { labels: { color: '#F8FAFC' } } } }
    });
}

async function loadMovementsAndCharts() {
    try {
        const res = await fetchAuth('/api/movements?range=' + currentRange);
        const data = await res.json();

        const chartRows = Array.isArray(data.chart) ? data.chart : [];
        const labels = chartRows.length > 0 ? chartRows.map(r => r.label) : ['Sin movimientos'];
        const values = chartRows.length > 0 ? chartRows.map(r => r.total_units) : [0];

        if (chartCityInstance) chartCityInstance.destroy();
        const ctxCity = document.getElementById('chart-ciudades').getContext('2d');
        chartCityInstance = new Chart(ctxCity, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: rangeLabelsMap[currentRange] || 'Movimientos',
                    data: values,
                    backgroundColor: '#3B82F6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    x: { ticks: { color: '#F8FAFC' }, grid: { color: 'rgba(51, 65, 85, 0.4)' } },
                    y: { ticks: { color: '#F8FAFC' }, grid: { color: 'rgba(51, 65, 85, 0.4)' }, beginAtZero: true }
                },
                plugins: { legend: { labels: { color: '#F8FAFC' } } }
            }
        });

        // Renderizar bitácora Kardex
        const logs = Array.isArray(data.logs) ? data.logs : [];
        const tbody = document.getElementById('tbl-kardex');
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94A3B8;">Aún no hay movimientos registrados por el trigger</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(m => {
            const dateStr = new Date(m.created_at).toLocaleString('es-MX', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            });
            const isSalida = m.movement_type === 'SALIDA';
            const badgeColor = isSalida ? 'stock-low' : 'stock-ok';
            const sign = m.quantity_change > 0 ? '+' : '';
            return `
                <tr>
                    <td style="font-size: 12px; color: #94A3B8;">${dateStr}</td>
                    <td><code>${m.sku}</code></td>
                    <td>${m.product_name}</td>
                    <td><span class="stock-badge ${badgeColor}">${m.movement_type}</span></td>
                    <td><strong>${sign}${m.quantity_change}</strong></td>
                    <td>${m.new_stock} unids.</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error cargando Kardex:', err);
    }
}

// --- COTIZADOR Y ÓRDENES B2B ---
async function loadOrders() {
    try {
        const res = await fetchAuth('/api/orders');
        const orders = await res.json();
        allOrdersCache = Array.isArray(orders) ? orders : [];
        const tbody = document.getElementById('tbl-ordenes');

        if (allOrdersCache.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94A3B8;">Sin cotizaciones ni ventas registradas</td></tr>';
            return;
        }

        tbody.innerHTML = allOrdersCache.map(o => {
            const isConfirmed = o.status === 'CONFIRMADA';
            const statusBadge = isConfirmed
                ? '<span class="stock-badge stock-ok">✅ CONFIRMADA</span>'
                : '<span class="badge badge-racks_jaulas">📄 COTIZACIÓN</span>';

            const itemsSummary = Array.isArray(o.items)
                ? o.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ')
                : '-';

            const confirmBtn = !isConfirmed
                ? `<button class="btn-primary" style="padding: 4px 8px; font-size: 12px;" onclick="confirmOrder(${o.id})">✅ Confirmar</button>`
                : '';

            return `
                <tr>
                    <td><code>${o.folio}</code></td>
                    <td><strong>${o.client_name}</strong></td>
                    <td style="font-size: 13px; max-width: 260px;">${itemsSummary}</td>
                    <td><strong>$${parseFloat(o.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong></td>
                    <td>${statusBadge}</td>
                    <td style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${confirmBtn}
                        <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="shareOrderWhatsApp(${o.id})">📲 WhatsApp</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error cargando órdenes:', err);
    }
}

function openOrderModal() {
    if (allClientsCache.length === 0 || allProductsCache.length === 0) {
        alert('Registra al menos un cliente y un producto antes de cotizar.');
        return;
    }

    const clientSelect = document.getElementById('o-cliente');
    clientSelect.innerHTML = allClientsCache.map(c =>
        `<option value="${c.id}">${c.business_name} (${c.city || 'Sin ciudad'})</option>`
    ).join('');

    const prodSelect = document.getElementById('o-producto');
    prodSelect.innerHTML = allProductsCache.map(p =>
        `<option value="${p.id}">${p.name} [${p.sku}] - $${parseFloat(p.price).toFixed(2)} (Stock: ${p.stock_quantity})</option>`
    ).join('');

    currentOrderItems = [];
    document.getElementById('o-cantidad').value = 1;
    document.getElementById('o-descuento').value = 0;
    renderOrderSummary();
    openModal('modal-orden');
}

function addOrderItem() {
    const productId = parseInt(document.getElementById('o-producto').value, 10);
    const qty = parseInt(document.getElementById('o-cantidad').value, 10);
    if (!productId || !qty || qty <= 0) return;

    const prod = allProductsCache.find(p => p.id === productId);
    if (!prod) return;

    const existing = currentOrderItems.find(item => item.product_id === productId);
    if (existing) {
        existing.quantity += qty;
    } else {
        currentOrderItems.push({
            product_id: prod.id,
            sku: prod.sku,
            name: prod.name,
            price: parseFloat(prod.price),
            quantity: qty
        });
    }

    document.getElementById('o-cantidad').value = 1;
    renderOrderSummary();
}

function removeOrderItem(index) {
    currentOrderItems.splice(index, 1);
    renderOrderSummary();
}

function renderOrderSummary() {
    const listEl = document.getElementById('o-items-list');

    if (currentOrderItems.length === 0) {
        listEl.innerHTML = '<p style="color: #94A3B8; font-size: 13px; text-align: center; margin: 6px 0;">Aún no agregas equipos a la orden</p>';
    } else {
        listEl.innerHTML = currentOrderItems.map((item, idx) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 4px; border-bottom: 1px solid #334155; font-size: 13px;">
                <div>
                    <strong>${item.quantity}x</strong> ${item.name} <span style="color: #94A3B8;">(${item.sku})</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span>$${(item.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    <button type="button" onclick="removeOrderItem(${idx})" style="background: none; border: none; color: #EF4444; cursor: pointer; font-weight: bold;">✕</button>
                </div>
            </div>
        `).join('');
    }

    const subtotal = currentOrderItems.reduce((acc, i) => acc + (i.price * i.quantity), 0);
    const disc = Math.min(Math.max(parseFloat(document.getElementById('o-descuento').value) || 0, 0), 100);
    const discounted = subtotal * (1 - disc / 100);
    const iva = discounted * 0.16;
    const total = discounted + iva;

    document.getElementById('o-subtotal').innerText = '$' + subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    document.getElementById('o-iva').innerText = '$' + iva.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    document.getElementById('o-total').innerText = '$' + total.toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

async function submitOrder(status) {
    if (currentOrderItems.length === 0) {
        alert('Agrega al menos un equipo al pedido.');
        return;
    }

    const payload = {
        client_id: parseInt(document.getElementById('o-cliente').value, 10),
        discount_percent: parseFloat(document.getElementById('o-descuento').value) || 0,
        status: status,
        items: currentOrderItems.map(i => ({
            product_id: i.product_id,
            quantity: i.quantity
        }))
    };

    try {
        const res = await fetchAuth('/api/orders', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (!res.ok) {
            alert('❌ ' + (data.error || 'No se pudo procesar la orden'));
            return;
        }

        closeModal('modal-orden');
        showToast('✅ ' + data.message);
        await loadAllData();
    } catch (err) {
        alert('Error de conexión al guardar la orden');
    }
}

async function confirmOrder(orderId) {
    if (!confirm('¿Confirmar esta cotización como venta y descontar el inventario?')) return;

    try {
        const res = await fetchAuth('/api/orders/' + orderId + '/confirm', {
            method: 'PATCH'
        });
        const data = await res.json();

        if (!res.ok) {
            alert('❌ ' + (data.error || 'No se pudo confirmar la venta'));
            return;
        }

        showToast('✅ ' + data.message);
        await loadAllData();
    } catch (err) {
        alert('Error al confirmar la venta');
    }
}

function shareOrderWhatsApp(orderId) {
    const order = allOrdersCache.find(o => o.id === orderId);
    if (!order) return;

    const lines = [
        '*SYNKRO CRM - ' + order.status + ' ' + order.folio + '*',
        'Cliente: ' + order.client_name,
        '--------------------------------',
        ...order.items.map(i => '• ' + i.quantity + 'x ' + i.product_name + ' ($' + parseFloat(i.line_total).toFixed(2) + ')'),
        '--------------------------------',
        'Total (IVA incluido): *$' + parseFloat(order.total).toLocaleString('es-MX', { minimumFractionDigits: 2 }) + ' MXN*'
    ];

    const rawPhone = (order.client_phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(lines.join('\n'));
    const url = rawPhone
        ? 'https://wa.me/' + rawPhone + '?text=' + text
        : 'https://wa.me/?text=' + text;

    window.open(url, '_blank');
}

// --- UTILIDADES Y FORMULARIOS ---
function filterTable(tableId, query) {
    const term = query.toLowerCase();
    const rows = document.querySelectorAll('#' + tableId + ' tr');
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
}

function exportTableToCSV(filename, tableId) {
    const rows = document.querySelectorAll('#' + tableId + ' tr');
    let csv = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        let rowData = [];
        cols.forEach((col, idx) => {
            if (idx < cols.length - 1) rowData.push('"' + col.innerText + '"');
        });
        if (rowData.length) csv.push(rowData.join(','));
    });

    const csvFile = new Blob([csv.join('\n')], { type: 'text/csv' });
    const downloadLink = document.createElement('a');
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.click();
}

async function deleteClient(id) {
    if (confirm('¿Deseas eliminar este cliente?')) {
        await fetchAuth('/api/clients/' + id, { method: 'DELETE' });
        showToast('✅ Cliente eliminado');
        loadAllData();
    }
}

async function deleteProduct(id) {
    if (confirm('¿Deseas eliminar este producto?')) {
        await fetchAuth('/api/products/' + id, { method: 'DELETE' });
        showToast('✅ Producto eliminado');
        loadAllData();
    }
}

document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        business_name: document.getElementById('c-negocio').value,
        contact_name: document.getElementById('c-contacto').value,
        phone: document.getElementById('c-telefono').value,
        city: document.getElementById('c-ciudad').value
    };

    await fetchAuth('/api/clients', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    closeModal('modal-cliente');
    e.target.reset();
    showToast('✅ Cliente guardado');
    loadAllData();
});

document.getElementById('form-producto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        sku: document.getElementById('p-sku').value.trim().toUpperCase(),
        name: document.getElementById('p-nombre').value,
        category: document.getElementById('p-categoria').value,
        brand: document.getElementById('p-marca').value,
        price: parseFloat(document.getElementById('p-precio').value),
        stock_quantity: parseInt(document.getElementById('p-stock').value, 10)
    };

    await fetchAuth('/api/products', {
        method: 'POST',
        body: JSON.stringify(body)
    });

    closeModal('modal-producto');
    e.target.reset();
    showToast('✅ Producto guardado');
    loadAllData();
});

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

// =========================================================
// MÓDULO ESCÁNER DE SKU Y CÓDIGOS DE BARRAS (html5-qrcode + DFA)
// =========================================================
let html5QrCode = null;
let scanCooldown = false;

const SKU_DFA_REGEX = /^([A-Z]{3,4}-[A-Z0-9]{3,6}-\d{2}|\d{8,14})$/;

async function abrirEscanerSKU() {
    const modal = document.getElementById('scanner-modal');
    const feedback = document.getElementById('scanner-feedback');
    modal.style.display = 'flex';
    feedback.style.color = '#94A3B8';
    feedback.innerText = 'Iniciando cámara trasera...';

    try {
        html5QrCode = new Html5Qrcode('qr-reader');
        await html5QrCode.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: { width: 270, height: 130 } },
            onScanSuccess,
            () => {}
        );
        feedback.innerText = 'Listo. Apunta al código de barras o QR del equipo.';
    } catch (err) {
        feedback.style.color = '#F87171';
        feedback.innerText = 'No se pudo abrir la cámara. Revisa los permisos del navegador.';
        console.error(err);
    }
}

async function cerrarEscanerSKU() {
    const modal = document.getElementById('scanner-modal');
    if (html5QrCode) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
        } catch (e) {
            console.warn('Escáner ya detenido');
        }
        html5QrCode = null;
    }
    modal.style.display = 'none';
}

async function onScanSuccess(decodedText) {
    if (scanCooldown) return;
    scanCooldown = true;
    setTimeout(() => { scanCooldown = false; }, 2000);

    const sku = decodedText.trim().toUpperCase();
    const feedback = document.getElementById('scanner-feedback');
    const mode = document.querySelector('input[name="scanMode"]:checked').value;

    // 1. Validación Léxica con el Autómata (DFA)
    if (!SKU_DFA_REGEX.test(sku)) {
        feedback.style.color = '#FBBF24';
        feedback.innerHTML = '⚠️ Código leído: <b>' + sku + '</b><br>Formato inválido (esperado: SKU XXX-XXX-00 o código de barras EAN/UPC).';
        return;
    }

    if (navigator.vibrate) navigator.vibrate(100);

    // 2A. MODO CONSULTA
    if (mode === 'search') {
        document.getElementById('search-products').value = sku;
        document.getElementById('filter-category').value = 'all';
        applyProductFilters();
        showToast('🔍 Filtrado por código: ' + sku);
        cerrarEscanerSKU();
        return;
    }

    // 2B. MODO ALTA DE PRODUCTO NUEVO (BARRAS O QR)
    if (mode === 'register') {
        const existing = allProductsCache.find(p => p.sku.toUpperCase() === sku);
        if (existing) {
            feedback.style.color = '#FBBF24';
            feedback.innerHTML = '⚠️ El código <b>' + sku + '</b> ya existe en catálogo:<br><b>' + existing.name + '</b> (' + existing.stock_quantity + ' unids.)';
            return;
        }

        await cerrarEscanerSKU();
        document.getElementById('form-producto').reset();
        openModal('modal-producto');
        document.getElementById('p-sku').value = sku;
        document.getElementById('p-nombre').focus();
        showToast('➕ Código ' + sku + ' listo para registrar');
        return;
    }

    // 2C. MODO SALIDA RÁPIDA (-1)
    if (mode === 'decrement') {
        feedback.style.color = '#22D3EE';
        feedback.innerText = 'Procesando salida de ' + sku + '...';

        try {
            const res = await fetchAuth('/api/products/' + encodeURIComponent(sku) + '/decrement', {
                method: 'PATCH'
            });
            const data = await res.json();

            if (!res.ok) {
                feedback.style.color = '#F87171';
                feedback.innerText = '❌ ' + data.error;
                return;
            }

            feedback.style.color = '#34D399';
            feedback.innerHTML = '✅ <b>' + data.product.name + '</b><br>Nuevo stock: <b>' + data.product.stock_quantity + ' unids.</b>' +
                (data.low_stock_alert ? '<br><span style="color:#F87171;">🔔 ¡Alerta de stock crítico activada!</span>' : '');

            showToast('📦 ' + data.message);
            await loadAllData();
        } catch (err) {
            feedback.style.color = '#F87171';
            feedback.innerText = 'Error de conexión con el servidor.';
        }
    }
}
