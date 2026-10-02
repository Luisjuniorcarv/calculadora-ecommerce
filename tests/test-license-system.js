/**
 * Testes Unitários e de Integração: Sistema Automatizado de Licenças,
 * Modo de Bloqueio, Aviso Prévio de 1 Dia e Desbloqueio Asaas
 */

const assert = require('assert');
const storage = require('../engine/storage');
const licenseManager = require('../engine/license-manager');
const alertManager = require('../engine/alert-manager');
const notificationDispatcher = require('../engine/notification-dispatcher');
const { createTenantConfig, SUBSCRIPTION_STATUS, SUBSCRIPTION_PLANS } = require('../engine/models');

async function runTests() {
  console.log('====================================================');
  console.log('🛡️ TESTES: SISTEMA DE LICENÇAS, BLOQUEIO & ASAAS');
  console.log('====================================================\n');

  // Limpa log de notificações para o teste
  notificationDispatcher.clearLog();

  const testTenantId = 'test-licenca-01';
  const now = Date.now();

  // Teste 1: Criação de Tenant com 10 Dias Grátis Padrão
  const tenant = createTenantConfig({
    id: testTenantId,
    name: 'Loja de Teste Licença',
    slug: 'loja-teste-licenca',
    whatsappDestination: '5511999887766'
  });
  storage.saveTenant(tenant);

  assert.strictEqual(tenant.subscription.status, SUBSCRIPTION_STATUS.TRIAL, 'Deveria iniciar em TRIAL');
  assert.strictEqual(tenant.subscription.durationDays, 10, 'Deveria ter duração de 10 dias');
  assert.ok(tenant.subscription.expiresAt > now, 'Data de expiração deve ser no futuro');
  console.log('  ✓ 1. Tenant inicializado com 10 dias de teste grátis com sucesso');

  // Teste 2: Aviso Prévio de 1 Dia (Restam menos de 24h)
  // Força expiração para daqui a 12 horas
  tenant.subscription.expiresAt = now + (12 * 60 * 60 * 1000);
  tenant.subscription.oneDayWarningSent = false;
  storage.saveTenant(tenant);

  const check1 = await licenseManager.checkAllLicenses();
  const updatedTenant1 = storage.getTenant(testTenantId);

  assert.strictEqual(updatedTenant1.subscription.status, SUBSCRIPTION_STATUS.EXPIRING_SOON, 'Deveria mudar status para EXPIRING_SOON');
  assert.strictEqual(updatedTenant1.subscription.oneDayWarningSent, true, 'Flag oneDayWarningSent deve ser true');
  assert.ok(check1.warningsSent.includes('Loja de Teste Licença'), 'Deveria ter enviado aviso prévio');
  console.log('  ✓ 2. Aviso prévio de 1 dia detectado e disparado com sucesso');

  // Teste 3: Bloqueio Automático após Expiração (Data no passado)
  tenant.subscription.expiresAt = now - (1000); // 1 segundo atrás
  tenant.subscription.status = SUBSCRIPTION_STATUS.TRIAL;
  storage.saveTenant(tenant);

  const check2 = await licenseManager.checkAllLicenses();
  const updatedTenant2 = storage.getTenant(testTenantId);

  assert.strictEqual(updatedTenant2.subscription.status, SUBSCRIPTION_STATUS.BLOCKED, 'Status deve ser BLOCKED após expirar');
  assert.ok(updatedTenant2.subscription.blockedAt, 'Data de bloqueio deve ser preenchida');
  assert.ok(check2.blockedCount.includes('Loja de Teste Licença'), 'Deveria constar na lista de bloqueados');
  console.log('  ✓ 3. Bloqueio automático ativado imediatamente após expirar prazo');

  // Teste 4: Alerta Manager respeita o Bloqueio e não audita tenant bloqueado
  const auditResult = await alertManager.runAudit(testTenantId);
  assert.strictEqual(auditResult.blocked, true, 'Auditoria deve retornar blocked: true');
  console.log('  ✓ 4. Motor de auditoria suspende monitoramento quando tenant está bloqueado');

  // Teste 5: Webhook do Asaas desfaz o bloqueio e estende por 30 dias a partir de hoje
  const asaasPayload = {
    event: 'PAYMENT_RECEIVED',
    payment: {
      id: 'pay_asaas_123456',
      externalReference: testTenantId,
      value: 97.00,
      customerPhone: '11999887766'
    }
  };

  const webhookResult = await licenseManager.handleAsaasWebhook(asaasPayload);
  assert.strictEqual(webhookResult.success, true, 'Webhook deve responder com sucesso');
  assert.strictEqual(webhookResult.action, 'subscription_activated', 'Ação deve ser ativação de assinatura');

  const updatedTenant3 = storage.getTenant(testTenantId);
  assert.strictEqual(updatedTenant3.subscription.status, SUBSCRIPTION_STATUS.ACTIVE, 'Status deve ser ACTIVE após pagamento');
  assert.strictEqual(updatedTenant3.subscription.planType, SUBSCRIPTION_PLANS.MONTHLY, 'Plano deve ser MONTHLY');
  assert.strictEqual(updatedTenant3.subscription.durationDays, 30, 'Duração deve ser de 30 dias');
  assert.strictEqual(updatedTenant3.subscription.blockedAt, null, 'Bloqueio deve ser removido');

  const daysRemaining = Math.round((updatedTenant3.subscription.expiresAt - now) / (1000 * 60 * 60 * 24));
  assert.strictEqual(daysRemaining, 30, 'Deveria restar 30 dias a partir da confirmação');
  console.log('  ✓ 5. Confirmação Asaas desbloqueia e adiciona 30 dias automaticamente');

  // Teste 6: Reativação de Teste de 10 Dias manual
  await licenseManager.activateTrial(testTenantId, 10);
  const updatedTenant4 = storage.getTenant(testTenantId);
  assert.strictEqual(updatedTenant4.subscription.status, SUBSCRIPTION_STATUS.TRIAL, 'Deveria voltar para TRIAL');
  assert.strictEqual(updatedTenant4.subscription.durationDays, 10, 'Deveria ter 10 dias');
  console.log('  ✓ 6. Ativação de 10 dias de teste manual validada com sucesso');

  // Limpa tenant de teste
  storage.tenants.delete(testTenantId);
  storage.saveToDisk();

  console.log('Resultado Licenças: 6/6 testes passaram.\n');
  return { passed: 6, total: 6 };
}

if (require.main === module) {
  runTests().then(() => {
    console.log('🎉 TODOS OS 6 TESTES DE LICENÇA E BLOQUEIO PASSARAM!');
    process.exit(0);
  }).catch(err => {
    console.error('Falha nos testes de licença:', err);
    process.exit(1);
  });
}

module.exports = runTests;
