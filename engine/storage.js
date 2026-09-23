/**
 * Auditor Silencioso - Camada de Persistência Multi-tenant
 * Garante isolamento estrito de dados entre empresas (tenants)
 */

const fs = require('fs');
const path = require('path');
const { 
  OPERATION_MODES, 
  ALERT_SEVERITIES, 
  ALERT_STATUS, 
  createTenantConfig,
  createAlertRecord 
} = require('./models');

const DATA_FILE = path.join(__dirname, 'auditor_db.json');

class Storage {
  constructor() {
    this.tenants = new Map();         // tenantId -> TenantConfig
    this.leads = new Map();           // tenantId -> Array<NormalizedLead>
    this.transactions = new Map();    // tenantId -> Array<NormalizedTransaction>
    this.carts = new Map();           // tenantId -> Array<{ id, items, total, abandoned, timestamp }>
    this.inventory = new Map();       // tenantId -> Array<{ id, sku, name, currentStock, dailySalesVelocity }>
    this.traffic = new Map();         // tenantId -> Array<NormalizedTraffic>
    this.activeAlerts = new Map();    // tenantId -> Map<alertDeduplicationKey, AlertRecord>
    this.alertHistory = new Map();    // tenantId -> Array<AlertRecord>
    this.baselines = new Map();       // tenantId -> Object (médias históricas calculadas)

    this.loadFromDisk();
    this.ensureDefaultTenants();
  }

  // Inicializa tenants demonstrativos caso o banco esteja vazio
  ensureDefaultTenants() {
    if (this.tenants.size === 0) {
      // 1. Tenant E-commerce
      const ecomTenant = createTenantConfig({
        id: 'loja-demo',
        name: 'Moda Prime Brasil',
        slug: 'loja-demo',
        operationMode: OPERATION_MODES.ECOMMERCE,
        segment: 'Moda e Acessórios / Dropshipping',
        whatsappDestination: '5511999999999',
        notifyWhatsapp: true
      });
      this.saveTenant(ecomTenant);

      // 2. Tenant Leads / Serviços
      const leadsTenant = createTenantConfig({
        id: 'clinica-demo',
        name: 'Clínica Odonto & Estética Sorriso',
        slug: 'clinica-demo',
        operationMode: OPERATION_MODES.LEADS,
        segment: 'Clínica Odontológica / Estética',
        whatsappDestination: '5511988888888',
        notifyWhatsapp: true,
        leadsSettings: {
          maxCpl: 30.00,
          maxFirstResponseMinutes: 10,
          maxStageStagnationHours: 24,
          minQualificationRate: 35,
          minScheduleRate: 45,
          minShowRate: 80
        }
      });
      this.saveTenant(leadsTenant);

      this.seedInitialDemoData();
      this.saveToDisk();
    }

    // 3. Tenant DropHub (Leads Instagram)
    if (!this.tenants.has('drophub')) {
      const dropHubTenant = createTenantConfig({
        id: 'drophub',
        name: 'DropHub (Leads Instagram)',
        slug: 'drophub',
        operationMode: OPERATION_MODES.LEADS,
        segment: 'DropHub Store & Instagram Ads',
        whatsappDestination: '5511999999999',
        notifyWhatsapp: true,
        leadsSettings: {
          maxCpl: 25.00,
          maxFirstResponseMinutes: 15,
          maxStageStagnationHours: 24,
          minQualificationRate: 30,
          minScheduleRate: 40,
          minShowRate: 75
        }
      });
      this.saveTenant(dropHubTenant);
      this.seedDropHubData();
      this.saveToDisk();
    }
  }

  // Gera dados simulados realistas para os tenants padrão
  seedInitialDemoData() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    // --- Dados da Loja E-commerce ---
    const ecomId = 'loja-demo';
    
    // Estoque
    this.inventory.set(ecomId, [
      { id: 'p1', sku: 'VEST-VERAO-01', name: 'Vestido Linho Floral', currentStock: 14, dailySalesVelocity: 6 }, // 2.3 dias (crítico)
      { id: 'p2', sku: 'CALCA-JEANS-02', name: 'Calça Jeans Premium', currentStock: 120, dailySalesVelocity: 8 }, // 15 dias (seguro)
      { id: 'p3', sku: 'JAQUETA-COURO-03', name: 'Jaqueta Biker Street', currentStock: 4, dailySalesVelocity: 3 } // 1.3 dias (crítico)
    ]);

