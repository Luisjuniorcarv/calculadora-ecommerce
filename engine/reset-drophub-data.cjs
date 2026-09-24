/**
 * Reset de Dados de Teste - Auditor Silencioso
 * Zera leads, transações, carrinhos e tráfego de teste da empresa 'drophub', mantendo a configuração limpa.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'auditor_db.json');

function resetTenantData(tenantId = 'drophub') {
  if (!fs.existsSync(DB_PATH)) {
    console.log("Banco auditor_db.json não encontrado.");
    return;
  }

  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const db = JSON.parse(raw);

  console.log(`Limpando dados de teste do tenant: ${tenantId}...`);

  // Limpar leads
  if (db.leads) {
    db.leads = db.leads.filter(([id, list]) => id !== tenantId);
    db.leads.push([tenantId, []]);
  }

  // Limpar transações
  if (db.transactions) {
    db.transactions = db.transactions.filter(([id, list]) => id !== tenantId);
    db.transactions.push([tenantId, []]);
  }

  // Atualizar configurações da empresa DropHub
  if (db.tenants) {
    for (const [id, tenant] of db.tenants) {
      if (id === tenantId) {
        if (!tenant.leadsSettings) tenant.leadsSettings = {};
        tenant.leadsSettings.dailyBudget = 30;
        tenant.leadsSettings.maxCpl = 15;
        tenant.segment = 'Loja DropHub (EasyPanel) - Tráfego Pago Instagram';
        console.log(`Configurado orçamento diário de R$ 30,00/dia para ${tenantId}.`);
      }
    }
  }

  // Registrar investimento de R$ 30,00 de tráfego de hoje
  if (db.traffic) {
    db.traffic = db.traffic.filter(([id, list]) => id !== tenantId);
    db.traffic.push([tenantId, [
      {
        id: 'trf_real_init',
        tenantId,
        source: 'meta_ads',
        campaignId: 'camp-drophub-instagram',
        campaignName: 'Instagram Ads - Loja DropHub',
        spend: 30.00,
        impressions: 0,
        clicks: 0,
        sessions: 0,
        timestamp: Date.now()
      }
    ]]);
  }
  // Limpar carrinhos
  if (db.carts) {
    db.carts = db.carts.filter(([id, list]) => id !== tenantId);
    db.carts.push([tenantId, []]);
  }

  // Limpar alertas ativos
  if (db.activeAlerts) {
    db.activeAlerts = db.activeAlerts.filter(([id, list]) => id !== tenantId);
    db.activeAlerts.push([tenantId, []]);
  }

  // Limpar histórico de alertas
  if (db.alertHistory) {
    db.alertHistory = db.alertHistory.filter(([id, list]) => id !== tenantId);
    db.alertHistory.push([tenantId, []]);
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`Dados do tenant '${tenantId}' foram resetados com sucesso! O painel agora está limpo e pronto para receber dados 100% reais.`);
}

if (require.main === module) {
  resetTenantData('drophub');
}

module.exports = { resetTenantData };
