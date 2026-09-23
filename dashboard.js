/**
 * Auditor Silencioso - Controlador do Dashboard SaaS (Frontend)
 * Suporte a alternância de modos (E-commerce / Leads), multiempresa,
 * renderização de funil, saúde da operação e simulador de incidentes.
 */

// Estado Global da Aplicação
const appState = {
  currentTenantId: 'loja-demo',
  currentMode: 'ECOMMERCE',
  tenants: [],
  dashboardData: null,
  isApiOnline: false
};

// URL Base da API (Conecta ao server local na porta 3333 ou fallback inteligente)
const API_BASE = window.location.protocol.startsWith('http') 
  ? window.location.origin 
  : 'http://localhost:3333';

document.addEventListener('DOMContentLoaded', async () => {
  await initDashboard();
  
  // Polling leve a cada 15 segundos para atualizar métricas
  setInterval(refreshDashboardData, 15000);
});

/**
 * Inicialização do Dashboard
 */
async function initDashboard() {
  await loadTenants();
  await refreshDashboardData();
}

/**
 * Carrega lista de empresas
 */
async function loadTenants() {
  try {
    const res = await fetch(`${API_BASE}/api/tenants`);
    if (res.ok) {
      const data = await res.json();
      appState.tenants = data.tenants || [];
      appState.isApiOnline = true;
    }
  } catch (err) {
    console.warn('API não acessível, utilizando dados de fallback em memória:', err.message);
    appState.isApiOnline = false;
    setupFallbackTenants();
  }

  renderTenantSelect();
}

/**
 * Fallback caso o frontend seja aberto via file:// sem o server Node iniciado
 */
function setupFallbackTenants() {
  appState.tenants = [
    {
      id: 'loja-demo',
      name: 'Moda Prime Brasil',
      operationMode: 'ECOMMERCE',
      segment: 'Moda & Acessórios / Dropshipping',
      whatsappDestination: '5511999999999',
      ecommerceSettings: { maxRefusalRatePercent: 25, maxNoSaleMinutesBusinessHours: 120 }
    },
    {
      id: 'clinica-demo',
      name: 'Clínica Odonto Sorriso',
      operationMode: 'LEADS',
      segment: 'Clínica Odontológica & Estética',
      whatsappDestination: '5511988888888',
      leadsSettings: { maxCpl: 30.00, maxFirstResponseMinutes: 10, maxStageStagnationHours: 24 }
    }
  ];
}

/**
 * Renderiza o dropdown de seleção de empresa
 */
function renderTenantSelect() {
  const select = document.getElementById('tenant-select');
  if (!select) return;

  select.innerHTML = appState.tenants.map(t => 
    `<option value="${t.id}" ${t.id === appState.currentTenantId ? 'selected' : ''}>
      ${t.name} (${t.operationMode === 'ECOMMERCE' ? 'E-commerce' : 'Leads'})
    </option>`
  ).join('');
}

/**
 * Alterna a empresa selecionada
 */
async function onTenantChanged(tenantId) {
  appState.currentTenantId = tenantId;
  const tenant = appState.tenants.find(t => t.id === tenantId);
  if (tenant) {
    appState.currentMode = tenant.operationMode;
    updateModeButtonsUI();
  }
  await refreshDashboardData();
}

/**
 * Alterna entre Modo E-commerce e Modo Leads
 */
async function switchOperationMode(mode) {
  appState.currentMode = mode;
  updateModeButtonsUI();

  // Se a empresa atual tiver outro modo, troca para uma correspondente ou atualiza
  const matchingTenant = appState.tenants.find(t => t.operationMode === mode);
  if (matchingTenant && matchingTenant.id !== appState.currentTenantId) {
    appState.currentTenantId = matchingTenant.id;
    const select = document.getElementById('tenant-select');
    if (select) select.value = matchingTenant.id;
  }

  await refreshDashboardData();
}

