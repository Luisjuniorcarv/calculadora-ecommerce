/**
 * Master Test Runner do Auditor Silencioso
 * Executa todas as baterias de testes em lote e consolida métricas.
 */

const runEcommerceTests = require('./ecommerce-alerts.test');
const runLeadsTests = require('./leads-alerts.test');
const runResilienceTests = require('./system-resilience.test');
const runLicenseTests = require('./test-license-system');

async function runAll() {
  console.log('====================================================');
  console.log('🛡️ AUDITOR SILENCIOSO - SUÍTE GLOBAL DE TESTES');
  console.log('====================================================\n');

  const t1 = runEcommerceTests();
  const t2 = runLeadsTests();
  const t3 = await runResilienceTests();
  const t4 = await runLicenseTests();

  const totalPassed = t1.passed + t2.passed + t3.passed + t4.passed;
  const grandTotal = t1.total + t2.total + t3.total + t4.total;

  console.log('====================================================');
  console.log(`🎉 CONSOLIDAÇÃO FINAL: ${totalPassed} de ${grandTotal} testes APROVADOS!`);
  console.log('====================================================');

  if (totalPassed === grandTotal) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAll();
