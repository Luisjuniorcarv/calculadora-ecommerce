/**
 * Auditor Silencioso - Servidor SaaS, APIs REST & Endpoints de Webhook
 * Desenvolvido em Node.js nativo (Zero dependências externas obrigatórias)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const storage = require('./storage');
const normalizer = require('./normalizer');
const alertManager = require('./alert-manager');
const notificationDispatcher = require('./notification-dispatcher');
const { createTenantConfig, OPERATION_MODES, ALERT_SEVERITIES } = require('./models');

const PORT = process.env.ENGINE_PORT || (process.env.PORT && process.env.PORT !== '80' ? Number(process.env.PORT) : 3333);
const PUBLIC_DIR = fs.existsSync(path.resolve(__dirname, '..', 'index.html'))
  ? path.resolve(__dirname, '..')
  : (fs.existsSync('/usr/share/nginx/html/index.html') ? '/usr/share/nginx/html' : path.resolve(__dirname, '..'));

// Helper para parsear JSON de requisições POST/PUT
function parseRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        // Se vier como x-www-form-urlencoded
        const queryParams = new URLSearchParams(body);
        const obj = {};
        for (const [k, v] of queryParams.entries()) obj[k] = v;
        resolve(obj);
      }
    });
  });
}

// Helper para responder JSON
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Token'
  });
  res.end(JSON.stringify(data));
}

// Servidor HTTP Principal
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Tratar Pre-flight CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Webhook-Token'
    });
    return res.end();
  }

  try {
    // ========================================================
    // 1. ENDPOINTS DE INGESTÃO (WEBHOOKS)
    // ========================================================

    // Webhook E-commerce (100% Compatível com /webhook/auditor-checkout e /api/webhooks/checkout)
    if ((pathname === '/webhook/auditor-checkout' || pathname === '/api/webhooks/checkout') && method === 'POST') {
      const body = await parseRequestBody(req);
      const query = parsedUrl.query;
      const tenantId = query.loja || query.tenantId || body.store_id || body.tenantId || 'loja-demo';

      const transaction = normalizer.normalizeEcommerceTransaction({ body, query }, tenantId);
      storage.addTransaction(transaction);

      // Dispara auditoria assíncrona
      const auditResult = await alertManager.runAudit(tenantId);

      return sendJson(res, 200, {
        success: true,
        message: 'Evento de checkout recebido e normalizado com sucesso',
        transactionId: transaction.id,
        auditResult
      });
    }

    // Webhook de Leads & CRM (/api/webhooks/leads)
    if (pathname === '/api/webhooks/leads' && method === 'POST') {
      const body = await parseRequestBody(req);
      const query = parsedUrl.query;
      const tenantId = query.tenantId || body.tenantId || 'clinica-demo';

      const lead = normalizer.normalizeLeadWebhook({ body, query }, tenantId);
      storage.addLead(lead);

      const auditResult = await alertManager.runAudit(tenantId);

      return sendJson(res, 200, {
        success: true,
        message: 'Lead recebido e normalizado no funil',
        leadId: lead.id,
        currentStage: lead.currentStage,
        auditResult
      });
    }

    // Webhook de Tráfego Pago (/api/webhooks/traffic)
    if (pathname === '/api/webhooks/traffic' && method === 'POST') {
      const body = await parseRequestBody(req);
      const query = parsedUrl.query;
      const tenantId = query.tenantId || body.tenantId || 'clinica-demo';

      const trafficRecord = normalizer.normalizeTrafficReport({ body, query }, tenantId);
      storage.addTraffic(trafficRecord);

      const auditResult = await alertManager.runAudit(tenantId);

      return sendJson(res, 200, {
        success: true,
        message: 'Métricas de tráfego registradas',
        trafficId: trafficRecord.id,
        auditResult
      });
    }

    // Webhook de Carrinho de E-commerce (/api/webhooks/cart)
    if (pathname === '/api/webhooks/cart' && method === 'POST') {
      const body = await parseRequestBody(req);
      const query = parsedUrl.query;
      const tenantId = query.tenantId || body.tenantId || 'loja-demo';

      const cart = {
        id: body.id || 'cart_' + Math.random().toString(36).substring(2, 9),
        items: body.items || [],
        total: Number(body.total || 0),
        abandoned: body.abandoned !== undefined ? Boolean(body.abandoned) : true,
        timestamp: Date.now()
      };
      storage.addCart(tenantId, cart);

      const auditResult = await alertManager.runAudit(tenantId);

      return sendJson(res, 200, {
        success: true,
        message: 'Carrinho registrado',
        cartId: cart.id,
        auditResult
      });
    }

    // ========================================================
    // 2. ENDPOINTS DA API REST DO SAAS (DASHBOARD & CONFIGS)
    // ========================================================

    // Listar todos os Tenants (Empresas)
    if (pathname === '/api/tenants' && method === 'GET') {
      const tenants = storage.getAllTenants();
      return sendJson(res, 200, { success: true, tenants });
    }

    // Criar nova empresa
    if (pathname === '/api/tenants' && method === 'POST') {
      const body = await parseRequestBody(req);
      const newTenant = createTenantConfig(body);
      storage.saveTenant(newTenant);
      return sendJson(res, 201, { success: true, tenant: newTenant });
    }

    // Dados consolidados do Dashboard para o Tenant
    if (pathname.startsWith('/api/dashboard/') && method === 'GET') {
      const tenantId = pathname.split('/')[3];
      const tenant = storage.getTenant(tenantId);

      if (!tenant) {
        return sendJson(res, 404, { success: false, error: 'Empresa não encontrada' });
      }

      // Executa auditoria em tempo de consulta para métricas frescas
      await alertManager.runAudit(tenantId);

      const health = alertManager.getOperationHealth(tenantId);
      const activeAlerts = storage.getActiveAlerts(tenantId);
      const alertHistory = storage.getAlertHistory(tenantId);
      const baseline = storage.getBaseline(tenantId);

      let modeData = {};

      if (tenant.operationMode === OPERATION_MODES.ECOMMERCE) {
        const txList = storage.getTransactions(tenantId);
        const approvedTx = txList.filter(t => t.status === 'approved');
        const refusedTx = txList.filter(t => t.status === 'refused');
        const totalSales = approvedTx.reduce((acc, t) => acc + (t.amount || 0), 0);
        const totalProfit = approvedTx.reduce((acc, t) => acc + (t.amount - t.cost - t.gatewayTaxAmount - t.discountAmount), 0);
        const carts = storage.getCarts(tenantId);
        const abandonedCarts = carts.filter(c => c.abandoned);
        const inventory = storage.getInventory(tenantId);

        modeData = {
          totalRevenue: totalSales,
          netProfit: totalProfit,
          approvedOrdersCount: approvedTx.length,
          refusedOrdersCount: refusedTx.length,
          refusalRate: txList.length > 0 ? ((refusedTx.length / txList.length) * 100).toFixed(1) : 0,
          cartsCount: carts.length,
          abandonedCartsCount: abandonedCarts.length,
          abandonmentRate: carts.length > 0 ? ((abandonedCarts.length / carts.length) * 100).toFixed(1) : 0,
          inventoryCriticalCount: inventory.filter(i => (i.currentStock / (i.dailySalesVelocity || 1)) <= 3).length,
          inventory: inventory.slice(0, 10),
          recentTransactions: txList.slice(0, 15)
        };

      } else {
        // MODO LEADS
        const leads = storage.getLeads(tenantId);
        const traffic = storage.getTraffic(tenantId);
        const totalSpend = traffic.reduce((acc, t) => acc + (t.spend || 0), 0);
        const totalClicks = traffic.reduce((acc, t) => acc + (t.clicks || 0), 0);
        const totalLeads = leads.length;
        const cpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : 0;

        const qualifiedLeads = leads.filter(l => l.qualifiedAt || l.currentStage === 'qualified' || l.currentStage === 'scheduled' || l.currentStage === 'won');
        const scheduledLeads = leads.filter(l => l.scheduledAt || l.currentStage === 'scheduled' || l.currentStage === 'attended' || l.currentStage === 'won');
        const attendedLeads = leads.filter(l => l.attendedAt || l.currentStage === 'attended' || l.currentStage === 'won');
        const wonLeads = leads.filter(l => l.wonAt || l.currentStage === 'won');
        const totalRevenue = wonLeads.reduce((acc, l) => acc + (l.dealValue || 0), 0);

        // Funil com contagens reais
        const funnel = (tenant.leadsSettings?.funnelStages || []).map(stage => {
          let count = 0;
          if (stage.id === 'traffic') count = totalClicks;
          else if (stage.id === 'visit') count = Math.round(totalClicks * 0.92);
          else if (stage.id === 'lead') count = totalLeads;
          else if (stage.id === 'contacted') count = leads.filter(l => l.firstContactAt || l.currentStage !== 'lead').length;
          else if (stage.id === 'qualified') count = qualifiedLeads.length;
          else if (stage.id === 'scheduled') count = scheduledLeads.length;
          else if (stage.id === 'attended') count = attendedLeads.length;
          else if (stage.id === 'opportunity') count = leads.filter(l => l.currentStage === 'opportunity' || l.currentStage === 'won').length;
          else if (stage.id === 'won') count = wonLeads.length;
          return { ...stage, count };
        });

        modeData = {
          totalSpend,
          totalClicks,
          totalLeads,
          cpl,
          totalRevenue,
          qualifiedCount: qualifiedLeads.length,
          qualificationRate: totalLeads > 0 ? ((qualifiedLeads.length / totalLeads) * 100).toFixed(1) : 0,
          scheduledCount: scheduledLeads.length,
          scheduleRate: totalLeads > 0 ? ((scheduledLeads.length / totalLeads) * 100).toFixed(1) : 0,
          attendedCount: attendedLeads.length,
          showRate: scheduledLeads.length > 0 ? ((attendedLeads.length / scheduledLeads.length) * 100).toFixed(1) : 0,
          wonCount: wonLeads.length,
          funnel,
          recentLeads: leads.slice(0, 15)
        };
      }

      return sendJson(res, 200, {
        success: true,
        tenant,
        health,
        baseline,
        activeAlerts,
        alertHistory: alertHistory.slice(0, 50),
        dispatchedNotifications: notificationDispatcher.getRecentDispatches(tenantId).slice(0, 10),
        metrics: modeData
      });
    }

    // Atualizar Configurações da Empresa
    if (pathname.startsWith('/api/settings/') && method === 'POST') {
      const tenantId = pathname.split('/')[3];
      const tenant = storage.getTenant(tenantId);
      if (!tenant) return sendJson(res, 404, { success: false, error: 'Empresa não encontrada' });

      const body = await parseRequestBody(req);
      
      if (body.operationMode) tenant.operationMode = body.operationMode;
      if (body.name) tenant.name = body.name;
      if (body.segment) tenant.segment = body.segment;
      if (body.whatsappDestination) tenant.whatsappDestination = body.whatsappDestination;
      if (body.notifyWhatsapp !== undefined) tenant.notifyWhatsapp = body.notifyWhatsapp;
      if (body.allowedSeverities) tenant.allowedSeverities = body.allowedSeverities;
      if (body.leadsSettings) tenant.leadsSettings = { ...tenant.leadsSettings, ...body.leadsSettings };
      if (body.ecommerceSettings) tenant.ecommerceSettings = { ...tenant.ecommerceSettings, ...body.ecommerceSettings };

      storage.saveTenant(tenant);
      return sendJson(res, 200, { success: true, tenant });
    }

    // Disparar Auditoria Manual Imediata
    if (pathname.startsWith('/api/audit/') && method === 'POST') {
      const tenantId = pathname.split('/')[3];
      const result = await alertManager.runAudit(tenantId);
      const health = alertManager.getOperationHealth(tenantId);
      return sendJson(res, 200, { success: true, result, health });
    }

    // ========================================================
    // 3. SIMULADOR DE EVENTOS DE TESTE (1-CLIQUE NO DASHBOARD)
    // ========================================================
    if (pathname.startsWith('/api/simulate/') && method === 'POST') {
      const tenantId = pathname.split('/')[3];
      const tenant = storage.getTenant(tenantId);
      if (!tenant) return sendJson(res, 404, { success: false, error: 'Tenant não encontrado' });

      const body = await parseRequestBody(req);
      const scenario = body.scenario || 'pico_recusa';
      const now = Date.now();

      // Injeta anomalia com base no cenário selecionado
      switch (scenario) {
        // E-commerce
        case 'pico_recusa':
          for (let i = 0; i < 5; i++) {
            storage.addTransaction({
              id: 'sim_ref_' + i,
              tenantId,
              amount: 199.00,
              cost: 80.00,
              paymentMethod: 'credit_card',
              gateway: 'mercadopago',
              status: 'refused',
              timestamp: now - (i * 2 * 60 * 1000)
            });
          }
          break;

        case 'checkout_travado':
          // Atualiza transações anteriores para estarem há 3h no passado
          const txs = storage.getTransactions(tenantId);
          for (const tx of txs) tx.timestamp = now - (3.5 * 60 * 60 * 1000);
          storage.saveToDisk();
          break;

        case 'margem_negativa':
          storage.addTransaction({
            id: 'sim_loss_1',
            tenantId,
            amount: 99.00,
            cost: 110.00, // Prejuízo direto
            discountAmount: 20.00,
            gatewayTaxAmount: 4.95,
            coupon: 'BLACKFRIDAY_BUG',
            paymentMethod: 'credit_card',
            gateway: 'mercadopago',
            status: 'approved',
            timestamp: now
          });
          break;

        case 'abandono_anormal':
          for (let i = 0; i < 12; i++) {
            storage.addCart(tenantId, {
              id: 'sim_cart_' + i,
              items: [{ title: 'Produto Teste', price: 150 }],
              total: 150,
              abandoned: true, // 100% abandono
              timestamp: now - (i * 5 * 60 * 1000)
            });
          }
          break;

        case 'falha_pix':
          for (let i = 0; i < 5; i++) {
            storage.addTransaction({
              id: 'sim_pix_' + i,
              tenantId,
              amount: 89.90,
              cost: 30.00,
              paymentMethod: 'pix',
              gateway: 'mercadopago',
              status: 'refused',
              timestamp: now - (i * 3 * 60 * 1000)
            });
          }
          break;

        case 'estoque_critico':
          storage.setInventory(tenantId, [
            { id: 'sim_p1', sku: 'ALERTA-01', name: 'Tênis Esportivo Ultra', currentStock: 3, dailySalesVelocity: 4 } // 0.75 dias
          ]);
          break;

        // Leads
        case 'cpl_anormal':
          storage.addTraffic({
            id: 'sim_trf_cpl',
            tenantId,
            source: 'meta_ads',
            campaignId: 'camp-cpl-explodiu',
            campaignName: 'Campanha CPL Alto',
            spend: 380.00,
            clicks: 120,
            sessions: 110,
            timestamp: now
          });
          storage.addLead({
            id: 'sim_lead_single',
            tenantId,
            name: 'Lead Caro',
            source: 'meta_ads',
            campaignId: 'camp-cpl-explodiu',
            currentStage: 'lead',
            createdAt: now
          });
          break;

        case 'lead_sem_atendimento':
          storage.addLead({
            id: 'sim_lead_waiting',
            tenantId,
            name: 'Juliana Costa (Urgente)',
            phone: '11999998888',
            source: 'landing_page',
            campaignName: 'Google Ads Implantes',
            currentStage: 'lead',
            status: 'active',
            firstContactAt: null,
            createdAt: now - (28 * 60 * 1000) // 28 minutos esperando
          });
          break;

        case 'trafege_sem_leads':
          storage.addTraffic({
            id: 'sim_trf_noleads',
            tenantId,
            source: 'meta_ads',
            campaignId: 'camp-queima-verba',
            campaignName: 'Campanha Queima Verba',
            spend: 210.00,
            clicks: 160,
            sessions: 155,
            timestamp: now
          });
          break;

        case 'normalizar_tudo':
          // Limpa alertas ativos e adiciona eventos saudáveis
          const activeMap = storage.getActiveAlertsMap(tenantId);
          for (const key of activeMap.keys()) {
            activeMap.delete(key);
          }
          storage.saveToDisk();
          break;
      }

      // Executa auditoria imediatamente
      const auditResult = await alertManager.runAudit(tenantId);
      const health = alertManager.getOperationHealth(tenantId);

      return sendJson(res, 200, {
        success: true,
        message: `Cenário "${scenario}" injetado com sucesso!`,
        scenario,
        auditResult,
        health
      });
    }

    // ========================================================
    // 4. ARQUIVOS ESTÁTICOS DO FRONTEND
    // ========================================================
    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml'
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 404 Not Found
    return sendJson(res, 404, { error: 'Rota não encontrada', pathname });

  } catch (err) {
    return sendJson(res, 500, { error: 'Erro interno no servidor', message: err.message });
  }
});

// Inicialização automática caso executado diretamente via node
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`🛡️ Auditor Silencioso SaaS Engine rodando em: http://localhost:${PORT}`);
  });
}

module.exports = server;
