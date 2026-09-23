/**
 * Auditor Silencioso - Modelos de Dados Padronizados (Core Models)
 * Suporte nativo para Modo E-commerce e Modo Serviços / Leads
 */

// Tipos de Operação suportados
const OPERATION_MODES = {
  ECOMMERCE: 'ECOMMERCE',
  LEADS: 'LEADS'
};

// Níveis de Severidade de Alertas
const ALERT_SEVERITIES = {
  CRITICAL: 'CRITICAL',   // Problema com potencial impacto financeiro imediato
  WARNING: 'WARNING',     // Desvio relevante que precisa ser acompanhado
  INFO: 'INFO'            // Alteração importante, sem evidência de problema grave
};

// Status do Ciclo de Vida do Alerta
const ALERT_STATUS = {
  OPEN: 'OPEN',                   // Aberto (primeiro disparo)
  TRACKING: 'TRACKING',           // Em acompanhamento (problema persiste)
  RESOLVED: 'RESOLVED'            // Resolvido (métrica voltou ao normal)
};

// Etapas Padrão do Funil de Leads (100% configurável por cliente)
const DEFAULT_LEAD_FUNNEL_STAGES = [
  { id: 'traffic', label: 'Tráfego (Cliques)', isTraffic: true },
  { id: 'visit', label: 'Visitas na Página', isTraffic: true },
  { id: 'lead', label: 'Lead Criado', isLead: true },
  { id: 'contacted', label: 'Lead Contactado', isLead: true },
  { id: 'qualified', label: 'Lead Qualificado', isLead: true },
  { id: 'scheduled', label: 'Agendamento Realizado', isLead: true },
  { id: 'attended', label: 'Comparecimento / Reunião', isLead: true },
  { id: 'opportunity', label: 'Proposta / Oportunidade', isLead: true },
  { id: 'won', label: 'Venda / Contratação Fechada', isLead: true }
];

