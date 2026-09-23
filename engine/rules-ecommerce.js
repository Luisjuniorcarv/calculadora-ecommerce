/**
 * Auditor Silencioso - Regras de Auditoria para E-COMMERCE (8 Alertas)
 * Preserva os 3 alertas existentes e adiciona os 5 novos alertas solicitados.
 */

const { ALERT_SEVERITIES, createAlertRecord } = require('./models');

class EcommerceRulesEngine {

  /**
   * Executa a bateria de auditoria de E-commerce para o Tenant
   */
  evaluate(tenant, dataStore) {
    const alerts = [];
    const tenantId = tenant.id;
    const settings = tenant.ecommerceSettings || {};
    const baseline = dataStore.getBaseline(tenantId) || {};

    const transactions = dataStore.getTransactions(tenantId) || [];
    const carts = dataStore.getCarts(tenantId) || [];
    const inventory = dataStore.getInventory(tenantId) || [];
    const traffic = dataStore.getTraffic(tenantId) || [];

    // 1. PICO DE RECUSA DE CARTÃO (Existente Preservado)
    const alert1 = this.checkCardRefusalSpike(tenant, transactions, settings, baseline);
    if (alert1) alerts.push(alert1);

    // 2. CHECKOUT TRAVADO / QUEDA SÚBITA DE VENDAS (Existente Preservado)
    const alert2 = this.checkFrozenCheckout(tenant, transactions, settings, baseline);
    if (alert2) alerts.push(alert2);

    // 3. MARGEM NEGATIVA / PREÇO ERRADO (Existente Preservado)
    const alert3 = this.checkNegativeMargin(tenant, transactions);
    if (alert3) alerts.push(alert3);

    // 4. ABANDONO DE CARRINHO ANORMAL (Novo)
    const alert4 = this.checkAbnormalAbandonment(tenant, carts, settings, baseline);
    if (alert4) alerts.push(alert4);

    // 5. FALHA CONCENTRADA EM MEIO DE PAGAMENTO (Novo)
    const alert5 = this.checkPaymentMethodSpike(tenant, transactions, baseline);
    if (alert5) alerts.push(alert5);

    // 6. ESTOQUE CRÍTICO POR VELOCIDADE DE VENDA (Novo)
    const alert6 = this.checkStockVelocity(tenant, inventory, settings);
    if (alert6) alerts.push(alert6);

    // 7. PICO DE CANCELAMENTOS / REEMBOLSOS / CHARGEBACKS (Novo)
    const alert7 = this.checkRefundSpike(tenant, transactions, settings, baseline);
    if (alert7) alerts.push(alert7);

    // 8. TRÁFEGO AUMENTANDO SEM AUMENTO PROPORCIONAL DE VENDAS (Novo)
    const alert8 = this.checkTrafficVsSalesConversion(tenant, traffic, transactions);
    if (alert8) alerts.push(alert8);

    return alerts;
  }