    // Transações normais e algumas recentes
    const txList = [];
    for (let i = 0; i < 25; i++) {
      txList.push({
        id: 'tx_seed_' + i,
        tenantId: ecomId,
        amount: 149.90,
        cost: 65.00,
        paymentMethod: i % 4 === 0 ? 'pix' : 'credit_card',
        gateway: 'mercadopago',
        status: i === 0 || i === 2 ? 'refused' : 'approved',
        timestamp: now - (i * 20 * 60 * 1000)
      });
    }
    this.transactions.set(ecomId, txList);

    // Carrinhos
    const cartList = [];
    for (let i = 0; i < 30; i++) {
      cartList.push({
        id: 'cart_' + i,
        items: [{ title: 'Vestido Linho', price: 149.90 }],
        total: 149.90,
        abandoned: i < 18, // 60% de abandono normal histórico
        timestamp: now - (i * 45 * 60 * 1000)
      });
    }
    this.carts.set(ecomId, cartList);

    // Baseline E-commerce
    this.baselines.set(ecomId, {
      historicalRefusalRate: 9.5, // 9.5% normal
      historicalAbandonmentRate: 62.0, // 62% normal
      historicalDailyRevenue: 3450.00,
      historicalPixFailRate: 4.0
    });

    // --- Dados da Empresa de Leads ---
    const leadsId = 'clinica-demo';
    const leadList = [];

    // Leads no funil
    leadList.push({
      id: 'lead_1',
      tenantId: leadsId,
      name: 'Camila Alencar',
      phone: '11977771111',
      source: 'meta_ads',
      campaignId: 'camp-implantes-sp',
      campaignName: 'Implantes & Facetas SP',
      currentStage: 'contacted',
      status: 'active',
      createdAt: now - 35 * 60 * 1000,
      firstContactAt: now - 8 * 60 * 1000, // Atendida em 27 min (estourou meta de 10)
      stageUpdatedAt: now - 8 * 60 * 1000
    });

    leadList.push({
      id: 'lead_2',
      tenantId: leadsId,
      name: 'Roberto Silveira',
      phone: '11977772222',
      source: 'meta_ads',
      campaignId: 'camp-implantes-sp',
      campaignName: 'Implantes & Facetas SP',
      currentStage: 'lead',
      status: 'active',
      createdAt: now - 22 * 60 * 1000, // Aguardando atendimento há 22 min!
      firstContactAt: null,
      stageUpdatedAt: now - 22 * 60 * 1000
    });

    leadList.push({
      id: 'lead_3',
      tenantId: leadsId,
      name: 'Marcos Vinicius',
      phone: '11977773333',
      source: 'google_ads',
      campaignId: 'google-clareamento',
      campaignName: 'Clareamento Dental',
      currentStage: 'qualified',
      status: 'active',
      createdAt: now - 30 * oneHour, // Parado na etapa há 30h (> 24h)
      firstContactAt: now - 29 * oneHour,
      qualifiedAt: now - 28 * oneHour,
      stageUpdatedAt: now - 28 * oneHour
    });

    // Adiciona leads adicionais para histórico
    for (let i = 4; i <= 20; i++) {
      leadList.push({
        id: 'lead_' + i,
        tenantId: leadsId,
        name: 'Paciente ' + i,
        phone: '119888800' + i,
        source: i % 2 === 0 ? 'meta_ads' : 'google_ads',
        campaignId: 'camp-implantes-sp',
        campaignName: 'Implantes & Facetas SP',
        currentStage: i % 3 === 0 ? 'won' : (i % 2 === 0 ? 'qualified' : 'attended'),
        status: i % 3 === 0 ? 'won' : 'active',
        dealValue: i % 3 === 0 ? 3200.00 : 0,
        createdAt: now - (i * 2 * oneHour),
        firstContactAt: now - (i * 2 * oneHour) + 8 * 60 * 1000,
        qualifiedAt: now - (i * 2 * oneHour) + 30 * 60 * 1000,
        scheduledAt: now - (i * 2 * oneHour) + 60 * 60 * 1000,
        attendedAt: now - (i * 2 * oneHour) + 120 * 60 * 1000,
        wonAt: i % 3 === 0 ? now - (i * 2 * oneHour) + 180 * 60 * 1000 : null,
        stageUpdatedAt: now - (i * 2 * oneHour)
      });
    }
    this.leads.set(leadsId, leadList);

