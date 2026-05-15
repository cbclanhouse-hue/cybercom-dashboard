const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('app');
let adminChartInstance = null;
let employeeChartInstance = null;
let editingServiceId = null;
let employeeServices = [];
let selectedService = null;

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
  if (!username || !password) return alert('Informe usuario e senha');

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
  document.querySelectorAll('.menu a').forEach((anchor) => anchor.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.page').forEach((section) => section.classList.add('hidden'));
  document.getElementById(page).classList.remove('hidden');
}

function displayApp(user) {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  document.getElementById('welcome').innerText = `Ola, ${user.display_name || user.username}`;
  renderUserAvatar(user);
}

function renderUserAvatar(user) {
  const profileSection = document.querySelector('.user-profile-section');
  const currentAvatar = document.getElementById('userAvatar');
  const avatarMarkup = user.photo
    ? `<img id="userAvatar" class="user-avatar" src="${user.photo}" alt="Foto" onclick="window.location.href='profile.html'">`
    : `<div id="userAvatar" class="user-avatar-placeholder" onclick="window.location.href='profile.html'">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      </div>`;

  if (currentAvatar) {
    currentAvatar.outerHTML = avatarMarkup;
  } else if (profileSection) {
    profileSection.insertAdjacentHTML('afterbegin', avatarMarkup);
  }
}