  // --- REGRA 1: PICO DE RECUSA DE CARTÃO ---
  checkCardRefusalSpike(tenant, transactions, settings, baseline) {
    const now = Date.now();
    const windowMs = 2 * 60 * 60 * 1000; // Janela deslizante de 2 horas
    const minSample = 4;
    const maxRate = settings.maxRefusalRatePercent || 25; // 25%
    const minCount = settings.minRefusalsCount || 3;

    // Filtra apenas tentativas de cartão na janela
    const recentCardTx = transactions.filter(t => 
      (now - t.timestamp <= windowMs) &&
      (String(t.paymentMethod).includes('card') || String(t.paymentMethod).includes('cart'))
    );

    // Proteção contra falso positivo de baixo volume
    if (recentCardTx.length < minSample) return null;

    const refusals = recentCardTx.filter(t => t.status === 'refused');
    const refusalRate = (refusals.length / recentCardTx.length) * 100;
    const normalRate = baseline.historicalRefusalRate || 10;

    if (refusalRate >= maxRate && refusals.length >= minCount) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'PICO_RECUSA_CARTAO',
        title: 'Pico de Recusa de Cartão Detectado',
        severity: ALERT_SEVERITIES.CRITICAL,
        currentValue: Number(refusalRate.toFixed(1)),
        expectedValue: Number(normalRate.toFixed(1)),
        metricUnit: '%',
        anomalyDetails: {
          totalTentativas: recentCardTx.length,
          recusas: refusals.length,
          limiteSeguranca: maxRate
        },
        entityType: 'payment_method',
        entityId: 'credit_card',
        entityName: 'Cartão de Crédito',
        recommendedAction: 'Acesse o painel do seu gateway/antifraude imediatamente para verificar instabilidade ou erro de credenciais.',
        whatsappMessage: 
          `🚨 *[AUDITOR SILENCIOSO] ALERTA CRÍTICO: PICO DE RECUSA DE CARTÃO*\n\n` +
          `Atenção! Sua loja *${tenant.name}* registrou *${refusals.length} de ${recentCardTx.length} cartões recusados* recentemente.\n\n` +
          `📉 *Taxa de Recusa Atual:* ${refusalRate.toFixed(1)}% (Padrão Normal: ~${normalRate.toFixed(1)}%)\n` +
          `💳 *Meio:* Cartão de Crédito\n\n` +
          `👉 *Ação Recomendada:* Verifique o status do gateway ou antifraude agora para não queimar verba de anúncios!`
      });
    }
    return null;
  }

  // --- REGRA 2: CHECKOUT TRAVADO / QUEDA SÚBITA DE VENDAS ---
  checkFrozenCheckout(tenant, transactions, settings, baseline) {
    const now = Date.now();
    const currentHour = new Date().getHours();
    
    // Evita falsos positivos na madrugada (00h às 06h) exceto se houver histórico ativo
    const isBusinessHours = currentHour >= 7 && currentHour <= 23;
    if (!isBusinessHours) return null;

    const approved = transactions.filter(t => t.status === 'approved');
    if (approved.length === 0) return null;

    const lastSale = approved[0];
    const minutesSinceLastSale = Math.floor((now - lastSale.timestamp) / (60 * 1000));
    const maxAllowedMinutes = settings.maxNoSaleMinutesBusinessHours || 120; // 2 horas

    if (minutesSinceLastSale >= maxAllowedMinutes) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'CHECKOUT_TRAVADO',
        title: 'Checkout Travado ou Queda Súbita de Vendas',
        severity: ALERT_SEVERITIES.CRITICAL,
        currentValue: minutesSinceLastSale,
        expectedValue: Math.floor(maxAllowedMinutes / 2),
        metricUnit: 'min',
        anomalyDetails: {
          minutosSemVendas: minutesSinceLastSale,
          ultimaVendaTimestamp: lastSale.timestamp
        },
        entityType: 'checkout',
        entityId: 'store_checkout',
        entityName: 'Checkout da Loja',
        recommendedAction: 'Faça um pedido de teste no checkout agora para verificar se o gateway ou botão de compra está respondendo.',
        whatsappMessage:
          `🛑 *[AUDITOR SILENCIOSO] CHECKOUT TRAVADO / QUEDA SÚBITA!*\n\n` +
          `Sua loja *${tenant.name}* está há *${minutesSinceLastSale} minutos sem registrar vendas* em horário de pico.\n\n` +
          `⏱️ *Tempo Inativo:* ${minutesSinceLastSale} min (Limite de Segurança: ${maxAllowedMinutes} min)\n\n` +
          `👉 *Ação Recomendada:* Faça uma compra de teste para verificar se o gateway está fora do ar ou se houve quebra no script da página!`
      });
    }
    return null;
  }

  // --- REGRA 3: MARGEM NEGATIVA / PREÇO ERRADO ---
  checkNegativeMargin(tenant, transactions) {
    const now = Date.now();
    // Avalia últimas vendas (últimas 2 horas)
    const recentApproved = transactions.filter(t => 
      t.status === 'approved' && (now - t.timestamp <= 2 * 60 * 60 * 1000)
    );

    for (const tx of recentApproved) {
      const netProfit = tx.amount - tx.cost - tx.gatewayTaxAmount - tx.discountAmount;
      if (netProfit < 0) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'MARGEM_NEGATIVA',
          title: 'Venda com Margem Negativa Detectada',
          severity: ALERT_SEVERITIES.CRITICAL,
          currentValue: Number(netProfit.toFixed(2)),
          expectedValue: Number((tx.amount * 0.20).toFixed(2)),
          metricUnit: 'R$',
          anomalyDetails: {
            orderId: tx.id,
            valorVenda: tx.amount,
            custo: tx.cost,
            desconto: tx.discountAmount,
            cupom: tx.coupon,
            prejuizo: Math.abs(netProfit)
          },
          entityType: 'order',
          entityId: tx.id,
          entityName: `Pedido #${tx.id}`,
          recommendedAction: 'Desative o cupom de desconto ou ajuste o preço do produto para estancar o prejuízo.',
          whatsappMessage:
            `📉 *[AUDITOR SILENCIOSO] MARGEM NEGATIVA / PREÇO ERRADO!*\n\n` +
            `Alerta de prejuízo no pedido *#${tx.id}* na loja *${tenant.name}*:\n\n` +
            `🏷️ *Valor da Venda:* R$ ${tx.amount.toFixed(2)}\n` +
            `📦 *Custo do Produto:* R$ ${tx.cost.toFixed(2)}\n` +
            `💸 *Lucro Líquido:* -R$ ${Math.abs(netProfit).toFixed(2)} (PREJUÍZO)${tx.coupon ? `\n🎟️ *Cupom:* ${tx.coupon}` : ''}\n\n` +
            `👉 *Ação Recomendada:* Revise o cupom aplicado ou o preço de venda imediatamente!`
        });
      }
    }
    return null;
  }

  // --- REGRA 4: ABANDONO DE CARRINHO ANORMAL ---
  checkAbnormalAbandonment(tenant, carts, settings, baseline) {
    const now = Date.now();
    const windowMs = 3 * 60 * 60 * 1000; // Janela de 3 horas
    const minCarts = settings.minCartVolumeForAlert || 8;
    const normalRate = baseline.historicalAbandonmentRate || 62.0;

    const recentCarts = carts.filter(c => (now - c.timestamp <= windowMs));
    if (recentCarts.length < minCarts) return null;

    const abandonedCount = recentCarts.filter(c => c.abandoned).length;
    const abandonmentRate = (abandonedCount / recentCarts.length) * 100;

    // Dispara se abandono estiver pelo menos 18 pontos acima do padrão histórico ou >= 80%
    if (abandonmentRate >= normalRate + 18 || abandonmentRate >= 80) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'ABANDONO_ANORMAL',
        title: 'Taxa de Abandono de Carrinho Acima do Padrão',
        severity: ALERT_SEVERITIES.WARNING,
        currentValue: Number(abandonmentRate.toFixed(1)),
        expectedValue: Number(normalRate.toFixed(1)),
        metricUnit: '%',
        anomalyDetails: {
          totalCarrinhos: recentCarts.length,
          abandonados: abandonedCount
        },
        entityType: 'checkout',
        entityId: 'cart_abandonment',
        entityName: 'Carrinhos e Checkout',
        recommendedAction: 'Verifique se o frete aumentou, se o cupom padrão falhou ou se há erro no cálculo de frete.',
        whatsappMessage:
          `🛒 *[AUDITOR SILENCIOSO] ABANDONO DE CARRINHO ANORMAL*\n\n` +
          `A taxa de abandono de carrinho disparou na loja *${tenant.name}*:\n\n` +
          `📊 *Taxa Atual:* ${abandonmentRate.toFixed(1)}% (Padrão Normal: ${normalRate.toFixed(1)}%)\n` +
          `🛒 *Carrinhos Analisados:* ${recentCarts.length} (${abandonedCount} abandonados)\n\n` +
          `👉 *Ação Recomendada:* Verifique se a integração de cálculo de frete ou cupom promocional está com lentidão ou erro!`
      });
    }
    return null;
  }

  // --- REGRA 5: FALHA CONCENTRADA EM MEIO DE PAGAMENTO ---
  checkPaymentMethodSpike(tenant, transactions, baseline) {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // Janela de 1 hora
    const recentTx = transactions.filter(t => (now - t.timestamp <= windowMs));

    // Testa PIX isoladamente
    const pixTx = recentTx.filter(t => t.paymentMethod === 'pix');
    if (pixTx.length >= 4) {
      const pixRefused = pixTx.filter(t => t.status === 'refused').length;
      const pixFailRate = (pixRefused / pixTx.length) * 100;
      const normalPixFail = baseline.historicalPixFailRate || 6.0;

      if (pixFailRate >= 35 && pixRefused >= 2) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'FALHA_MEIO_PAGAMENTO',
          title: 'Falha Concentrada em Pagamentos via PIX',
          severity: ALERT_SEVERITIES.CRITICAL,
          currentValue: Number(pixFailRate.toFixed(1)),
          expectedValue: Number(normalPixFail.toFixed(1)),
          metricUnit: '%',
          anomalyDetails: {
            metodo: 'PIX',
            tentativas: pixTx.length,
            falhas: pixRefused
          },
          entityType: 'payment_method',
          entityId: 'pix',
          entityName: 'PIX Instantâneo',
          recommendedAction: 'Acesse o provedor de QR Code PIX para validar se o webhook de confirmação ou chave PIX está ativa.',
          whatsappMessage:
            `⚡ *[AUDITOR SILENCIOSO] FALHA CONCENTRADA NO PIX!*\n\n` +
            `Atenção! Pagamentos via PIX estão falhando anormalmente na loja *${tenant.name}*:\n\n` +
            `❌ *Taxa de Falha:* ${pixFailRate.toFixed(1)}% (Padrão Normal: ~${normalPixFail.toFixed(1)}%)\n` +
            `📋 *Tentativas:* ${pixRefused} de ${pixTx.length} falharam na última hora\n\n` +
            `👉 *Ação Recomendada:* Teste a geração de QR Code no checkout para garantir que o gateway não expirou a chave PIX!`
        });
      }
    }
    return null;
  }

  // --- REGRA 6: ESTOQUE CRÍTICO POR VELOCIDADE DE VENDA ---
  checkStockVelocity(tenant, inventory, settings) {
    const thresholdDays = settings.minStockDaysThreshold || 2.5;

    for (const item of inventory) {
      if (item.dailySalesVelocity > 0) {
        const daysLeft = item.currentStock / item.dailySalesVelocity;
        if (daysLeft <= thresholdDays) {
          return createAlertRecord({
            tenantId: tenant.id,
            tenantName: tenant.name,
            operationMode: tenant.operationMode,
            alertKey: 'ESTOQUE_CRITICO',
            title: `Estoque Crítico: ${item.name}`,
            severity: daysLeft <= 1 ? ALERT_SEVERITIES.CRITICAL : ALERT_SEVERITIES.WARNING,
            currentValue: Number(daysLeft.toFixed(1)),
            expectedValue: Number((thresholdDays * 2).toFixed(1)),
            metricUnit: 'dias',
            anomalyDetails: {
              sku: item.sku,
              produto: item.name,
              estoqueAtual: item.currentStock,
              vendasDia: item.dailySalesVelocity,
              diasRestantes: daysLeft
            },
            entityType: 'product',
            entityId: item.sku || item.id,
            entityName: item.name,
            recommendedAction: 'Contate o fornecedor para reposição ou reduza o investimento em anúncios do produto.',
            whatsappMessage:
              `📦 *[AUDITOR SILENCIOSO] ESTOQUE CRÍTICO POR VELOCIDADE*\n\n` +
              `O produto *${item.name}* (${item.sku}) corre risco iminente de ruptura:\n\n` +
              `📊 *Estoque Atual:* ${item.currentStock} unidades\n` +
              `⚡ *Velocidade:* ~${item.dailySalesVelocity} vendas/dia\n` +
              `⏳ *Duração Estimada:* ~${daysLeft.toFixed(1)} dias de estoque restante!\n\n` +
              `👉 *Ação Recomendada:* Solicite reposição imediata ao fornecedor ou diminua o tráfego da campanha!`
          });
        }
      }
    }
    return null;
  }

  // --- REGRA 7: PICO DE CANCELAMENTOS / REEMBOLSOS ---
  checkRefundSpike(tenant, transactions, settings, baseline) {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // Janela de 24h
    const recentTx = transactions.filter(t => (now - t.timestamp <= windowMs));

    if (recentTx.length < 8) return null;

    const refunds = recentTx.filter(t => t.status === 'refunded' || t.status === 'chargeback');
    const refundRate = (refunds.length / recentTx.length) * 100;
    const maxAllowed = settings.maxRefundRatePercent || 6.0;

    if (refundRate >= maxAllowed && refunds.length >= 2) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'PICO_CANCELAMENTOS',
        title: 'Pico Anormal de Cancelamentos / Reembolsos',
        severity: ALERT_SEVERITIES.WARNING,
        currentValue: Number(refundRate.toFixed(1)),
        expectedValue: Number(maxAllowed.toFixed(1)),
        metricUnit: '%',
        anomalyDetails: {
          cancelamentos: refunds.length,
          totalPedidos: recentTx.length
        },
        entityType: 'order',
        entityId: 'refunds',
        entityName: 'Cancelamentos e Estornos',
        recommendedAction: 'Investigue se o lote de produtos está com defeito ou atraso crítico nos correios.',
        whatsappMessage:
          `⚠️ *[AUDITOR SILENCIOSO] PICO DE REEMBOLSOS / CANCELAMENTOS*\n\n` +
          `Aumento incomum de estornos na loja *${tenant.name}* nas últimas 24h:\n\n` +
          `📈 *Taxa Atual:* ${refundRate.toFixed(1)}% (${refunds.length} de ${recentTx.length} pedidos)\n` +
          `🛡️ *Limite Normal:* ${maxAllowed.toFixed(1)}%\n\n` +
          `👉 *Ação Recomendada:* Verifique o rastreamento das encomendas ou feedback do suporte ao cliente!`
      });
    }
    return null;
  }

  // --- REGRA 8: TRÁFEGO AUMENTANDO SEM VENDAS PROPORCIONAIS ---
  checkTrafficVsSalesConversion(tenant, traffic, transactions) {
    const now = Date.now();
    const windowMs = 12 * 60 * 60 * 1000;
    const recentTraffic = traffic.filter(t => (now - t.timestamp <= windowMs));
    const recentTx = transactions.filter(t => (now - t.timestamp <= windowMs) && t.status === 'approved');

    const totalClicks = recentTraffic.reduce((acc, t) => acc + (t.clicks || 0), 0);
    const totalSpend = recentTraffic.reduce((acc, t) => acc + (t.spend || 0), 0);

    // Se houve tráfego expressivo (> 150 cliques ou > R$ 150) mas zero ou 1 venda
    if (totalClicks >= 150 && totalSpend >= 120 && recentTx.length <= 1) {
      const conversionRate = (recentTx.length / totalClicks) * 100;
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'TRAFEGO_SEM_CONVERSAO',
        title: 'Tráfego Aumentando sem Crescimento de Vendas',
        severity: ALERT_SEVERITIES.WARNING,
        currentValue: Number(conversionRate.toFixed(2)),
        expectedValue: 1.5,
        metricUnit: '%',
        anomalyDetails: {
          cliques: totalClicks,
          investimento: totalSpend,
          vendasAprovadas: recentTx.length
        },
        entityType: 'traffic',
        entityId: 'traffic_conversion',
        entityName: 'Eficiência de Tráfego e Conversão',
        recommendedAction: 'Verifique se a página de destino está lenta, sem fotos ou com preço muito diferente do anúncio.',
        whatsappMessage:
          `📉 *[AUDITOR SILENCIOSO] QUEDA DE EFICIÊNCIA DE TRÁFEGO*\n\n` +
          `Sua loja *${tenant.name}* está recebendo tráfego mas as vendas não acompanham:\n\n` +
          `👥 *Cliques no Período:* ${totalClicks} visitas (R$ ${totalSpend.toFixed(2)} investidos)\n` +
          `🛍️ *Vendas Aprovadas:* ${recentTx.length}\n` +
          `📉 *Conversão:* ${conversionRate.toFixed(2)}% (Média de mercado: 1.2% a 2.5%)\n\n` +
          `👉 *Ação Recomendada:* Verifique o tempo de carregamento da loja e se a oferta do anúncio corresponde à página!`
      });
    }
    return null;
  }
}

module.exports = new EcommerceRulesEngine();