    // Tráfego
    this.traffic.set(leadsId, [
      {
        id: 'trf_1',
        tenantId: leadsId,
        source: 'meta_ads',
        campaignId: 'camp-implantes-sp',
        campaignName: 'Implantes & Facetas SP',
        spend: 420.00,
        clicks: 210,
        sessions: 198,
        timestamp: now
      },
      {
        id: 'trf_2',
        tenantId: leadsId,
        source: 'google_ads',
        campaignId: 'google-clareamento',
        campaignName: 'Clareamento Dental',
        spend: 180.00,
        clicks: 85,
        sessions: 80,
        timestamp: now
      }
    ]);

    // Baseline Leads
    this.baselines.set(leadsId, {
      historicalCpl: 18.50, // CPL histórico normal R$ 18,50
      historicalDailyLeads: 16,
      historicalQualificationRate: 48.0,
      historicalScheduleRate: 52.0,
      historicalShowRate: 82.0
    });
  }

  // Gera dados simulados realistas para o DropHub (Leads Instagram)
  seedDropHubData() {
    const tenantId = 'drophub';
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Leads do Instagram em diferentes etapas do funil
    const igLeads = [
      {
        id: 'ig_lead_01',
        tenantId,
        name: 'Juliana Paes (Instagram Reels)',
        phone: '11987654321',
        email: 'juliana.paes@gmail.com',
        source: 'instagram',
        campaignId: 'camp-ig-reels-lucro',
        campaignName: 'Instagram Reels - Calculadora & Ferramentas',
        currentStage: 'contacted',
        status: 'active',
        createdAt: now - 45 * 60 * 1000,
        firstContactAt: now - 35 * 60 * 1000,
        stageUpdatedAt: now - 35 * 60 * 1000
      },
      {
        id: 'ig_lead_02',
        tenantId,
        name: 'Rafael Silveira (Instagram Direct)',
        phone: '11991234567',
        email: 'rafael.silveira@outlook.com',
        source: 'instagram',
        campaignId: 'camp-ig-stories-bio',
        campaignName: 'Stories Instagram - Link Bio',
        currentStage: 'qualified',
        status: 'active',
        createdAt: now - 2 * oneHour,
        firstContactAt: now - 110 * 60 * 1000,
        qualifiedAt: now - 90 * 60 * 1000,
        stageUpdatedAt: now - 90 * 60 * 1000
      },
      {
        id: 'ig_lead_03',
        tenantId,
        name: 'Lucas Martins (Instagram Lead Ads)',
        phone: '21981112233',
        email: 'lucas.martins@empresa.com.br',
        source: 'instagram',
        campaignId: 'camp-ig-leadform',
        campaignName: 'Formulário Nativo Instagram Ads',
        currentStage: 'scheduled',
        status: 'active',
        createdAt: now - 4 * oneHour,
        firstContactAt: now - 230 * 60 * 1000,
        qualifiedAt: now - 200 * 60 * 1000,
        scheduledAt: now - 180 * 60 * 1000,
        stageUpdatedAt: now - 180 * 60 * 1000
      },
      {
        id: 'ig_lead_04',
        tenantId,
        name: 'Beatriz Vasconcelos',
        phone: '31976543210',
        email: 'beatriz.vasc@hotmail.com',
        source: 'instagram',
        campaignId: 'camp-ig-reels-lucro',
        campaignName: 'Instagram Reels - Calculadora & Ferramentas',
        currentStage: 'won',
        status: 'won',
        dealValue: 997.00,
        createdAt: now - 6 * oneHour,
        firstContactAt: now - 350 * 60 * 1000,
        qualifiedAt: now - 300 * 60 * 1000,
        scheduledAt: now - 260 * 60 * 1000,
        attendedAt: now - 200 * 60 * 1000,
        wonAt: now - 120 * 60 * 1000,
        stageUpdatedAt: now - 120 * 60 * 1000
      }
    ];

    for (let i = 5; i <= 18; i++) {
      igLeads.push({
        id: 'ig_lead_' + i,
        tenantId,
        name: 'Seguidor Instagram ' + i,
        phone: '119822233' + (i < 10 ? '0' + i : i),
        source: 'instagram',
        campaignId: 'camp-ig-reels-lucro',
        campaignName: 'Instagram Reels - Calculadora & Ferramentas',
        currentStage: i % 4 === 0 ? 'won' : (i % 2 === 0 ? 'qualified' : 'contacted'),
        status: i % 4 === 0 ? 'won' : 'active',
        dealValue: i % 4 === 0 ? 997.00 : 0,
        createdAt: now - (i * 3 * oneHour),
        firstContactAt: now - (i * 3 * oneHour) + 7 * 60 * 1000,
        stageUpdatedAt: now - (i * 3 * oneHour)
      });
    }

    this.leads.set(tenantId, igLeads);

    // Tráfego Instagram
    this.traffic.set(tenantId, [
      {
        id: 'trf_ig_1',
        tenantId,
        source: 'instagram',
        campaignId: 'camp-ig-reels-lucro',
        campaignName: 'Instagram Reels - Calculadora & Ferramentas',
        spend: 260.00,
        clicks: 340,
        sessions: 310,
        timestamp: now
      },
      {
        id: 'trf_ig_2',
        tenantId,
        source: 'instagram',
        campaignId: 'camp-ig-stories-bio',
        campaignName: 'Stories Instagram - Link Bio',
        spend: 110.00,
        clicks: 145,
        sessions: 135,
        timestamp: now
      }
    ]);

    // Baseline DropHub
    this.baselines.set(tenantId, {
      historicalCpl: 15.20,
      historicalDailyLeads: 18,
      historicalQualificationRate: 40.0,
      historicalScheduleRate: 45.0,
      historicalShowRate: 80.0
    });
  }

  // --- Operações de Tenant ---
  getTenant(tenantId) {
    return this.tenants.get(tenantId) || null;
  }

  getAllTenants() {
    return Array.from(this.tenants.values());
  }

  saveTenant(tenant) {
    tenant.updatedAt = Date.now();
    this.tenants.set(tenant.id, tenant);
    this.saveToDisk();
    return tenant;
  }

  // --- Operações de Leads ---
  getLeads(tenantId) {
    return this.leads.get(tenantId) || [];
  }

  addLead(lead) {
    const list = this.getLeads(lead.tenantId);
    list.unshift(lead);
    this.leads.set(lead.tenantId, list);
    this.saveToDisk();
    return lead;
  }

  updateLead(tenantId, leadId, updates) {
    const list = this.getLeads(tenantId);
    const index = list.findIndex(l => l.id === leadId);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates, stageUpdatedAt: Date.now() };
      this.leads.set(tenantId, list);
      this.saveToDisk();
      return list[index];
    }
    return null;
  }

  // --- Operações de Transações (E-commerce) ---
  getTransactions(tenantId) {
    return this.transactions.get(tenantId) || [];
  }

  addTransaction(tx) {
    const list = this.getTransactions(tx.tenantId);
    list.unshift(tx);
    // Mantém histórico recente
    if (list.length > 500) list.pop();
    this.transactions.set(tx.tenantId, list);
    this.saveToDisk();
    return tx;
  }

  // --- Operações de Carrinho ---
  getCarts(tenantId) {
    return this.carts.get(tenantId) || [];
  }

  addCart(tenantId, cart) {
    const list = this.getCarts(tenantId);
    list.unshift(cart);
    if (list.length > 300) list.pop();
    this.carts.set(tenantId, list);
    this.saveToDisk();
    return cart;
  }

  // --- Operações de Estoque ---
  getInventory(tenantId) {
    return this.inventory.get(tenantId) || [];
  }

  setInventory(tenantId, items) {
    this.inventory.set(tenantId, items);
    this.saveToDisk();
    return items;
  }

  // --- Operações de Tráfego ---
  getTraffic(tenantId) {
    return this.traffic.get(tenantId) || [];
  }

  addTraffic(trafficRecord) {
    const list = this.getTraffic(trafficRecord.tenantId);
    list.unshift(trafficRecord);
    if (list.length > 100) list.pop();
    this.traffic.set(trafficRecord.tenantId, list);
    this.saveToDisk();
    return trafficRecord;
  }

  // --- Operações de Alertas (Ativos & Histórico) ---
  getActiveAlertsMap(tenantId) {
    if (!this.activeAlerts.has(tenantId)) {
      this.activeAlerts.set(tenantId, new Map());
    }
    return this.activeAlerts.get(tenantId);
  }

  getActiveAlerts(tenantId) {
    return Array.from(this.getActiveAlertsMap(tenantId).values());
  }

  getAlertHistory(tenantId) {
    return this.alertHistory.get(tenantId) || [];
  }

  recordAlert(alert) {
    const tenantId = alert.tenantId;
    const activeMap = this.getActiveAlertsMap(tenantId);
    const dedupKey = `${alert.alertKey}_${alert.entityId || 'general'}`;

    const existing = activeMap.get(dedupKey);
    if (existing && existing.status !== ALERT_STATUS.RESOLVED) {
      // Atualiza alerta existente em tracking
      existing.status = ALERT_STATUS.TRACKING;
      existing.lastTriggeredAt = Date.now();
      existing.currentValue = alert.currentValue;
      existing.whatsappMessage = alert.whatsappMessage;
      activeMap.set(dedupKey, existing);
    } else {
      // Novo alerta
      activeMap.set(dedupKey, alert);
      
      // Adiciona ao histórico append-only
      const history = this.getAlertHistory(tenantId);
      history.unshift(alert);
      if (history.length > 200) history.pop();
      this.alertHistory.set(tenantId, history);
    }

    this.saveToDisk();
    return activeMap.get(dedupKey);
  }

  resolveAlert(tenantId, alertKey, entityId = 'general', resolutionNote = '') {
    const activeMap = this.getActiveAlertsMap(tenantId);
    const dedupKey = `${alertKey}_${entityId}`;
    const alert = activeMap.get(dedupKey);

    if (alert && alert.status !== ALERT_STATUS.RESOLVED) {
      alert.status = ALERT_STATUS.RESOLVED;
      alert.resolvedAt = Date.now();
      alert.resolutionNote = resolutionNote;
      activeMap.delete(dedupKey);

      // Atualiza também no histórico
      const history = this.getAlertHistory(tenantId);
      const histItem = history.find(h => h.id === alert.id);
      if (histItem) {
        histItem.status = ALERT_STATUS.RESOLVED;
        histItem.resolvedAt = Date.now();
        histItem.resolutionNote = resolutionNote;
      }

      this.saveToDisk();
      return alert;
    }
    return null;
  }

  // --- Operações de Baselines ---
  getBaseline(tenantId) {
    return this.baselines.get(tenantId) || {};
  }

  updateBaseline(tenantId, baselineUpdates) {
    const current = this.getBaseline(tenantId);
    this.baselines.set(tenantId, { ...current, ...baselineUpdates });
    this.saveToDisk();
    return this.baselines.get(tenantId);
  }

  // --- Persistência em Disco ---
  saveToDisk() {
    try {
      const data = {
        tenants: Array.from(this.tenants.entries()),
        leads: Array.from(this.leads.entries()),
        transactions: Array.from(this.transactions.entries()),
        carts: Array.from(this.carts.entries()),
        inventory: Array.from(this.inventory.entries()),
        traffic: Array.from(this.traffic.entries()),
        activeAlerts: Array.from(this.activeAlerts.entries()).map(([tId, map]) => [tId, Array.from(map.entries())]),
        alertHistory: Array.from(this.alertHistory.entries()),
        baselines: Array.from(this.baselines.entries())
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      // Ignora erro silenciosamente se sistema de arquivos for somente leitura
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.tenants) this.tenants = new Map(data.tenants);
        if (data.leads) this.leads = new Map(data.leads);
        if (data.transactions) this.transactions = new Map(data.transactions);
        if (data.carts) this.carts = new Map(data.carts);
        if (data.inventory) this.inventory = new Map(data.inventory);
        if (data.traffic) this.traffic = new Map(data.traffic);
        if (data.activeAlerts) {
          this.activeAlerts = new Map(data.activeAlerts.map(([tId, entries]) => [tId, new Map(entries)]));
        }
        if (data.alertHistory) this.alertHistory = new Map(data.alertHistory);
        if (data.baselines) this.baselines = new Map(data.baselines);
      }
    } catch (err) {
      // Se houver falha de leitura, continua com dados em memória
    }
  }
}

// Instância Singleton
const storageInstance = new Storage();

module.exports = storageInstance;