function updateModeButtonsUI() {
  const btnEcom = document.getElementById('btn-mode-ecommerce');
  const btnLeads = document.getElementById('btn-mode-leads');

  if (appState.currentMode === 'ECOMMERCE') {
    btnEcom?.classList.add('active');
    btnLeads?.classList.remove('active');
    document.getElementById('funnel-section').style.display = 'none';
  } else {
    btnLeads?.classList.add('active');
    btnEcom?.classList.remove('active');
    document.getElementById('funnel-section').style.display = 'block';
  }
}

/**
 * Atualiza os dados do Dashboard via API ou Fallback
 */
async function refreshDashboardData() {
  if (appState.isApiOnline) {
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/${appState.currentTenantId}`);
      if (res.ok) {
        const data = await res.json();
        appState.dashboardData = data;
        renderDashboard(data);
        return;
      }
    } catch (err) {
      console.warn('Erro ao consultar API:', err.message);
    }
  }

  // Fallback reativo para testes locais
  renderFallbackDashboard();
}

/**
 * Renderiza todo o Dashboard com dados reais da API
 */
function renderDashboard(data) {
  renderHealthCard(data.health, data.tenant);
  renderKpis(data.metrics, data.tenant.operationMode);
  if (data.tenant.operationMode === 'LEADS') {
    renderFunnel(data.metrics.funnel);
  }
  renderActiveAlerts(data.activeAlerts);
  renderWhatsappChat(data.activeAlerts, data.dispatchedNotifications);
  renderHistoryTable(data.alertHistory);
}

/**
 * 1. Renderiza o Card de Saúde da Operação
 */
function renderHealthCard(health, tenant) {
  const card = document.getElementById('health-card');
  const disc = document.getElementById('health-disc');
  const title = document.getElementById('health-title');
  const desc = document.getElementById('health-desc');
  const activeCount = document.getElementById('stat-active-count');
  const segment = document.getElementById('stat-tenant-segment');

  card.className = `health-hero-card ${health.level.toLowerCase()}`;
  disc.textContent = health.badge;
  title.textContent = health.level === 'HEALTHY' 
    ? 'Operação Normal' 
    : (health.level === 'CRITICAL' ? `Atenção: ${health.label}` : health.label);
  desc.textContent = health.description;
  activeCount.textContent = health.totalActive;
  activeCount.style.color = health.level === 'CRITICAL' ? '#EF4444' : (health.level === 'WARNING' ? '#F59E0B' : '#10B981');
  
  if (segment && tenant) {
    segment.textContent = tenant.segment || 'Geral';
  }
}

/**
 * 2. Renderiza a grade de KPIs conforme o Modo
 */
function renderKpis(metrics, mode) {
  const container = document.getElementById('kpi-container');
  if (!container || !metrics) return;

  if (mode === 'ECOMMERCE') {
    container.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Faturamento Líquido</span>
          <span class="kpi-icon">💰</span>
        </div>
        <div class="kpi-value">R$ ${(metrics.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="kpi-footer">
          <span>Lucro Líquido: <strong class="trend-good">R$ ${(metrics.netProfit || 0).toFixed(2)}</strong></span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Taxa de Recusa (Cartão)</span>
          <span class="kpi-icon">💳</span>
        </div>
        <div class="kpi-value" style="color: ${Number(metrics.refusalRate) >= 20 ? '#EF4444' : '#10B981'};">
          ${metrics.refusalRate || 0}%
        </div>
        <div class="kpi-footer">
          <span>${metrics.refusedOrdersCount || 0} recusados / ${metrics.approvedOrdersCount || 0} aprovados</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Abandono de Carrinho</span>
          <span class="kpi-icon">🛒</span>
        </div>
        <div class="kpi-value" style="color: ${Number(metrics.abandonmentRate) >= 75 ? '#F59E0B' : '#FFFFFF'};">
          ${metrics.abandonmentRate || 0}%
        </div>
        <div class="kpi-footer">
          <span>${metrics.abandonedCartsCount || 0} de ${metrics.cartsCount || 0} carrinhos</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Estoque em Ruptura</span>
          <span class="kpi-icon">📦</span>
        </div>
        <div class="kpi-value" style="color: ${(metrics.inventoryCriticalCount || 0) > 0 ? '#F59E0B' : '#10B981'};">
          ${metrics.inventoryCriticalCount || 0} produtos
        </div>
        <div class="kpi-footer">
          <span>Previsão de término em menos de 3 dias</span>
        </div>
      </div>
    `;
  } else {
    // MODO LEADS
    container.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Investimento em Tráfego</span>
          <span class="kpi-icon">📢</span>
        </div>
        <div class="kpi-value">R$ ${(metrics.totalSpend || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        <div class="kpi-footer">
          <span>Cliques gerados: <strong>${metrics.totalClicks || 0}</strong></span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Leads Capturados</span>
          <span class="kpi-icon">🎯</span>
        </div>
        <div class="kpi-value">${metrics.totalLeads || 0}</div>
        <div class="kpi-footer">
          <span>Qualificados: <strong class="trend-good">${metrics.qualifiedCount || 0}</strong></span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Custo Médio por Lead (CPL)</span>
          <span class="kpi-icon">💸</span>
        </div>
        <div class="kpi-value" style="color: ${Number(metrics.cpl) >= 35 ? '#EF4444' : '#10B981'};">
          R$ ${metrics.cpl || '0,00'}
        </div>
        <div class="kpi-footer">
          <span>Meta máxima: R$ 30,00</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-title">Vendas / Fechamentos</span>
          <span class="kpi-icon">🤝</span>
        </div>
        <div class="kpi-value">${metrics.wonCount || 0}</div>
        <div class="kpi-footer">
          <span>Faturamento: <strong class="trend-good">R$ ${(metrics.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
        </div>
      </div>
    `;
  }
}

/**
 * 3. Renderiza o Funil de Leads
 */
function renderFunnel(funnelStages) {
  const container = document.getElementById('funnel-pipeline-container');
  if (!container || !funnelStages) return;

  container.innerHTML = funnelStages.map((step, idx) => {
    const isBottleneck = idx > 2 && step.count === 0 && funnelStages[idx - 1]?.count >= 4;
    return `
      <div class="funnel-step ${isBottleneck ? 'bottleneck' : ''}">
        <div class="step-label">${step.label}</div>
        <div class="step-count">${step.count || 0}</div>
      </div>
      ${idx < funnelStages.length - 1 ? '<span class="funnel-arrow">➔</span>' : ''}
    `;
  }).join('');
}

/**
 * 4. Renderiza os Alertas Ativos
 */
function renderActiveAlerts(alerts) {
  const container = document.getElementById('alerts-list-container');
  const badge = document.getElementById('active-alerts-badge');
  if (!container) return;

  if (badge) badge.textContent = `${(alerts || []).length} Ativos`;

  if (!alerts || alerts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
        <h4 style="color: #FFFFFF; font-weight: 700; margin-bottom: 0.25rem;">Nenhum problema detectado</h4>
        <p style="font-size: 0.88rem;">Sua operação está rodando de forma saudável e dentro das metas estipuladas.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="alert-item-card ${a.severity.toLowerCase()}">
      <div class="alert-item-header">
        <div class="alert-badge-group">
          <span class="badge-sev ${a.severity.toLowerCase()}">${a.severity === 'CRITICAL' ? 'Crítico' : 'Atenção'}</span>
          <span class="alert-title-text">${a.title}</span>
        </div>
        <span class="alert-time">${new Date(a.firstTriggeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div class="alert-metrics-box">
        <span>Valor Apurado: <strong style="color: #FFFFFF;">${a.currentValue} ${a.metricUnit || ''}</strong></span>
        <span>Normal Esperado: <strong style="color: var(--text-muted);">${a.expectedValue} ${a.metricUnit || ''}</strong></span>
        <span>Local: <strong style="color: #A5B4FC;">${a.entityName || a.entityId}</strong></span>
      </div>

      <div class="alert-action-rec">
        👉 <strong>Ação Recomendada:</strong> ${a.recommendedAction}
      </div>
    </div>
  `).join('');
}

/**
 * 5. Renderiza a visualização no Celular WhatsApp
 */
function renderWhatsappChat(alerts, dispatches) {
  const container = document.getElementById('whatsapp-chat-container');
  if (!container) return;

  let messages = [];

  // Se houver histórico de disparos reais
  if (dispatches && dispatches.length > 0) {
    messages = dispatches.slice(0, 4).map(d => ({
      text: d.messageText,
      time: new Date(d.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }));
  } else if (alerts && alerts.length > 0) {
    messages = alerts.slice(0, 3).map(a => ({
      text: a.whatsappMessage,
      time: new Date(a.lastTriggeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }));
  } else {
    messages = [{
      text: `🛡️ *[AUDITOR SILENCIOSO]*\n\nSentinela ativo 24/7! Nenhuma anomalia detectada na sua operação. Você será notificado instantaneamente caso haja qualquer travamento.`,
      time: 'Agora'
    }];
  }

  container.innerHTML = messages.map(m => `
    <div class="wa-bubble">
      ${formatWhatsappText(m.text)}
      <div class="wa-bubble-time">${m.time} ✓✓</div>
    </div>
  `).join('');
}

function formatWhatsappText(text) {
  if (!text) return '';
  return text
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

/**
 * 6. Renderiza Tabela de Histórico
 */
function renderHistoryTable(history) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (!history || history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">Sem histórico registrado ainda.</td></tr>`;
    return;
  }

  tbody.innerHTML = history.slice(0, 20).map(item => `
    <tr>
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">
        ${new Date(item.firstTriggeredAt).toLocaleDateString('pt-BR')} ${new Date(item.firstTriggeredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </td>
      <td><strong>${item.title}</strong></td>
      <td>
        <span class="badge-sev ${item.severity.toLowerCase()}">${item.severity === 'CRITICAL' ? 'Crítico' : 'Atenção'}</span>
      </td>
      <td style="color: #A5B4FC;">${item.entityName || item.entityId}</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${item.currentValue} ${item.metricUnit || ''}</td>
      <td style="font-family: var(--font-mono); color: var(--text-muted);">${item.expectedValue} ${item.metricUnit || ''}</td>
      <td>
        <span class="status-tag ${item.status.toLowerCase()}">
          ${item.status === 'RESOLVED' ? '✓ Resolvido' : (item.status === 'TRACKING' ? '⏳ Em Acompanhamento' : '⚠️ Aberto')}
        </span>
      </td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">
        ${item.resolvedAt ? new Date(item.resolvedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : (item.status === 'RESOLVED' ? 'Normalizado' : 'Aguardando ação')}
      </td>
    </tr>
  `).join('');
}

/**
 * Executa Auditoria Manual Imediata
 */
async function runManualAudit() {
  const icon = document.getElementById('audit-spin-icon');
  if (icon) icon.style.display = 'inline-block';

  try {
    if (appState.isApiOnline) {
      await fetch(`${API_BASE}/api/audit/${appState.currentTenantId}`, { method: 'POST' });
    }
    await refreshDashboardData();
  } catch (err) {
    console.error('Erro na auditoria:', err);
  } finally {
    if (icon) icon.style.display = '';
  }
}

/**
 * Dispara Simulação de Testes (1-Clique)
 */
async function triggerSimulation(scenario) {
  closeModal('modal-simulate');

  try {
    if (appState.isApiOnline) {
      const res = await fetch(`${API_BASE}/api/simulate/${appState.currentTenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      if (res.ok) {
        await refreshDashboardData();
        return;
      }
    }
  } catch (err) {
    console.warn('Simulação via API falhou, atualizando simulação local:', err);
  }

  // Fallback simulado
  alert(`Cenário "${scenario}" disparado!`);
  await refreshDashboardData();
}

/**
 * Abre e Fecha Modais
 */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  // Preenche valores do modal de configurações se for o caso
  if (id === 'modal-settings') {
    const tenant = appState.tenants.find(t => t.id === appState.currentTenantId);
    if (tenant) {
      document.getElementById('cfg-mode').value = tenant.operationMode;
      document.getElementById('cfg-segment').value = tenant.segment || '';
      document.getElementById('cfg-name').value = tenant.name || '';
      document.getElementById('cfg-whatsapp').value = tenant.whatsappDestination || '';
      onConfigModeChange(tenant.operationMode);
    }
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function onConfigModeChange(mode) {
  const ecomBlock = document.getElementById('cfg-ecom-block');
  const leadsBlock = document.getElementById('cfg-leads-block');

  if (mode === 'ECOMMERCE') {
    ecomBlock.style.display = 'block';
    leadsBlock.style.display = 'none';
  } else {
    ecomBlock.style.display = 'none';
    leadsBlock.style.display = 'block';
  }
}

async function saveSettings() {
  const mode = document.getElementById('cfg-mode').value;
  const segment = document.getElementById('cfg-segment').value;
  const name = document.getElementById('cfg-name').value;
  const wa = document.getElementById('cfg-whatsapp').value;

  const payload = {
    operationMode: mode,
    segment,
    name,
    whatsappDestination: wa
  };

  if (appState.isApiOnline) {
    await fetch(`${API_BASE}/api/settings/${appState.currentTenantId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Atualiza estado local
  const current = appState.tenants.find(t => t.id === appState.currentTenantId);
  if (current) {
    current.operationMode = mode;
    current.segment = segment;
    current.name = name;
    current.whatsappDestination = wa;
    appState.currentMode = mode;
  }

  closeModal('modal-settings');
  updateModeButtonsUI();
  renderTenantSelect();
  await refreshDashboardData();
}

/**
 * Fallback Offline para quando a API não estiver rodando
 */
function renderFallbackDashboard() {
  const isEcom = appState.currentMode === 'ECOMMERCE';

  const mockHealth = {
    level: 'HEALTHY',
    badge: '🟢',
    label: 'Operação Normal',
    description: 'Todos os indicadores operacionais estão funcionando dentro do padrão.',
    totalActive: 0
  };

  const mockMetrics = isEcom ? {
    totalRevenue: 3450.00,
    netProfit: 1420.00,
    refusalRate: '9.2',
    refusedOrdersCount: 2,
    approvedOrdersCount: 22,
    abandonmentRate: '61.4',
    abandonedCartsCount: 18,
    cartsCount: 29,
    inventoryCriticalCount: 1
  } : {
    totalSpend: 600.00,
    totalClicks: 295,
    totalLeads: 20,
    cpl: '30.00',
    totalRevenue: 6400.00,
    qualifiedCount: 10,
    wonCount: 2,
    funnel: [
      { id: 'traffic', label: 'Tráfego (Cliques)', count: 295 },
      { id: 'visit', label: 'Visitas', count: 271 },
      { id: 'lead', label: 'Leads', count: 20 },
      { id: 'contacted', label: 'Contatados', count: 18 },
      { id: 'qualified', label: 'Qualificados', count: 10 },
      { id: 'scheduled', label: 'Agendados', count: 6 },
      { id: 'attended', label: 'Compareceram', count: 5 },
      { id: 'opportunity', label: 'Propostas', count: 3 },
      { id: 'won', label: 'Vendas Fechadas', count: 2 }
    ]
  };

  renderHealthCard(mockHealth, { segment: isEcom ? 'Moda e Dropshipping' : 'Clínica Odontológica' });
  renderKpis(mockMetrics, appState.currentMode);
  if (!isEcom) renderFunnel(mockMetrics.funnel);
  renderActiveAlerts([]);
  renderWhatsappChat([], []);
  renderHistoryTable([]);
}
