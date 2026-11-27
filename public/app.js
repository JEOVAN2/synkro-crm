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
            showToast(`📅 Vistas actualizadas a: ${labelText}`); updateDashboard(allClientsCache, allProductsCache); }); }); });  // Desplegar / Ocultar Panel de Notificaciones function toggleNotifDropdown() { const dropdown = document.getElementById('notif-dropdown'); dropdown.style.display = (dropdown.style.display === 'none' \vert{}\vert{} !dropdown.style.display) ? 'block' : 'none'; }  // Cerrar el panel al hacer clic en cualquier parte fuera de la campana document.addEventListener('click', (e) => { const notifBtn = document.querySelector('.btn-notif'); const dropdown = document.getElementById('notif-dropdown'); if (notifBtn && dropdown && !notifBtn.parentElement.contains(e.target)) { dropdown.style.display = 'none'; } });  function checkAuth() { const token = localStorage.getItem('synkro_token'); const username = localStorage.getItem('synkro_user');  if (token) { document.getElementById('login-screen').style.display = 'none'; document.getElementById('app-content').style.display = 'block'; document.getElementById('user-display').innerText = `👤 ${username}`;
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
            showToast(`¡Bienvenido ${data.username}!`); checkAuth(); } else { alert(data.error \vert{}\vert{} 'Credenciales incorrectas'); } } catch (err) { alert('Error al conectar con el servidor'); } });  function logout() { localStorage.removeItem('synkro_token'); localStorage.removeItem('synkro_user'); checkAuth(); }  async function fetchAuth(url, options = {}) { const token = localStorage.getItem('synkro_token'); options.headers = { ...options.headers, 'Authorization': `Bearer ${token}`,
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
    if (syncEl) syncEl.innerText = `⏱️ Sincronizado: ${timeStr}`; }  function switchTab(tab) { document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(sec => sec.style.display = 'none'); document.getElementById(`sec-${tab}`).style.display = 'block';
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
            <td>${c.city || '-
