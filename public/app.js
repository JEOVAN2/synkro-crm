let chartCatInstance = null;
let chartCityInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log(err));
    }

    document.querySelectorAll('input[name="cir-range"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            showToast(`📅 Rango cambiado a: ${e.target.nextElementSibling.innerText}`);
        });
    });
});

// Comprobar si hay sesión activa
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

// Evento de Login
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

// Cerrar Sesión
function logout() {
    localStorage.removeItem('synkro_token');
    localStorage.removeItem('synkro_user');
    checkAuth();
}

// Función con Headers de Autenticación
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

// Cargar todos los datos
async function loadAllData() {
    try {
        const clients = await loadClients();
        const products = await loadProducts();
        updateDashboard(clients, products);
    } catch (err) {
        console.error(err);
    }
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
    return products;
}

function updateDashboard(clients, products) {
    document.getElementById('kpi-clientes').innerText = clients.length;
    
    const totalStock = products.reduce((acc, p) => acc + (parseInt(p.stock_quantity) || 0), 0);
    document.getElementById('kpi-stock').innerText = `${totalStock} Unids.`;

    const totalValue = products.reduce((acc, p) => acc + ((parseFloat(p.price) || 0) * (parseInt(p.stock_quantity) || 0)), 0);
    document.getElementById('kpi-valor').innerText = `$${totalValue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

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

    const cityMap = {};
    clients.forEach(c => {
        if (c.city) cityMap[c.city] = (cityMap[c.city] || 0) + 1;
    });

    if (chartCityInstance) chartCityInstance.destroy();
    const ctxCity = document.getElementById('chart-ciudades').getContext('2d');
    chartCityInstance = new Chart(ctxCity, {
        type: 'bar',
        data: {
            labels: Object.keys(cityMap),
            datasets: [{
                label: 'Gimnasios',
                data: Object.values(cityMap),
                backgroundColor: '#FF5500'
            }]
        },
        options: {
            scales: {
                x: { ticks: { color: '#FAFAFA' } },
                y: { ticks: { color: '#FAFAFA' } }
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
