/**
 * Testes Automatizados: Regras de Leads & Serviços do Auditor Silencioso (14 Alertas)
 */

const assert = require('assert');
const { createTenantConfig, OPERATION_MODES } = require('../engine/models');
const leadsRules = require('../engine/rules-leads');

function createMockDataStore(overrides = {}) {
  const defaultBaseline = {
    historicalCpl: 18.0,
    historicalDailyLeads: 20,
    historicalQualificationRate: 45.0,
    historicalScheduleRate: 50.0,
    historicalShowRate: 85.0
  };

  return {
    getBaseline: () => ({ ...defaultBaseline, ...(overrides.baseline || {}) }),
    getLeads: () => overrides.leads || [],
    getTraffic: () => overrides.traffic || []
  };
}

const mockTenant = createTenantConfig({
  id: 'test-leads',
  name: 'Consultoria & Clínica VIP',
  operationMode: OPERATION_MODES.LEADS,
  leadsSettings: {
    maxCpl: 30.00,
    maxFirstResponseMinutes: 10,
    maxStageStagnationHours: 24,
    minLeadVolumeForAlert: 5
  }
});

function runLeadsTests() {
  console.log('--- TESTES: REGRAS DE LEADS & SERVIÇOS ---');
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  // 1. Operação normal
  test('1. Operação saudável de leads não dispara alertas falsos', () => {
    const now = Date.now();
    const healthyLeads = Array.from({ length: 20 }, (_, i) => {
      const isWon = i < 4;
      const isScheduled = i < 10;
      const isQualified = i < 14;
      return {
        id: `l_${i}`,
        campaignId: 'camp-saudavel',
        campaignName: 'Campanha de Alta Conversão',
        currentStage: isWon ? 'won' : (isScheduled ? 'scheduled' : (isQualified ? 'qualified' : 'contacted')),
        status: isWon ? 'won' : 'active',
        dealValue: isWon ? 1500 : 0,
        createdAt: now - (i * 30 * 60 * 1000), // Distribuído nas últimas 10h
        firstContactAt: now - (i * 30 * 60 * 1000) + (5 * 60 * 1000), // Atendido em 5 min
        qualifiedAt: isQualified ? now - (i * 30 * 60 * 1000) + (15 * 60 * 1000) : null,
        scheduledAt: isScheduled ? now - (i * 30 * 60 * 1000) + (30 * 60 * 1000) : null,
        attendedAt: isScheduled ? now - (i * 30 * 60 * 1000) + (45 * 60 * 1000) : null,
        wonAt: isWon ? now - (i * 30 * 60 * 1000) + (60 * 60 * 1000) : null,
        stageUpdatedAt: now - 3600000
      };
    });

    const store = createMockDataStore({
      leads: healthyLeads,
      traffic: [{ campaignId: 'camp-saudavel', spend: 300, clicks: 150, timestamp: Date.now() }]
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    assert.strictEqual(alerts.length, 0, 'Não deve haver alertas em operação normal');
  });

  // 2. Queda anormal de leads
  test('2. Queda anormal de leads detectada', () => {
    const store = createMockDataStore({
      leads: [
        { id: '1', createdAt: Date.now() - 1000 },
        { id: '2', createdAt: Date.now() - 2000 } // Apenas 2 leads vs média normal de 20
      ]
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const dropAlert = alerts.find(a => a.alertKey === 'QUEDA_LEADS');
    assert.ok(dropAlert, 'Deve alertar queda acentuada de leads');
  });

  // 3. Tráfego sem geração de leads
  test('3. Tráfego sem geração de leads detectado', () => {
    const store = createMockDataStore({
      traffic: [{ spend: 180, clicks: 110, timestamp: Date.now() }],
      leads: [] // Zero leads gerados!
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const trafficAlert = alerts.find(a => a.alertKey === 'TRAFEGO_SEM_LEADS');
    assert.ok(trafficAlert, 'Deve alertar investimento/cliques sem conversão de leads');
  });

  // 4. CPL anormal
  test('4. Custo por Lead (CPL) acima do limite detectado', () => {
    const store = createMockDataStore({
      traffic: [{ spend: 280, clicks: 90, timestamp: Date.now() }],
      leads: [
        { id: '1', createdAt: Date.now() - 1000 },
        { id: '2', createdAt: Date.now() - 2000 }
      ] // CPL = 280 / 2 = R$ 140 (muito acima do normal R$ 18)
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const cplAlert = alerts.find(a => a.alertKey === 'CPL_ANORMAL');
    assert.ok(cplAlert, 'Deve alertar CPL anormal');
    assert.strictEqual(cplAlert.currentValue, 140);
  });

  // 5. Investimento sem leads (campanha específica)
  test('5. Campanha consumindo verba sem gerar leads detectada', () => {
    const store = createMockDataStore({
      traffic: [
        { campaignId: 'camp_zerada', campaignName: 'Google Ads Implantes', spend: 150, clicks: 90, timestamp: Date.now() }
      ],
      leads: [
        { id: '1', campaignId: 'outra_camp', createdAt: Date.now() } // Lead pertence a outra campanha
      ]
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const zeroLeadCamp = alerts.find(a => a.alertKey === 'CAMPANHA_SEM_LEADS');
    assert.ok(zeroLeadCamp, 'Deve alertar campanha específica sem leads');
  });

  // 6. Lead sem atendimento
  test('6. Lead aguardando atendimento além do tempo limite', () => {
    const now = Date.now();
    const store = createMockDataStore({
      leads: [
        {
          id: 'lead_esperando',
          name: 'Ana Beatriz',
          currentStage: 'lead',
          status: 'active',
          firstContactAt: null,
          createdAt: now - (25 * 60 * 1000) // 25 min esperando (meta é 10)
        }
      ]
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const waitAlert = alerts.find(a => a.alertKey === 'LEAD_SEM_ATENDIMENTO');
    assert.ok(waitAlert, 'Deve alertar lead aguardando contato');
    assert.strictEqual(waitAlert.currentValue, 25);
  });

  // 7. Tempo de primeira resposta elevado (média)
  test('7. Tempo médio de primeira resposta elevado', () => {
    const now = Date.now();
    const leads = [];
    for (let i = 0; i < 5; i++) {
      leads.push({
        id: `l_${i}`,
        createdAt: now - (60 * 60 * 1000),
        firstContactAt: now - (60 * 60 * 1000) + (35 * 60 * 1000) // Demorou 35 min para atender (meta 10)
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const respAlert = alerts.find(a => a.alertKey === 'TEMPO_RESPOSTA_ELEVADO');
    assert.ok(respAlert, 'Deve alertar média alta de primeiro atendimento');
  });

  // 8. Leads parados no funil
  test('8. Leads estagnados em etapa intermediária', () => {
    const now = Date.now();
    const leads = [];
    for (let i = 0; i < 4; i++) {
      leads.push({
        id: `stuck_${i}`,
        name: `Lead Estagnado ${i}`,
        currentStage: 'contacted',
        status: 'active',
        createdAt: now - (35 * 60 * 60 * 1000),
        stageUpdatedAt: now - (30 * 60 * 60 * 1000) // 30h na etapa (limite 24h)
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const stuckAlert = alerts.find(a => a.alertKey === 'LEADS_PARADOS_FUNIL');
    assert.ok(stuckAlert, 'Deve alertar leads estagnados no funil');
  });

  // 9. Queda na taxa de qualificação
  test('9. Queda na taxa de qualificação detectada', () => {
    const leads = [];
    for (let i = 0; i < 15; i++) {
      leads.push({
        id: `l_${i}`,
        createdAt: Date.now() - 1000,
        qualifiedAt: i === 0 ? Date.now() : null // Apenas 1 de 15 = 6.6% (normal 45%)
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const qualAlert = alerts.find(a => a.alertKey === 'QUEDA_QUALIFICACAO');
    assert.ok(qualAlert, 'Deve alertar queda de qualificação de leads');
  });

  // 10. Queda na taxa de agendamento
  test('10. Queda na taxa de agendamentos detectada', () => {
    const leads = [];
    for (let i = 0; i < 12; i++) {
      leads.push({
        id: `l_${i}`,
        createdAt: Date.now() - 1000,
        scheduledAt: i === 0 ? Date.now() : null // 1 de 12 = 8% (normal 50%)
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const schedAlert = alerts.find(a => a.alertKey === 'QUEDA_AGENDAMENTO');
    assert.ok(schedAlert, 'Deve alertar queda de agendamento');
  });

  // 11. Queda no comparecimento (no-show)
  test('11. Aumento de faltas / no-show detectado', () => {
    const leads = [];
    for (let i = 0; i < 8; i++) {
      leads.push({
        id: `sched_${i}`,
        scheduledAt: Date.now() - 5000,
        attendedAt: i < 2 ? Date.now() : null // Apenas 2 compareceram de 8 = 25% (normal 85%)
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const showAlert = alerts.find(a => a.alertKey === 'QUEDA_COMPARECIMENTO');
    assert.ok(showAlert, 'Deve alertar no-show elevado');
  });

  // 12. Leads aumentando, mas vendas não
  test('12. Leads aumentando sem fechamento de vendas', () => {
    const leads = [];
    for (let i = 0; i < 25; i++) {
      leads.push({
        id: `lead_${i}`,
        currentStage: 'lead',
        createdAt: Date.now() - 5000,
        wonAt: null // 25 leads e ZERO vendas
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const convAlert = alerts.find(a => a.alertKey === 'LEADS_SOBEM_VENDAS_CAEM');
    assert.ok(convAlert, 'Deve alertar volume de leads sem vendas correspondentes');
  });

  // 13. Campanha com leads de baixa qualidade
  test('13. Campanha com volume de baixa qualidade detectada', () => {
    const leads = [];
    for (let i = 0; i < 15; i++) {
      leads.push({
        id: `junk_${i}`,
        campaignId: 'camp_lixo',
        campaignName: 'Público Aberto Curiosos',
        currentStage: 'lead',
        qualifiedAt: null // 15 leads e 0 qualificados
      });
    }
    const store = createMockDataStore({ leads });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const junkAlert = alerts.find(a => a.alertKey === 'CAMPANHA_LEADS_BAIXA_QUALIDADE');
    assert.ok(junkAlert, 'Deve acusar campanha gerando contatos desqualificados');
  });

  // 14. Campanha com alto gasto e baixo retorno
  test('14. Campanha com alto gasto e baixo retorno detectada', () => {
    const store = createMockDataStore({
      traffic: [
        { campaignId: 'camp_prejuizo', campaignName: 'Meta Ads Caríssimo', spend: 500.00, clicks: 200, timestamp: Date.now() }
      ],
      leads: [
        { campaignId: 'camp_prejuizo', currentStage: 'won', dealValue: 80.00, wonAt: Date.now() } // R$ 500 de gasto para R$ 80 de retorno
      ]
    });
    const alerts = leadsRules.evaluate(mockTenant, store);
    const roiAlert = alerts.find(a => a.alertKey === 'CAMPANHA_ALTO_GASTO_BAIXO_RETORNO');
    assert.ok(roiAlert, 'Deve acusar campanha deficitária');
  });

  console.log(`Resultado Leads: ${passed}/${total} testes passaram.\n`);
  return { passed, total };
}

if (require.main === module) {
  runLeadsTests();
}

module.exports = runLeadsTests;