// Modelo de Configuração da Empresa (Tenant)
function createTenantConfig(data = {}) {
  const mode = data.operationMode || OPERATION_MODES.ECOMMERCE;
  
  return {
    id: data.id || 'empresa-' + Math.random().toString(36).substring(2, 9),
    name: data.name || 'Minha Operação',
    slug: data.slug || 'minha-operacao',
    operationMode: mode, // ECOMMERCE ou LEADS
    segment: data.segment || (mode === OPERATION_MODES.ECOMMERCE ? 'Dropshipping / Varejo' : 'Clínica / Serviços'),
    webhookToken: data.webhookToken || 'sec_' + Math.random().toString(36).substring(2, 15),
    whatsappDestination: data.whatsappDestination || '5511999999999',
    notifyWhatsapp: data.notifyWhatsapp !== undefined ? data.notifyWhatsapp : true,
    notifyWebhook: data.notifyWebhook || null,
    allowedSeverities: data.allowedSeverities || [ALERT_SEVERITIES.CRITICAL, ALERT_SEVERITIES.WARNING],
    
    // Metas e Limiares - Leads
    leadsSettings: {
      funnelStages: data.leadsSettings?.funnelStages || DEFAULT_LEAD_FUNNEL_STAGES,
      maxCpl: Number(data.leadsSettings?.maxCpl || 35.00), // R$ 35,00
      maxFirstResponseMinutes: Number(data.leadsSettings?.maxFirstResponseMinutes || 15), // 15 min
      maxStageStagnationHours: Number(data.leadsSettings?.maxStageStagnationHours || 24), // 24h
      minQualificationRate: Number(data.leadsSettings?.minQualificationRate || 30), // 30%
      minScheduleRate: Number(data.leadsSettings?.minScheduleRate || 40), // 40%
      minShowRate: Number(data.leadsSettings?.minShowRate || 75), // 75%
      dailyBudget: Number(data.leadsSettings?.dailyBudget || 300.00),
      minLeadVolumeForAlert: Number(data.leadsSettings?.minLeadVolumeForAlert || 5)
    },

    // Metas e Limiares - E-commerce
    ecommerceSettings: {
      maxRefusalRatePercent: Number(data.ecommerceSettings?.maxRefusalRatePercent || 25), // 25%
      minRefusalsCount: Number(data.ecommerceSettings?.minRefusalsCount || 3),
      maxNoSaleMinutesBusinessHours: Number(data.ecommerceSettings?.maxNoSaleMinutesBusinessHours || 120), // 2h
      maxAbandonmentRatePercent: Number(data.ecommerceSettings?.maxAbandonmentRatePercent || 75), // 75%
      minCartVolumeForAlert: Number(data.ecommerceSettings?.minCartVolumeForAlert || 8),
      minStockDaysThreshold: Number(data.ecommerceSettings?.minStockDaysThreshold || 3), // 3 dias
      maxRefundRatePercent: Number(data.ecommerceSettings?.maxRefundRatePercent || 5) // 5%
    },

    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

// Modelo de Lead Normalizado
function createNormalizedLead(data = {}) {
  return {
    id: data.id || 'lead_' + Math.random().toString(36).substring(2, 9),
    tenantId: data.tenantId,
    name: data.name || 'Lead sem nome',
    phone: data.phone || '',
    email: data.email || '',
    source: data.source || 'meta_ads', // meta_ads, google_ads, site_form, crm, whatsapp, csv
    campaignId: data.campaignId || 'campanha-geral',
    campaignName: data.campaignName || 'Campanha Padrão',
    adsetId: data.adsetId || null,
    adId: data.adId || null,
    currentStage: data.currentStage || 'lead',
    status: data.status || 'active', // active, won, lost
    assignedTo: data.assignedTo || null,
    dealValue: Number(data.dealValue || 0),
    
    // Rastreamento temporal de etapas
    createdAt: data.createdAt || Date.now(),
    firstContactAt: data.firstContactAt || null,
    qualifiedAt: data.qualifiedAt || null,
    scheduledAt: data.scheduledAt || null,
    attendedAt: data.attendedAt || null,
    wonAt: data.wonAt || null,
    lostAt: data.lostAt || null,
    stageUpdatedAt: data.stageUpdatedAt || Date.now(),
    
    history: data.history || [
      { stage: data.currentStage || 'lead', timestamp: data.createdAt || Date.now(), note: 'Lead capturado' }
    ]
  };
}

// Modelo de Transação / Pedido Normalizado (E-commerce)
function createNormalizedTransaction(data = {}) {
  return {
    id: data.id || 'ord_' + Math.random().toString(36).substring(2, 9),
    tenantId: data.tenantId,
    amount: Number(data.amount || 0),
    cost: Number(data.cost || 0), // Custo do produto + frete
    discountAmount: Number(data.discountAmount || 0),
    gatewayTaxAmount: Number(data.gatewayTaxAmount || 0),
    coupon: data.coupon || null,
    paymentMethod: String(data.paymentMethod || 'credit_card').toLowerCase(), // credit_card, pix, boleto
    gateway: String(data.gateway || 'mercadopago').toLowerCase(), // mercadopago, appmax, asaas, pagarme
    status: String(data.status || 'approved').toLowerCase(), // approved, refused, pending, refunded, chargeback
    failureReason: data.failureReason || null,
    customerName: data.customerName || 'Cliente',
    customerPhone: data.customerPhone || '',
    items: data.items || [],
    timestamp: data.timestamp || Date.now()
  };
}

// Modelo de Tráfego / Gastos com Anúncios Normalizado
function createNormalizedTraffic(data = {}) {
  return {
    id: data.id || 'trf_' + Math.random().toString(36).substring(2, 9),
    tenantId: data.tenantId,
    source: data.source || 'meta_ads', // meta_ads, google_ads
    campaignId: data.campaignId || 'camp_geral',
    campaignName: data.campaignName || 'Campanha Principal',
    spend: Number(data.spend || 0), // R$ investido
    impressions: Number(data.impressions || 0),
    clicks: Number(data.clicks || 0),
    sessions: Number(data.sessions || 0),
    timestamp: data.timestamp || Date.now()
  };
}

// Modelo de Registro de Alerta (Imutável no Histórico)
function createAlertRecord(data = {}) {
  return {
    id: data.id || 'alt_' + Math.random().toString(36).substring(2, 10),
    tenantId: data.tenantId,
    tenantName: data.tenantName || 'Empresa',
    operationMode: data.operationMode || OPERATION_MODES.ECOMMERCE,
    alertKey: data.alertKey, // Código único da regra (ex: PICO_RECUSA, CPL_ANORMAL)
    title: data.title,
    severity: data.severity || ALERT_SEVERITIES.WARNING,
    status: data.status || ALERT_STATUS.OPEN,
    
    // Dados quantitativos da anomalia
    currentValue: data.currentValue,
    expectedValue: data.expectedValue,
    metricUnit: data.metricUnit || '%',
    anomalyDetails: data.anomalyDetails || {},
    
    // Contexto (onde ocorreu)
    entityType: data.entityType || 'general', // campaign, payment_method, gateway, funnel_stage, product
    entityId: data.entityId || 'general',
    entityName: data.entityName || '',
    
    // Mensagem orientada à ação
    whatsappMessage: data.whatsappMessage || '',
    recommendedAction: data.recommendedAction || '',
    
    // Timestamps
    firstTriggeredAt: data.firstTriggeredAt || Date.now(),
    lastTriggeredAt: data.lastTriggeredAt || Date.now(),
    resolvedAt: data.resolvedAt || null,
    cooldownUntil: data.cooldownUntil || (Date.now() + 30 * 60 * 1000)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OPERATION_MODES,
    ALERT_SEVERITIES,
    ALERT_STATUS,
    DEFAULT_LEAD_FUNNEL_STAGES,
    createTenantConfig,
    createNormalizedLead,
    createNormalizedTransaction,
    createNormalizedTraffic,
    createAlertRecord
  };
}
