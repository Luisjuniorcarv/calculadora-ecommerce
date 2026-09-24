/**
 * Auditor Silencioso - Camada de Normalização de Dados (Ingestion & Adapters)
 * Converte payloads heterogêneos de Meta Ads, Google Ads, CRMs (HubSpot, RD Station, etc),
 * Formulários de Landing Page, Webhooks e Gateways de E-commerce para o Modelo Padronizado Interno.
 */

const { 
  createNormalizedLead, 
  createNormalizedTransaction, 
  createNormalizedTraffic 
} = require('./models');

class Normalizer {
  
  // --- 1. NORMALIZAÇÃO DE EVENTOS DE LEADS ---
  
  /**
   * Converte payloads genéricos de Webhook (n8n, Make, Zapier, Webhook direto)
   */
  normalizeLeadWebhook(payload, tenantId) {
    const body = payload.body || payload;
    const query = payload.query || {};

    const resolvedTenant = tenantId || query.tenantId || body.tenantId || (body.data && body.data.tenantId) || query.loja || body.store_id || 'tenant-padrao';
    const now = Date.now();
    const data = body.data || body;

    // Mapeamento flexível de campos de nomes e contatos
    const name = data.name || data.customerName || data.nome || body.name || body.nome || body.full_name || body.first_name || 'Lead sem nome';
    const phone = String(data.phone || data.telefone || data.whatsapp || data.celular || body.phone || body.telefone || query.wa || '').replace(/\D/g, '');
    const email = data.email || data.customerEmail || data.mail || body.email || body.mail || '';
    
    // Origem e campanha
    const source = (data.source || body.source || body.origem || body.utm_source || (body.source === 'drophub' ? 'drophub' : 'webhook')).toLowerCase();
    const campaignId = data.campaignId || data.campaign_id || body.campaignId || body.campaign_id || body.utm_campaign || 'campanha-geral';
    const campaignName = data.campaignName || data.campaign_name || body.campaignName || body.campaign_name || body.utm_campaign || 'Campanha Principal';

    // Etapa inicial ou transição
    const eventType = String(body.eventType || body.type || body.event || body.action || query.event || '').toLowerCase();
    let stage = (data.stage || body.stage || body.etapa || 'lead').toLowerCase();

    // Inferência inteligente por tipo de evento
    if (eventType.includes('customer_created')) stage = 'lead';
    if (eventType.includes('order_created')) stage = 'opportunity';
    if (eventType.includes('order_paid') || eventType.includes('payment_approved')) stage = 'won';
    if (eventType.includes('contact') || eventType.includes('atend')) stage = 'contacted';
    if (eventType.includes('qualif')) stage = 'qualified';
    if (eventType.includes('agend') || eventType.includes('schedul')) stage = 'scheduled';
    if (eventType.includes('comparec') || eventType.includes('attend')) stage = 'attended';
    if (eventType.includes('propost') || eventType.includes('opportun')) stage = 'opportunity';
    if (eventType.includes('venda') || eventType.includes('won') || eventType.includes('fech')) stage = 'won';

    const leadId = data.id || data.leadId || data.customerId || body.leadId || body.lead_id || body.id || ('lead_' + Math.random().toString(36).substring(2, 9));
    const dealValue = Number(data.dealValue || data.totalAmount || data.amount || body.dealValue || body.deal_value || body.valor || body.amount || 0);

    return createNormalizedLead({
      id: leadId,
      tenantId: resolvedTenant,
      name,
      phone,
      email,
      source,
      campaignId,
      campaignName,
      adsetId: body.adsetId || body.adset_id || null,
      adId: body.adId || body.ad_id || null,
      currentStage: stage,
      status: stage === 'won' ? 'won' : 'active',
      dealValue,
      createdAt: body.createdAt ? new Date(body.createdAt).getTime() : now,
      firstContactAt: stage === 'contacted' ? now : (body.firstContactAt ? new Date(body.firstContactAt).getTime() : null),
      qualifiedAt: stage === 'qualified' ? now : (body.qualifiedAt ? new Date(body.qualifiedAt).getTime() : null),
      scheduledAt: stage === 'scheduled' ? now : (body.scheduledAt ? new Date(body.scheduledAt).getTime() : null),
      attendedAt: stage === 'attended' ? now : (body.attendedAt ? new Date(body.attendedAt).getTime() : null),
      wonAt: stage === 'won' ? now : (body.wonAt ? new Date(body.wonAt).getTime() : null)
    });
  }

  /**
   * Converte eventos de Lead Ads do Meta (Facebook/Instagram)
   */
  normalizeMetaLeadGen(payload, tenantId) {
    const entry = payload.entry?.[0] || payload;
    const change = entry.changes?.[0]?.value || payload;

    return createNormalizedLead({
      id: change.leadgen_id ? `meta_${change.leadgen_id}` : `lead_${Math.random().toString(36).substring(2, 9)}`,
      tenantId: tenantId || 'tenant-padrao',
      name: change.full_name || change.name || 'Lead Meta Ads',
      phone: change.phone_number || change.phone || '',
      email: change.email || '',
      source: 'meta_ads',
      campaignId: change.campaign_id || 'meta-camp-lead',
      campaignName: change.campaign_name || 'Meta Lead Ads',
      adsetId: change.adset_id || null,
      adId: change.ad_id || null,
      currentStage: 'lead',
      status: 'active',
      createdAt: change.created_time ? new Date(change.created_time * 1000).getTime() : Date.now()
    });
  }

