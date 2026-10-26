let chartCatInstance = null;
let chartCityInstance = null;
let allProductsCache = [];
let allClientsCache = [];
let currentRange = 'week';

// Métricas por rango de tiempo (Día, Semana, Mes, Año)
const rangeMetrics = {
    day: {
        labels: ['08:00 AM', '11:00 AM', '02:00 PM', '05:00 PM', '08:00 PM'],
        data: [1, 4, 2, 5, 2],
        subtext: 'Movimientos de Hoy'
    },
    week: {
        labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        data: [12, 19, 15, 22, 18, 25, 10],
        subtext: 'Movimientos de esta Semana'
    },
    month: {
        labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
        data: [45, 68, 52, 84],
        subtext: 'Movimientos de este Mes'
    },
    year: {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'],
        data: [120, 210, 310, 450, 580, 720, 890, 1020, 1150, 1280],
        subtext: 'Movimientos del Año'
    }
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log(err));
    }

    // Selector de Rango Temporal
    document.querySelectorAll('input[name="cir-range"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentRange = e.target.value;
            const labelText = e.target.nextElementSibling.innerText;
            showToast(`📅 Vistas actualizadas a: ${labelText}`);
            updateDashboard(allClientsCache, allProductsCache);
        });
    });
});

// Desplegar / Ocultar Panel de Notificaciones
function toggleNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    dropdown.style.display = (dropdown.style.display === 'none' || !dropdown.style.display) ? 'block' : 'none';
}

// Cerrar el panel al hacer clic en cualquier parte fuera de la campana
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
        document.getElementById('user-display').innerText = `👤 ${username}`;
        loadAllData();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-content').style.display = 'none';
    }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-user').value;
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
            showToast(`¡Bienvenido ${data.username}!`);
            checkAuth();
        } else {
            alert(data.error || 'Credenciales incorrectas');
        }
    } catch (err) {
        alert('Error al conectar con el servidor');
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
        'Authorization': `Bearer ${token}`,
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
        updateDashboard(clients, products);
        updateSyncTimestamp();
    } catch (err) {
        console.error(err);
    }
}

function updateSyncTimestamp() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const syncEl = document.getElementById('last-sync-time');
    if (syncEl) syncEl.innerText = `⏱️ Sincronizado: ${timeStr}`;
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(sec => sec.style.display = 'none');
    document.getElementById(`sec-${tab}`).style.display = 'block';
    event.target.classList.add('active');
}

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
        const isLowStock = parseInt(p.stock_quantity) <= 5;
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
                <td><button class="btn-danger" onclick="deleteProduct(${p.id})">🗑️ Eliminar</button></td>
            </tr>
        `;
    }).join('');
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

function updateDashboard(clients, products) {
    const metrics = rangeMetrics[currentRange] || rangeMetrics.week;

    // KPIs
    document.getElementById('kpi-clientes').innerText = clients.length;
    
    const totalStock = products.reduce((acc, p) => acc + (parseInt(p.stock_quantity) || 0), 0);
    document.getElementById('kpi-stock').innerText = `${totalStock} Unids.`;

    const totalValue = products.reduce((acc, p) => acc + ((parseFloat(p.price) || 0) * (parseInt(p.stock_quantity) || 0)), 0);
    document.getElementById('kpi-valor').innerText = `$${totalValue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

    // ENVIAR ALERTAS EXCLUSIVAMENTE AL PANEL DE NOTIFICACIONES (CAMPANA)
    const lowStockItems = products.filter(p => parseInt(p.stock_quantity) <= 5);
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
        notifList.innerHTML = '<p style="color: #A0A0A0; font-size: 13px; margin: 10px 0; text-align: center;">Sin notificaciones pendientes</p>';
    }

    // 1. Gráfico Doughnut: Categorías
    const catMap = {};
    products.forEach(p => {
        const catName = p.category ? p.category.replace(/_/g, ' ') : 'otros';
        catMap[catName] = (catMap[catName] || 0) + parseInt(p.stock_quantity);
    });

    if (chartCatInstance) chartCatInstance.destroy();
    const ctxCat = document.getElementById('chart-categorias').getContext('2d');
    chartCatInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catMap),
            datasets: [{
                data: Object.values(catMap),
                backgroundColor: ['#FF5500', '#00E5FF', '#7C4DFF', '#FFB300', '#4CAF50']
            }]
        },
        options: { plugins: { legend: { labels: { color: '#FAFAFA' } } } }
    });

    // 2. Gráfico de Barras: Dinámico por Rango Activo
    if (chartCityInstance) chartCityInstance.destroy();
    const ctxCity = document.getElementById('chart-ciudades').getContext('2d');
    chartCityInstance = new Chart(ctxCity, {
        type: 'bar',
        data: {
            labels: metrics.labels,
            datasets: [{
                label: metrics.subtext,
                data: metrics.data,
                backgroundColor: '#FF5500',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { color: '#FAFAFA' } },
                y: { ticks: { color: '#FAFAFA' }, beginAtZero: true }
            },
            plugins: { legend: { labels: { color: '#FAFAFA' } } }
        }
    });
}

function filterTable(tableId, query) {
    const term = query.toLowerCase();
    const rows = document.querySelectorAll(`#${tableId} tr`);
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
}

function exportTableToCSV(filename, tableId) {
    const rows = document.querySelectorAll(`#${tableId} tr`);
    let csv = [];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        let rowData = [];
        cols.forEach((col, idx) => {
            if (idx < cols.length - 1) rowData.push(`"${col.innerText}"`);
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
        await fetchAuth(`/api/clients/${id}`, { method: 'DELETE' });
        showToast('✅ Cliente eliminado');
        loadAllData();
    }
}

async function deleteProduct(id) {
    if (confirm('¿Deseas eliminar este producto?')) {
        await fetchAuth(`/api/products/${id}`, { method: 'DELETE' });
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
        sku: document.getElementById('p-sku').value,
        name: document.getElementById('p-nombre').value,
        category: document.getElementById('p-categoria').value,
        brand: document.getElementById('p-marca').value,
        price: parseFloat(document.getElementById('p-precio').value),
        stock_quantity: parseInt(document.getElementById('p-stock').value)
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
