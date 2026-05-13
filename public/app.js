const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('app');

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
  return response.json();
}

async function login() {
  const username = document.getElementById('user').value.trim();
  const password = document.getElementById('pass').value.trim();
  if (!username || !password) return alert('Informe usuário e senha');

  const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (result.error) return alert(result.error);

  loadApp(result.user);
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  window.location.reload();
}

function setMenu(items) {
  const menuArea = document.getElementById('menuArea');
  menuArea.innerHTML = items.map((item, index) => `
    <a class="${index === 0 ? 'active' : ''}" onclick="showPage('${item.page}', this)">${item.label}</a>
  `).join('');
}

function showPage(page, el) {
  document.querySelectorAll('.menu a').forEach(a => a.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.page').forEach(section => section.classList.add('hidden'));
  document.getElementById(page).classList.remove('hidden');
}

function displayApp(user) {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  document.getElementById('welcome').innerText = `Olá, ${user.username}`;
}

async function loadApp(user) {
  displayApp(user);
  if (user.role === 'admin') {
    setMenu([
      { label: 'Dashboard', page: 'dashboardPage' },
      { label: 'Funcionários', page: 'employeesPage' },
      { label: 'Serviços', page: 'servicesPage' }
    ]);
    await loadAdmin();
  } else {
    setMenu([{ label: 'Minha Área', page: 'employeeHome' }]);
    await loadEmployee();
  }
}

async function loadAdmin() {
  const result = await api('/api/dashboard');
  if (result.error) return alert(result.error);

  document.getElementById('employeeCount').innerText = result.employeeCount;
  document.getElementById('totalProduction').innerText = `R$ ${Number(result.totalProduction).toFixed(2)}`;
  document.getElementById('servicesCount').innerText = result.productions.length;

  renderUsers(result.users);
  renderServices(result.services);
  renderAdminCharts(result.productions);
}

function renderUsers(users) {
  document.getElementById('usersTable').innerHTML = `
    <tr><th>Usuário</th><th>Tipo</th><th>Ações</th></tr>
    ${users.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td><button class="small-btn" onclick="deleteUser(${u.id})">Apagar</button></td>
      </tr>
    `).join('')}
  `;
}

async function createUser() {
  const username = document.getElementById('newUser').value.trim();
  const password = document.getElementById('newPass').value.trim();
  if (!username || !password) return alert('Preencha usuário e senha');

  const result = await api('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role: 'employee' }) });
  if (result.error) return alert(result.error);
  alert('Funcionário criado');
  loadAdmin();
}

async function deleteUser(userId) {
  const result = await api(`/api/users/${userId}`, { method: 'DELETE' });
  if (result.error) return alert(result.error);
  alert('Usuário apagado');
  loadAdmin();
}

function renderServices(services) {
  document.getElementById('servicesTable').innerHTML = `
    <tr><th>Serviço</th><th>Valor</th></tr>
    ${services.map(s => `
      <tr>
        <td>${s.name}</td>
        <td>R$ ${Number(s.price).toFixed(2)}</td>
      </tr>
    `).join('')}
  `;
  document.getElementById('serviceSelect').innerHTML = services.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function createService() {
  const name = document.getElementById('serviceName').value.trim();
  const price = document.getElementById('servicePrice').value.trim();
  if (!name || !price) return alert('Preencha nome e valor');

  const result = await api('/api/services', { method: 'POST', body: JSON.stringify({ name, price }) });
  if (result.error) return alert(result.error);
  alert('Serviço criado');
  loadAdmin();
}

async function loadEmployee() {
  const servicesResult = await api('/api/services');
  if (servicesResult.error) return alert(servicesResult.error);
  renderServices(servicesResult.services);

  const productionResult = await api('/api/employee/production');
  if (productionResult.error) return alert(productionResult.error);
  renderEmployeeProduction(productionResult.productions);
}

function renderEmployeeProduction(productions) {
  document.getElementById('employeeProductionTable').innerHTML = `
    <tr><th>Serviço</th><th>Valor</th><th>Data</th></tr>
    ${productions.map(p => `
      <tr>
        <td>${p.service}</td>
        <td>R$ ${Number(p.value).toFixed(2)}</td>
        <td>${new Date(p.date).toLocaleString()}</td>
      </tr>
    `).join('')}
  `;

  const total = productions.reduce((sum, item) => sum + Number(item.value), 0);
  document.getElementById('employeeToday').innerText = `R$ ${total.toFixed(2)}`;
  document.getElementById('employeeWeek').innerText = `R$ ${total.toFixed(2)}`;
  document.getElementById('employeeMonth').innerText = `R$ ${total.toFixed(2)}`;

  new Chart(document.getElementById('employeeChart'), {
    type: 'line',
    data: {
      labels: productions.map((p, index) => `Serviço ${index + 1}`),
      datasets: [{ label: 'Produção', data: productions.map(p => Number(p.value)), borderColor: '#ff7300', backgroundColor: 'rgba(255,115,0,0.2)' }]
    }
  });
}

async function point(type) {
  const result = await api('/api/points', { method: 'POST', body: JSON.stringify({ type }) });
  if (result.error) return alert(result.error);
  alert('Ponto registrado');
}

async function registerService() {
  const serviceId = document.getElementById('serviceSelect').value;
  const customValue = document.getElementById('customValue').value.trim();
  const result = await api('/api/productions', { method: 'POST', body: JSON.stringify({ serviceId, customValue }) });
  if (result.error) return alert(result.error);
  alert('Serviço registrado');
  await loadEmployee();
}

function renderAdminCharts(productions) {
  const totalsByUser = productions.reduce((acc, item) => {
    acc[item.user] = (acc[item.user] || 0) + Number(item.value);
    return acc;
  }, {});

  new Chart(document.getElementById('adminChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(totalsByUser),
      datasets: [{ label: 'Produção', data: Object.values(totalsByUser), backgroundColor: '#ff7300' }]
    }
  });

  const totalsByService = productions.reduce((acc, item) => {
    acc[item.service] = (acc[item.service] || 0) + 1;
    return acc;
  }, {});

  new Chart(document.getElementById('serviceChart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(totalsByService),
      datasets: [{ data: Object.values(totalsByService), backgroundColor: ['#ff7300', '#ffa05f', '#ffd7b5'] }]
    }
  });
}

async function checkSession() {
  const result = await api('/api/session');
  if (result.user) {
    loadApp(result.user);
  }
}

window.showPage = showPage;
window.createUser = createUser;
window.deleteUser = deleteUser;
window.createService = createService;
window.point = point;
window.registerService = registerService;

checkSession();
