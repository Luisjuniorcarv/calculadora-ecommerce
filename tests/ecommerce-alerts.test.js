/**
 * Testes Automatizados: Regras de E-commerce do Auditor Silencioso
 */

const assert = require('assert');
const { createTenantConfig, OPERATION_MODES } = require('../engine/models');
const ecommerceRules = require('../engine/rules-ecommerce');

function createMockDataStore(overrides = {}) {
  const defaultBaseline = {
    historicalRefusalRate: 10.0,
    historicalAbandonmentRate: 60.0,
    historicalPixFailRate: 5.0
  };

  return {
    getBaseline: () => ({ ...defaultBaseline, ...(overrides.baseline || {}) }),
    getTransactions: () => overrides.transactions || [],
    getCarts: () => overrides.carts || [],
    getInventory: () => overrides.inventory || [],
    getTraffic: () => overrides.traffic || []
  };
}

const mockTenant = createTenantConfig({
  id: 'test-ecom',
  name: 'Loja Teste E-commerce',
  operationMode: OPERATION_MODES.ECOMMERCE
});

function runEcommerceTests() {
  console.log('--- TESTES: REGRAS DE E-COMMERCE ---');
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

  // 1. Operação normal (sem alertas indevidos)
  test('1. Operação normal não gera alertas', () => {
    const store = createMockDataStore({
      transactions: [
        { id: '1', status: 'approved', amount: 150, cost: 50, paymentMethod: 'credit_card', timestamp: Date.now() },
        { id: '2', status: 'approved', amount: 200, cost: 70, paymentMethod: 'credit_card', timestamp: Date.now() }
      ]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    assert.strictEqual(alerts.length, 0, 'Não deve gerar alertas em operação saudável');
  });

  // 2. Pico de recusas de cartão
  test('2. Detecta pico anormal de recusas de cartão', () => {
    const now = Date.now();
    const store = createMockDataStore({
      transactions: [
        { id: '1', status: 'refused', amount: 150, cost: 50, paymentMethod: 'credit_card', timestamp: now - 1000 },
        { id: '2', status: 'refused', amount: 150, cost: 50, paymentMethod: 'credit_card', timestamp: now - 2000 },
        { id: '3', status: 'refused', amount: 150, cost: 50, paymentMethod: 'credit_card', timestamp: now - 3000 },
        { id: '4', status: 'approved', amount: 150, cost: 50, paymentMethod: 'credit_card', timestamp: now - 4000 }
      ]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const recusaAlert = alerts.find(a => a.alertKey === 'PICO_RECUSA_CARTAO');
    assert.ok(recusaAlert, 'Deve gerar alerta de pico de recusa de cartão');
    assert.strictEqual(recusaAlert.currentValue, 75); // 3 de 4 = 75%
  });

  // 3. Checkout travado / queda súbita
  test('3. Detecta checkout travado há mais de 2 horas', () => {
    const now = Date.now();
    const store = createMockDataStore({
      transactions: [
        { id: 'old_1', status: 'approved', amount: 100, cost: 40, paymentMethod: 'pix', timestamp: now - (150 * 60 * 1000) } // 150 min atrás
      ]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const frozenAlert = alerts.find(a => a.alertKey === 'CHECKOUT_TRAVADO');
    assert.ok(frozenAlert, 'Deve alertar checkout travado');
  });

  // 4. Margem negativa / preço errado
  test('4. Detecta venda com margem negativa', () => {
    const store = createMockDataStore({
      transactions: [
        {
          id: 'order_loss',
          status: 'approved',
          amount: 80.00,
          cost: 95.00, // Custo maior que a venda!
          discountAmount: 10.00,
          gatewayTaxAmount: 4.00,
          coupon: 'DESCONTO_BUG',
          paymentMethod: 'credit_card',
          timestamp: Date.now()
        }
      ]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const marginAlert = alerts.find(a => a.alertKey === 'MARGEM_NEGATIVA');
    assert.ok(marginAlert, 'Deve acusar margem negativa');
  });

  // 5. Abandono de carrinho anormal
  test('5. Detecta abandono de carrinho muito acima do padrão', () => {
    const now = Date.now();
    const carts = [];
    for (let i = 0; i < 10; i++) {
      carts.push({ id: `c_${i}`, abandoned: i < 9, timestamp: now - 1000 }); // 90% abandono
    }
    const store = createMockDataStore({ carts });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const cartAlert = alerts.find(a => a.alertKey === 'ABANDONO_ANORMAL');
    assert.ok(cartAlert, 'Deve alertar abandono anormal');
  });

  // 6. Falha concentrada em meio de pagamento (PIX)
  test('6. Detecta falhas concentradas no PIX', () => {
    const now = Date.now();
    const store = createMockDataStore({
      transactions: [
        { id: 'p1', status: 'refused', paymentMethod: 'pix', timestamp: now - 1000 },
        { id: 'p2', status: 'refused', paymentMethod: 'pix', timestamp: now - 2000 },
        { id: 'p3', status: 'approved', paymentMethod: 'pix', timestamp: now - 3000 },
        { id: 'p4', status: 'refused', paymentMethod: 'pix', timestamp: now - 4000 }
      ]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const pixAlert = alerts.find(a => a.alertKey === 'FALHA_MEIO_PAGAMENTO');
    assert.ok(pixAlert, 'Deve alertar falha concentrada no PIX');
  });

  // 7. Estoque crítico por velocidade de venda
  test('7. Detecta estoque crítico por velocidade de venda', () => {
    const store = createMockDataStore({
      inventory: [
        { id: 'prod1', sku: 'SKU1', name: 'Calça Alfaiataria', currentStock: 4, dailySalesVelocity: 5 } // 0.8 dias de estoque!
      ]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const stockAlert = alerts.find(a => a.alertKey === 'ESTOQUE_CRITICO');
    assert.ok(stockAlert, 'Deve alertar ruptura iminente de estoque');
  });

  // 8. Pico de cancelamentos / reembolsos
  test('8. Detecta pico de cancelamentos e reembolsos', () => {
    const now = Date.now();
    const txList = [];
    for (let i = 0; i < 10; i++) {
      txList.push({ id: `t_${i}`, status: i < 3 ? 'refunded' : 'approved', timestamp: now - 5000 }); // 30% estornos
    }
    const store = createMockDataStore({ transactions: txList });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const refundAlert = alerts.find(a => a.alertKey === 'PICO_CANCELAMENTOS');
    assert.ok(refundAlert, 'Deve alertar aumento de cancelamentos/estornos');
  });

  // 9. Tráfego aumentando sem aumento proporcional de vendas
  test('9. Detecta tráfego ativo com baixa conversão de vendas', () => {
    const store = createMockDataStore({
      traffic: [{ spend: 200, clicks: 180, timestamp: Date.now() }],
      transactions: [{ id: 'single_tx', status: 'approved', timestamp: Date.now() }]
    });
    const alerts = ecommerceRules.evaluate(mockTenant, store);
    const trafficAlert = alerts.find(a => a.alertKey === 'TRAFEGO_SEM_CONVERSAO');
    assert.ok(trafficAlert, 'Deve alertar tráfego sem vendas proporcionais');
  });

  console.log(`Resultado E-commerce: ${passed}/${total} testes passaram.\n`);
  return { passed, total };
}

if (require.main === module) {
  runEcommerceTests();
}

module.exports = runEcommerceTests;
