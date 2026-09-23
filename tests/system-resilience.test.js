/**
 * Testes Automatizados: Resiliência do Sistema, Cooldown, Deduplicação e Multi-tenant
 */

const assert = require('assert');
const storage = require('../engine/storage');
const alertManager = require('../engine/alert-manager');
const notificationDispatcher = require('../engine/notification-dispatcher');
const normalizer = require('../engine/normalizer');
const { createTenantConfig, OPERATION_MODES, ALERT_STATUS } = require('../engine/models');

async function runResilienceTests() {
  console.log('--- TESTES: RESILIÊNCIA, COOLDOWN & MULTIEMPRESA ---');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  // 1. Isolamento Multiempresa
  await test('1. Isolamento estrito entre empresas (Multi-tenant)', () => {
    const idA = 'tenant-iso-a-' + Date.now();
    const idB = 'tenant-iso-b-' + Date.now();

    const tenantA = createTenantConfig({ id: idA, name: 'Empresa A', operationMode: OPERATION_MODES.ECOMMERCE });
    const tenantB = createTenantConfig({ id: idB, name: 'Empresa B', operationMode: OPERATION_MODES.LEADS });

    storage.saveTenant(tenantA);
    storage.saveTenant(tenantB);

    // Adiciona transação para Empresa A
    storage.addTransaction({ id: 'tx_a', tenantId: idA, amount: 100, status: 'approved' });
    // Adiciona lead para Empresa B
    storage.addLead({ id: 'lead_b', tenantId: idB, name: 'Lead B', currentStage: 'lead' });

    assert.strictEqual(storage.getTransactions(idA).length, 1);
    assert.strictEqual(storage.getTransactions(idB).length, 0, 'Empresa B não deve ver transações da Empresa A');
    assert.strictEqual(storage.getLeads(idB).length, 1);
    assert.strictEqual(storage.getLeads(idA).length, 0, 'Empresa A não deve ver leads da Empresa B');
  });

  // 2. Deduplicação e Cooldown de Alertas
  await test('2. Alerta ativo não dispara notificações duplicadas em cooldown', async () => {
    notificationDispatcher.clearLog();
    const coolId = 'tenant-cool-' + Date.now();
    const tenant = createTenantConfig({
      id: coolId,
      name: 'Loja Cooldown Teste',
      operationMode: OPERATION_MODES.ECOMMERCE,
      whatsappDestination: '5511999999999'
    });
    storage.saveTenant(tenant);

    // Injeta 4 recusas para gerar alerta de pico
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      storage.addTransaction({
        id: `tx_cool_${i}`,
        tenantId: coolId,
        status: 'refused',
        paymentMethod: 'credit_card',
        timestamp: now - 1000
      });
    }

    // Primeira auditoria: deve disparar 1 alerta
    const audit1 = await alertManager.runAudit(coolId);
    assert.strictEqual(audit1.dispatched.length, 1, 'Deve disparar o primeiro alerta');

    const logCountAfterAudit1 = notificationDispatcher.getRecentDispatches(coolId).length;
    assert.strictEqual(logCountAfterAudit1, 1, 'Deve ter gravado 1 disparo no log');

    // Segunda auditoria imediata: métrica continua ruim mas está em cooldown
    const audit2 = await alertManager.runAudit(coolId);
    assert.strictEqual(audit2.dispatched.length, 0, 'Não deve reenviar alerta em cooldown');
    assert.strictEqual(audit2.inCooldown.length, 1, 'Deve registrar que está em cooldown');

    const logCountAfterAudit2 = notificationDispatcher.getRecentDispatches(coolId).length;
    assert.strictEqual(logCountAfterAudit2, 1, 'Não deve haver spam no WhatsApp durante o cooldown');
  });

  // 3. Auto-Resolução de Alertas
  await test('3. Auto-resolução e mensagem de alívio quando a métrica normaliza', async () => {
    const healId = 'tenant-heal-' + Date.now();
    const tenant = createTenantConfig({
      id: healId,
      name: 'Loja Auto-Cura Teste',
      operationMode: OPERATION_MODES.ECOMMERCE,
      whatsappDestination: '5511999999999'
    });
    storage.saveTenant(tenant);

    const now = Date.now();
    // 1. Gera o problema de recusa
    for (let i = 0; i < 4; i++) {
      storage.addTransaction({
        id: `tx_sick_${i}`,
        tenantId: healId,
        status: 'refused',
        paymentMethod: 'credit_card',
        timestamp: now - 1000
      });
    }

    const audit1 = await alertManager.runAudit(healId);
    assert.strictEqual(audit1.dispatched.length, 1, 'Alerta inicial deve ter disparado');

    // 2. Adiciona 20 transações aprovadas para diluir e normalizar a taxa de recusa
    for (let i = 0; i < 20; i++) {
      storage.addTransaction({
        id: `tx_heal_${i}`,
        tenantId: healId,
        status: 'approved',
        paymentMethod: 'credit_card',
        timestamp: now - (i * 100)
      });
    }

    // 3. Executa auditoria: taxa caiu para < 15%, alerta deve ser resolvido
    const auditResolve = await alertManager.runAudit(healId);
    assert.ok(auditResolve.resolved.length >= 1, 'Alerta deve ser marcado como RESOLVED');

    const lastDispatch = notificationDispatcher.getRecentDispatches(healId)[0];
    assert.strictEqual(lastDispatch.context, 'RESOLVED', 'Deve enviar notificação de PROBLEMA NORMALIZADO');
    assert.ok(lastDispatch.messageText.includes('PROBLEMA NORMALIZADO'), 'Texto da mensagem deve confirmar a normalização');
  });

  // 4. Normalização de Dados de Webhook (Meta Ads & CRM)
  await test('4. Normalização correta de payloads heterogêneos de Meta Ads e CRM', () => {
    // Meta Ads
    const metaPayload = {
      entry: [{
        changes: [{
          value: {
            leadgen_id: 'meta_12345',
            full_name: 'Dr. Fernando Dias',
            phone_number: '+55 (11) 98765-4321',
            campaign_name: 'Meta Ads Odonto SP',
            created_time: 1727123456
          }
        }]
      }]
    };
    const normMeta = normalizer.normalizeMetaLeadGen(metaPayload, 'tenant-meta');
    assert.strictEqual(normMeta.source, 'meta_ads');
    assert.strictEqual(normMeta.name, 'Dr. Fernando Dias');
    assert.strictEqual(normMeta.phone, '+55 (11) 98765-4321');

    // CRM Webhook
    const crmPayload = {
      lead: { id: 'crm_999', name: 'Juliana Lima', phone: '11911112222' },
      deal: { stage: 'agendado', amount: 4500 }
    };
    const normCrm = normalizer.normalizeCrmWebhook(crmPayload, 'tenant-crm', 'rd_station');
    assert.strictEqual(normCrm.source, 'rd_station');
    assert.strictEqual(normCrm.currentStage, 'scheduled');
    assert.strictEqual(normCrm.dealValue, 4500);
  });

  console.log(`Resultado Resiliência: ${passed}/${total} testes passaram.\n`);
  return { passed, total };
}

if (require.main === module) {
  runResilienceTests();
}

module.exports = runResilienceTests;
