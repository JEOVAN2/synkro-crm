let chartCatInstance = null;
let chartCityInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    loadAllData();

    // REGISTRO DE SERVICE WORKER PARA PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log('⚡ PWA Service Worker registrado con éxito'))
            .catch(err => console.log('❌ Error al registrar SW:', err));
    }

    // Escuchar cambios en el selector de rango de tiempo
    document.querySelectorAll('input[name="cir-range"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const labelText = e.target.nextElementSibling.innerText;
            showToast(`📅 Rango cambiado a: ${labelText}`);
        });
    });
});

// Carga general de información
async function loadAllData() {
    const clients = await loadClients();
    const products = await loadProducts();
    updateDashboard(clients, products);
}

// Navegación por pestañas
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(sec => sec.style.display = 'none');

    document.getElementById(`sec-${tab}`).style.display = 'block';
    event.target.classList.add('active');
}

// Cargar Clientes
async function loadClients() {
    const res = await fetch('/api/clients');
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

// Cargar Productos
async function loadProducts() {
    const res = await fetch('/api/products');
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

// Actualizar Métricas y Gráficos
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

// Filtro en Tiempo Real
function filterTable(tableId, query) {
    const term = query.toLowerCase();
    const rows = document.querySelectorAll(`#${tableId} tr`);
    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
}

// Exportar a CSV
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

// Eliminar Registros
async function deleteClient(id) {
    if (confirm('¿Deseas eliminar este cliente?')) {
        await fetch(`/api/clients/${id}`, { method: 'DELETE' });
        showToast('✅ Cliente eliminado');
        loadAllData();
    }
}

async function deleteProduct(id) {
    if (confirm('¿Deseas eliminar este producto?')) {
        await fetch(`/api/products/${id}`, { method: 'DELETE' });
        showToast('✅ Producto eliminado');
        loadAllData();
    }
}

// Formulario Cliente
document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        business_name: document.getElementById('c-negocio').value,
        contact_name: document.getElementById('c-contacto').value,
        phone: document.getElementById('c-telefono').value,
        city: document.getElementById('c-ciudad').value
    };

    await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    closeModal('modal-cliente');
    e.target.reset();
    showToast('✅ Cliente guardado con éxito');
    loadAllData();
});

// Formulario Producto
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

    await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    closeModal('modal-producto');
    e.target.reset();
    showToast('✅ Producto guardado con éxito');
    loadAllData();
});

// Modales y Toasts
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}