  /**
   * Converte webhooks de CRMs comuns (RD Station, HubSpot, Pipedrive, ActiveCampaign)
   */
  normalizeCrmWebhook(payload, tenantId, crmName = 'crm') {
    const body = payload.body || payload;
    
    // RD Station / HubSpot pattern
    const contact = body.lead || body.contact || body;
    const deal = body.deal || body.opportunity || {};

    let stage = 'lead';
    if (deal.stage || body.deal_stage) {
      const crmStage = String(deal.stage || body.deal_stage).toLowerCase();
      if (crmStage.includes('qualif')) stage = 'qualified';
      else if (crmStage.includes('agend') || crmStage.includes('reuni')) stage = 'scheduled';
      else if (crmStage.includes('propost')) stage = 'opportunity';
      else if (crmStage.includes('ganho') || crmStage.includes('won')) stage = 'won';
    }

    return createNormalizedLead({
      id: `${crmName}_${contact.id || Math.random().toString(36).substring(2, 9)}`,
      tenantId: tenantId || 'tenant-padrao',
      name: contact.name || contact.first_name || 'Contato CRM',
      phone: contact.phone || contact.mobile_phone || '',
      email: contact.email || '',
      source: crmName,
      campaignId: contact.source || contact.utm_campaign || 'crm-geral',
      campaignName: contact.utm_campaign || 'Campanha CRM',
      currentStage: stage,
      status: stage === 'won' ? 'won' : 'active',
      dealValue: Number(deal.amount || deal.value || 0),
      createdAt: Date.now()
    });
  }

  // --- 2. NORMALIZAÇÃO DE TRANSAÇÕES (E-COMMERCE) ---

  /**
   * Converte eventos de plataformas de e-commerce e gateways (Shopify, Nuvemshop, Yampi, Mercado Pago, Asaas)
   */
  normalizeEcommerceTransaction(payload, tenantId) {
    const body = payload.body || payload;
    const query = payload.query || {};
    const data = body.data || body;

    const resolvedTenant = tenantId || query.loja || query.tenantId || (data && data.tenantId) || body.store_id || body.loja || 'loja-padrao';
    const rawStatus = String(data.status || body.status || body.event || body.eventType || body.financial_status || '').toLowerCase();

    let status = 'approved';
    if (rawStatus.includes('refus') || rawStatus.includes('recus') || rawStatus.includes('fail') || rawStatus.includes('denied')) {
      status = 'refused';
    } else if (rawStatus.includes('refund') || rawStatus.includes('reembols') || rawStatus.includes('devolv')) {
      status = 'refunded';
    } else if (rawStatus.includes('chargeback') || rawStatus.includes('contest')) {
      status = 'chargeback';
    } else if (rawStatus.includes('cancel')) {
      status = 'refused';
    }

    // Identificação de Meio de Pagamento
    let paymentMethod = 'credit_card';
    const rawMethod = String(data.paymentMethod || data.method || body.payment_method || body.gateway || (body.payment && body.payment.method) || '').toLowerCase();
    if (rawMethod.includes('pix')) paymentMethod = 'pix';
    else if (rawMethod.includes('boleto')) paymentMethod = 'boleto';
    else if (rawMethod.includes('cart') || rawMethod.includes('credit')) paymentMethod = 'credit_card';

    // Gateway
    let gateway = String(data.gateway || body.gateway || body.acquirer || 'mercadopago').toLowerCase();

    // Valores
    const amount = Number(data.totalAmount || data.amount || body.total || body.amount || body.transaction_amount || (body.order && body.order.total) || 0);
    const cost = Number(data.cost || body.cost || (amount * 0.45)); // Fallback aproximado se não fornecido
    const discountAmount = Number(data.discount || body.discount || body.discount_amount || 0);

    return createNormalizedTransaction({
      id: data.orderId || data.paymentId || body.id || body.order_id || ('ord_' + Math.random().toString(36).substring(2, 9)),
      tenantId: resolvedTenant,
      amount,
      cost,
      discountAmount,
      gatewayTaxAmount: Number(body.tax || body.gateway_fee || (amount * 0.04)),
      coupon: body.coupon || body.discount_code || null,
      paymentMethod,
      gateway,
      status,
      failureReason: data.failureReason || body.failure_reason || body.status_detail || null,
      customerName: data.customerName || body.customer?.name || body.payer?.first_name || 'Cliente',
      customerPhone: data.customerPhone || body.customer?.phone || query.wa || '',
      timestamp: Date.now()
    });
  }

  // --- 3. NORMALIZAÇÃO DE TRÁFEGO PAGO (META ADS & GOOGLE ADS) ---

  normalizeTrafficReport(payload, tenantId) {
    const body = payload.body || payload;
    return createNormalizedTraffic({
      id: 'trf_' + Math.random().toString(36).substring(2, 9),
      tenantId: tenantId || body.tenantId || 'tenant-padrao',
      source: String(body.source || 'meta_ads').toLowerCase(),
      campaignId: body.campaignId || body.campaign_id || 'camp-geral',
      campaignName: body.campaignName || body.campaign_name || 'Campanha Principal',
      spend: Number(body.spend || body.cost || body.investimento || 0),
      impressions: Number(body.impressions || body.impressoes || 0),
      clicks: Number(body.clicks || body.cliques || 0),
      sessions: Number(body.sessions || body.visitas || body.clicks || 0),
      timestamp: Date.now()
    });
  }
}

module.exports = new Normalizer();