async function loadApp(user) {
  displayApp(user);
  if (user.role === 'admin') {
    setMenu([
      { label: 'Dashboard', page: 'dashboardPage' },
      { label: 'Funcionarios', page: 'employeesPage' },
      { label: 'Servicos', page: 'servicesPage' }
    ]);
    showPage('dashboardPage', document.querySelector('.menu a'));
    await loadAdmin();
  } else {
    setMenu([{ label: 'Minha Area', page: 'employeeHome' }]);
    showPage('employeeHome', document.querySelector('.menu a'));
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
  renderDailyPoints(result.points, result.users);
}

function renderDailyPoints(points, users) {
  const container = document.getElementById('dailyPointsContainer');
  const pointsByUser = {};

  users.filter((user) => user.role === 'employee').forEach((user) => {
    pointsByUser[user.id] = {
      username: user.display_name || user.username,
      photo: user.photo,
      points: []
    };
  });

  points.forEach((point) => {
    if (pointsByUser[point.user_id]) {
      pointsByUser[point.user_id].points.push(point);
    }
  });

  const pointIcons = {
    Cheguei: 'IN',
    'Saiu para almoco': 'AL',
    'Saiu para almoço': 'AL',
    'Voltei do almoco': 'VL',
    'Voltei do almoço': 'VL',
    'Foi embora': 'SA'
  };

  const pointTypeAliases = {
    Cheguei: ['Cheguei'],
    'Saiu para almoco': ['Saiu para almoco', 'Saiu para almoço'],
    'Voltei do almoco': ['Voltei do almoco', 'Voltei do almoço'],
    'Foi embora': ['Foi embora']
  };

  const allExpectedTypes = ['Cheguei', 'Saiu para almoco', 'Voltei do almoco', 'Foi embora'];

  let html = '<div class="points-summary">';

  Object.values(pointsByUser).forEach((userData) => {
    html += `
      <div class="employee-points-card">
        <div class="employee-points-header">
          ${userData.photo
            ? `<img class="employee-avatar" src="${userData.photo}" alt="${userData.username}">`
            : `<div class="employee-avatar-placeholder"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`
          }
          <div>
            <h4>${userData.username}</h4>
            <span>${userData.points.length}/4 registros hoje</span>
          </div>
        </div>
        <div class="points-timeline">
    `;

    allExpectedTypes.forEach((type) => {
      const point = userData.points.find((item) => pointTypeAliases[type].includes(item.type));
      const time = point
        ? new Date(point.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';

      html += `
        <div class="point-item ${point ? '' : 'absent'}">
          <span class="point-icon">${pointIcons[type]}</span>
          <span class="point-type">${type}</span>
          <span class="point-time">${time}</span>
        </div>
      `;
    });

    html += '</div></div>';
  });

  html += '</div>';

  container.innerHTML = Object.keys(pointsByUser).length
    ? html
    : '<p class="empty-state">Nenhum funcionario cadastrado.</p>';
}

function renderUsers(users) {
  document.getElementById('usersTable').innerHTML = `
    <tr><th>Usuario</th><th>Tipo</th><th>Acoes</th></tr>
    ${users.map((user) => `
      <tr>
        <td>${user.username}</td>
        <td>${user.role}</td>
        <td><button class="small-btn" onclick="deleteUser(${user.id})">Apagar</button></td>
      </tr>
    `).join('')}
  `;
}

async function createUser() {
  const username = document.getElementById('newUser').value.trim();
  const password = document.getElementById('newPass').value.trim();
  if (!username || !password) return alert('Preencha usuario e senha');

  const result = await api('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role: 'employee' }) });
  if (result.error) return alert(result.error);

  document.getElementById('newUser').value = '';
  document.getElementById('newPass').value = '';
  alert('Funcionario criado');
  loadAdmin();
}

async function deleteUser(userId) {
  const result = await api(`/api/users/${userId}`, { method: 'DELETE' });
  if (result.error) return alert(result.error);
  alert('Usuario apagado');
  loadAdmin();
}

function renderServices(services) {
  document.getElementById('servicesTable').innerHTML = `
    <tr><th>Servico</th><th>Valor</th><th>Acoes</th></tr>
    ${services.map((service) => `
      <tr>
        <td>${service.name}</td>
        <td>R$ ${Number(service.price).toFixed(2)}</td>
        <td class="action-btns">
          <button class="small-btn edit-btn" onclick="editService(${service.id}, '${service.name.replace(/'/g, "\\'")}', ${Number(service.price)})">Editar</button>
          <button class="small-btn" onclick="deleteService(${service.id})">Apagar</button>
        </td>
      </tr>
    `).join('')}
  `;

  const serviceSelect = document.getElementById('serviceSelect');
  if (serviceSelect) {
    serviceSelect.innerHTML = services.map((service) => `<option value="${service.id}">${service.name}</option>`).join('');
  }
}

function renderEmployeeServicesButtons(services) {
  const container = document.getElementById('employeeServicesButtons');
  if (!container) return;

  employeeServices = services;

  if (!services.length) {
    container.innerHTML = '<p class="empty-state">Nenhum servico cadastrado pelo administrador.</p>';
    return;
  }

  container.innerHTML = services.map((service) => `
    <button class="service-action-btn" onclick="openServiceModal(${service.id})">
      <span class="service-action-name">${service.name}</span>
      <span class="service-action-price">Padrao R$ ${Number(service.price).toFixed(2)}</span>
    </button>
  `).join('');
}

function updateServiceFormState() {
  const saveButton = document.getElementById('saveServiceButton');
  const cancelButton = document.getElementById('cancelServiceEditButton');
  const hint = document.getElementById('serviceFormHint');

  if (!saveButton || !cancelButton || !hint) return;

  if (editingServiceId) {
    saveButton.innerText = 'Salvar Alteracoes';
    cancelButton.classList.remove('hidden');
    hint.innerText = 'Modo de edicao ativo. Ajuste nome e valor e salve as alteracoes.';
  } else {
    saveButton.innerText = 'Criar Servico';
    cancelButton.classList.add('hidden');
    hint.innerText = 'Preencha os campos para cadastrar um novo servico.';
  }
}

function clearServiceForm() {
  document.getElementById('serviceName').value = '';
  document.getElementById('servicePrice').value = '';
  editingServiceId = null;
  updateServiceFormState();
}

function editService(id, name, price) {
  editingServiceId = id;
  document.getElementById('serviceName').value = name;
  document.getElementById('servicePrice').value = Number(price).toFixed(2);
  updateServiceFormState();
  document.getElementById('serviceName').focus();
}

function cancelServiceEdit() {
  clearServiceForm();
}

async function saveService() {
  const name = document.getElementById('serviceName').value.trim();
  const price = document.getElementById('servicePrice').value.trim();
  if (!name || !price) return alert('Preencha nome e valor');

  const path = editingServiceId ? `/api/services/${editingServiceId}` : '/api/services';
  const method = editingServiceId ? 'PUT' : 'POST';

  const result = await api(path, {
    method,
    body: JSON.stringify({ name, price })
  });

  if (result.error) return alert(result.error);

  alert(editingServiceId ? 'Servico atualizado!' : 'Servico criado!');
  clearServiceForm();
  loadAdmin();
}

async function deleteService(id) {
  if (!confirm('Tem certeza que deseja apagar este servico?')) return;
  const result = await api(`/api/services/${id}`, { method: 'DELETE' });
  if (result.error) return alert(result.error);

  if (editingServiceId === id) {
    clearServiceForm();
  }

  alert('Servico apagado!');
  loadAdmin();
}

async function loadEmployee() {
  const servicesResult = await api('/api/services');
  if (servicesResult.error) return alert(servicesResult.error);
  renderEmployeeServicesButtons(servicesResult.services);

  const productionResult = await api('/api/employee/production');
  if (productionResult.error) return alert(productionResult.error);
  renderEmployeeProduction(productionResult.productions);
}

function sumProductionInRange(productions, startDate) {
  return productions
    .filter((production) => new Date(production.date) >= startDate)
    .reduce((sum, production) => sum + Number(production.value), 0);
}

function renderEmployeeProduction(productions) {
  document.getElementById('employeeProductionTable').innerHTML = `
    <tr><th>Servico</th><th>Valor</th><th>Data</th></tr>
    ${productions.map((production) => `
      <tr>
        <td>${production.service}</td>
        <td>R$ ${Number(production.value).toFixed(2)}</td>
        <td>${new Date(production.date).toLocaleString('pt-BR')}</td>
      </tr>
    `).join('')}
  `;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfDay);
  const dayOfWeek = startOfWeek.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  document.getElementById('employeeToday').innerText = `R$ ${sumProductionInRange(productions, startOfDay).toFixed(2)}`;
  document.getElementById('employeeWeek').innerText = `R$ ${sumProductionInRange(productions, startOfWeek).toFixed(2)}`;
  document.getElementById('employeeMonth').innerText = `R$ ${sumProductionInRange(productions, startOfMonth).toFixed(2)}`;

  if (employeeChartInstance) {
    employeeChartInstance.destroy();
  }

  employeeChartInstance = new Chart(document.getElementById('employeeChart'), {
    type: 'line',
    data: {
      labels: productions.map((production) => new Date(production.date).toLocaleDateString('pt-BR')),
      datasets: [{
        label: 'Producao',
        data: productions.map((production) => Number(production.value)),
        borderColor: '#ff7300',
        backgroundColor: 'rgba(255,115,0,0.2)',
        tension: 0.25,
        fill: true
      }]
    }
  });
}

async function point(type) {
  const result = await api('/api/points', { method: 'POST', body: JSON.stringify({ type }) });
  if (result.error) return alert(result.error);
  alert('Ponto registrado');
}

async function registerService(serviceId, customValue) {
  const result = await api('/api/productions', { method: 'POST', body: JSON.stringify({ serviceId, customValue }) });
  if (result.error) return alert(result.error);
  alert('Servico registrado');
  await loadEmployee();
}

function openActionModal(title, description) {
  document.getElementById('actionModalTitle').innerText = title;
  document.getElementById('actionModalDescription').innerText = description;
  document.getElementById('actionModal').classList.remove('hidden');
}

function closeActionModal() {
  document.getElementById('actionModal').classList.add('hidden');
  document.getElementById('serviceModalBody').classList.add('hidden');
  document.getElementById('pointModalBody').classList.add('hidden');
  document.getElementById('serviceChargedValue').value = '';
  selectedService = null;
}

function openServiceModal(serviceId) {
  const service = employeeServices.find((item) => item.id === serviceId);
  if (!service) return;

  selectedService = service;
  openActionModal('Registrar Servico', 'Informe o valor final cobrado nesse atendimento.');
  document.getElementById('serviceModalBody').classList.remove('hidden');
  document.getElementById('pointModalBody').classList.add('hidden');
  document.getElementById('serviceModalName').innerText = service.name;
  document.getElementById('serviceModalBasePrice').innerText = `Valor padrao R$ ${Number(service.price).toFixed(2)}`;
  document.getElementById('serviceChargedValue').value = Number(service.price).toFixed(2);
}

async function confirmServiceRegistration() {
  if (!selectedService) return;

  const customValue = document.getElementById('serviceChargedValue').value.trim();
  if (!customValue) {
    alert('Informe o valor cobrado');
    return;
  }

  await registerService(selectedService.id, customValue);
  closeActionModal();
}

function openPointModal() {
  openActionModal('Registrar Ponto', 'Escolha a etapa correspondente ao seu expediente.');
  document.getElementById('pointModalBody').classList.remove('hidden');
  document.getElementById('serviceModalBody').classList.add('hidden');
}

async function confirmPointRegistration(type) {
  await point(type);
  closeActionModal();
}

function renderAdminCharts(productions) {
  const totalsByUser = productions.reduce((acc, item) => {
    acc[item.user] = (acc[item.user] || 0) + Number(item.value);
    return acc;
  }, {});

  if (adminChartInstance) {
    adminChartInstance.destroy();
  }

  adminChartInstance = new Chart(document.getElementById('adminChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(totalsByUser),
      datasets: [{ label: 'Producao', data: Object.values(totalsByUser), backgroundColor: '#ff7300' }]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      }
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
window.saveService = saveService;
window.editService = editService;
window.cancelServiceEdit = cancelServiceEdit;
window.deleteService = deleteService;
window.point = point;
window.registerService = registerService;
window.openServiceModal = openServiceModal;
window.openPointModal = openPointModal;
window.confirmServiceRegistration = confirmServiceRegistration;
window.confirmPointRegistration = confirmPointRegistration;
window.closeActionModal = closeActionModal;
window.login = login;
window.logout = logout;

checkSession();
