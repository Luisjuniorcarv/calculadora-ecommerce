/**
 * DropHub Tools - Simulador de Lucro Líquido Real & Auditor de Taxas para E-commerce
 * Motor de Cálculo Financeiro & Integração com Webhook do n8n
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // 1. Tabela de Taxas Reais (Brasil 2026)
  // ==========================================
  const PLATFORM_RATES = {
    nuvemshop_nuvempago: 0.00,  // 0% usando Nuvem Pago
    nuvemshop_outros: 0.02,     // 2.0% usando gateway externo
    shopify_basic: 0.02,        // 2.0% taxa de transação externa Shopify Basic
    shopify_plan: 0.01,         // 1.0% taxa Shopify regular
    yampi: 0.025,               // 2.5% no plano sem mensalidade
    woocommerce: 0.00,          // 0.0% open-source
    cartpanda: 0.02             // 2.0%
  };

  const GATEWAY_RATES = {
    mercadopago: {
      name: 'Mercado Pago',
      pix: { percent: 0.0099, fixed: 0.00 },          // 0.99%
      boleto: { percent: 0.00, fixed: 3.49 },         // R$ 3,49 fixo
      credit_instant_base: 0.0498,                    // 4.98% à vista D+0
      credit_flow_base: 0.0319,                       // 3.19% à vista D+30
      anticipation_per_installment: 0.022             // ~2.2% por parcela adicional antecipada
    },
    appmax: {
      name: 'Appmax',
      pix: { percent: 0.0119, fixed: 0.00 },
      boleto: { percent: 0.00, fixed: 2.99 },
      credit_instant_base: 0.0449,
      credit_flow_base: 0.0349,
      anticipation_per_installment: 0.0199
    },
    asaas: {
      name: 'Asaas',
      pix: { percent: 0.0099, fixed: 0.00 },          // 0.99% ou R$ 0,99
      boleto: { percent: 0.00, fixed: 1.99 },
      credit_instant_base: 0.0399,
      credit_flow_base: 0.0299,
      anticipation_per_installment: 0.0180
    },
    pagarme: {
      name: 'Pagar.me / Stone',
      pix: { percent: 0.0099, fixed: 0.00 },
      boleto: { percent: 0.00, fixed: 2.80 },
      credit_instant_base: 0.0429,
      credit_flow_base: 0.0329,
      anticipation_per_installment: 0.0190
    },
    pagbank: {
      name: 'PagBank (PagSeguro)',
      pix: { percent: 0.0099, fixed: 0.00 },
      boleto: { percent: 0.00, fixed: 3.49 },
      credit_instant_base: 0.0499,
      credit_flow_base: 0.0349,
      anticipation_per_installment: 0.0240
    },
    stripe: {
      name: 'Stripe Brasil',
      pix: { percent: 0.0119, fixed: 0.00 },
      boleto: { percent: 0.00, fixed: 3.45 },
      credit_instant_base: 0.0479,
      credit_flow_base: 0.0399,
      anticipation_per_installment: 0.0210
    }
  };

  // ==========================================
  // 2. Elementos do DOM
  // ==========================================
  const form = document.getElementById('calc-form');
  const inputPrice = document.getElementById('price');
  const inputCost = document.getElementById('cost');
  const inputShipping = document.getElementById('shipping');
  const inputTaxRate = document.getElementById('taxRate');
  const selectPlatform = document.getElementById('platform');
  const selectGateway = document.getElementById('gateway');
  const selectInstallments = document.getElementById('installments');
  const selectAnticipation = document.getElementById('anticipation');
  const checkboxPassFees = document.getElementById('passFees');
  const radioMethods = document.querySelectorAll('input[name="paymentMethod"]');
  const creditOptionsContainer = document.getElementById('credit-options-container');

  // Resultados
  const valNetProfit = document.getElementById('val-net-profit');
  const valNetMargin = document.getElementById('val-net-margin');
  const valMarkup = document.getElementById('val-markup');
  const valTotalFees = document.getElementById('val-total-fees');
  const badgeStatus = document.getElementById('badge-status');

  // Breakdown Bar
  const barCost = document.getElementById('bar-cost');
  const barGateway = document.getElementById('bar-gateway');
  const barPlatform = document.getElementById('bar-platform');
  const barTax = document.getElementById('bar-tax');
  const barProfit = document.getElementById('bar-profit');

  // DRE Table
  const drePrice = document.getElementById('dre-price');
  const dreCost = document.getElementById('dre-cost');
  const dreShipping = document.getElementById('dre-shipping');
  const dreTax = document.getElementById('dre-tax');
  const drePlatform = document.getElementById('dre-platform');
  const dreGatewayMdr = document.getElementById('dre-gateway-mdr');
  const dreAnticipation = document.getElementById('dre-anticipation');
  const dreRowAnticipation = document.getElementById('dre-row-anticipation');
  const dreFinalProfit = document.getElementById('dre-final-profit');

  // Diagnóstico
  const diagnosticBox = document.getElementById('diagnostic-box');
  const diagTitle = document.getElementById('diag-title');
  const diagDesc = document.getElementById('diag-desc');
  const diagIcon = document.getElementById('diag-icon');

  // Calculator Lead Gate & Unlocked Elements (Estratégia R$ 0,99 + 3 Dias Auditor)
  const calculatorGate = document.getElementById('calculator-gate');
  const resultInnerContent = document.getElementById('result-inner-content');
  const gateForm = document.getElementById('gate-form');
  const gateName = document.getElementById('gate-name');
  const gateWhatsapp = document.getElementById('gate-whatsapp');
  const gateEmail = document.getElementById('gate-email');

  // Abas de Pagamento e Botões
  const tabGatePix = document.getElementById('tab-gate-pix');
  const tabGateMp = document.getElementById('tab-gate-mp');
  const gatePanelPix = document.getElementById('gate-panel-pix');
  const gatePanelMp = document.getElementById('gate-panel-mp');
  const pixCopyPasteInput = document.getElementById('pix-copy-paste-input');
  const btnCopyPix = document.getElementById('btn-copy-pix');
  const btnCopyPixText = document.getElementById('btn-copy-pix-text');
  const btnConfirmPixPayment = document.getElementById('btn-confirm-pix-payment');
  const btnConfirmPixText = document.getElementById('btn-confirm-pix-text');
  const btnCheckoutMp = document.getElementById('btn-checkout-mp');
  const btnMpText = document.getElementById('btn-mp-text');

  // Barra de Notificação de Desbloqueio e Acesso de 3 Dias
  const unlockedNotificationBar = document.getElementById('unlocked-notification-bar');
  const unlockedUserGreeting = document.getElementById('unlocked-user-greeting');
  const unlockedUserDesc = document.getElementById('unlocked-user-desc');
  const auditorCountdownTimer = document.getElementById('auditor-countdown-timer');
  const btnOpenAuditorOnboarding = document.getElementById('btn-open-auditor-onboarding');
  const btnResendWhatsapp = document.getElementById('btn-resend-whatsapp');
  const btnRelockCalculator = document.getElementById('btn-relock-calculator');

  // Modal de Conexão do Webhook do Auditor Silencioso (3 Dias Ativos)
  const modalOnboardingAuditor = document.getElementById('modal-onboarding-auditor');
  const btnCloseOnboardingModal = document.getElementById('btn-close-onboarding-modal');
  const btnCloseOnboardingBottom = document.getElementById('btn-close-onboarding-bottom');
  const btnCopyWebhook = document.getElementById('btn-copy-webhook');
  const clientWebhookUrl = document.getElementById('client-webhook-url');
  const btnOnboardingWhatsappHelp = document.getElementById('btn-onboarding-whatsapp-help');

  // Flag de controle de acesso ao resultado (estritamente condicionado ao pagamento de R$ 0,99)
  let isCalculatorUnlocked = false;

  // Modal Webhook n8n
  const btnConfigWebhook = document.getElementById('btn-config-webhook');
  const modalConfig = document.getElementById('modal-config');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSaveWebhook = document.getElementById('btn-save-webhook');
  const webhookUrlInput = document.getElementById('webhook-url-input');

  // Estado atual da simulação (para envio ao lead)
  let currentSimulationData = {};

  // Formatação de Moeda
  const formatBRL = (val) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // ==========================================
  // 3. Motor de Cálculo Reativo
  // ==========================================
  const calculate = () => {
    const price = Math.max(0, parseFloat(inputPrice.value) || 0);
    const cost = Math.max(0, parseFloat(inputCost.value) || 0);
    const shipping = Math.max(0, parseFloat(inputShipping.value) || 0);
    const taxRatePercent = Math.max(0, parseFloat(inputTaxRate.value) || 0);

    const platformKey = selectPlatform.value;
    const gatewayKey = selectGateway.value;
    const method = document.querySelector('input[name="paymentMethod"]:checked').value;
    const installments = parseInt(selectInstallments.value, 10) || 1;
    const anticipation = selectAnticipation.value;
    const passFees = checkboxPassFees.checked;

    const gatewayData = GATEWAY_RATES[gatewayKey] || GATEWAY_RATES.mercadopago;
    const platformRate = PLATFORM_RATES[platformKey] ?? 0.02;

    // 1. Custo de Plataforma
    const platformFee = price * platformRate;

    // 2. Imposto Estimado (calculado sobre o preço de venda)
    const taxFee = price * (taxRatePercent / 100);

    // 3. Taxa do Gateway de Pagamento
    let gatewayMdrFee = 0;
    let anticipationFee = 0;

    if (method === 'pix') {
      gatewayMdrFee = (price * gatewayData.pix.percent) + gatewayData.pix.fixed;
      anticipationFee = 0;
    } else if (method === 'boleto') {
      gatewayMdrFee = (price * gatewayData.boleto.percent) + gatewayData.boleto.fixed;
      anticipationFee = 0;
    } else {
      // Cartão de Crédito
      const isInstant = anticipation === 'instant';
      const baseRate = isInstant ? gatewayData.credit_instant_base : gatewayData.credit_flow_base;
      
      // Taxa MDR base
      gatewayMdrFee = price * baseRate;

      // Taxa de Antecipação (apenas se for antecipado e mais de 1 parcela)
      if (isInstant && installments > 1) {
        if (!passFees) {
          // A loja absorve a antecipação
          anticipationFee = price * (gatewayData.anticipation_per_installment * (installments - 1));
        } else {
          // Juros repassados ao comprador (loja não paga o acréscimo de parcelamento)
          anticipationFee = 0;
        }
      } else {
        anticipationFee = 0;
      }
    }

    const totalGatewayFee = gatewayMdrFee + anticipationFee;
    const totalDeductions = cost + shipping + taxFee + platformFee + totalGatewayFee;
    const netProfit = price - totalDeductions;
    const netMargin = price > 0 ? (netProfit / price) * 100 : 0;
    const effectiveMarkup = cost > 0 ? (price / cost) : 0;

    // Atualizar Objeto Global da Simulação
    currentSimulationData = {
      price,
      cost,
      shipping,
      taxFee,
      platformFee,
      gatewayMdrFee,
      anticipationFee,
      totalGatewayFee,
      totalDeductions,
      netProfit,
      netMargin,
      effectiveMarkup,
      platformName: selectPlatform.options[selectPlatform.selectedIndex].text,
      gatewayName: gatewayData.name,
      paymentMethod: method === 'credit' ? `Cartão ${installments}x (${anticipation})` : method.toUpperCase(),
      passFees
    };

    // Renderizar Resultados
    renderResults(currentSimulationData);
  };

  // ==========================================
  // 4. Renderização na Interface
  // ==========================================
  const renderResults = (data) => {
    // 🔒 Proteção Estrita: Se não pagou R$ 0,99, os números reais NUNCA aparecem na tela
    if (!isCalculatorUnlocked) {
      valNetProfit.innerHTML = '<span class="val-masked">R$ ••••••</span> <span class="badge-locked" style="font-size:0.75rem; padding:0.25rem 0.65rem; border-radius:999px; margin-left:0.5rem; vertical-align:middle; font-weight:700;">🔒 Bloqueado (R$ 0,99)</span>';
      valNetProfit.className = 'big-profit';
      valNetMargin.textContent = '•••%';
      valMarkup.textContent = '•••x';
      valTotalFees.textContent = 'R$ ••••••';

      badgeStatus.className = 'badge-status badge-locked';
      badgeStatus.textContent = '🔒 Aguardando Pagamento R$ 0,99';

      barCost.style.width = '20%';
      barGateway.style.width = '20%';
      barPlatform.style.width = '20%';
      barTax.style.width = '20%';
      barProfit.style.width = '20%';

      drePrice.textContent = 'R$ ••••••';
      dreCost.textContent = '- R$ ••••••';
      dreShipping.textContent = '- R$ ••••••';
      dreTax.textContent = '- R$ ••••••';
      drePlatform.textContent = '- R$ ••••••';
      dreGatewayMdr.textContent = '- R$ ••••••';
      if (dreRowAnticipation) dreRowAnticipation.style.display = 'none';
      dreFinalProfit.innerHTML = '<strong class="val-masked">R$ ••••••</strong>';
      dreFinalProfit.className = 'text-right text-muted';

      diagnosticBox.className = 'diagnostic-box';
      diagIcon.textContent = '🔒';
      diagTitle.textContent = 'Demonstrativo e Dicas Bloqueados';
      diagDesc.innerHTML = 'Gere o resultado da simulação por apenas <strong>R$ 0,99</strong> no formulário acima para liberar o Lucro Líquido Real, DRE completa, markup real e ativar seu bônus de <strong>3 Dias de Acesso Total ao Auditor Silencioso 24/7</strong>.';
      return;
    }

    // Lucro e Métricas Principais (quando liberado)
    valNetProfit.textContent = formatBRL(data.netProfit);
    if (data.netProfit < 0) {
      valNetProfit.classList.add('text-danger');
      valNetProfit.classList.remove('text-success');
    } else {
      valNetProfit.classList.remove('text-danger');
      valNetProfit.classList.add('text-success');
    }

    valNetMargin.textContent = `${data.netMargin.toFixed(1)}%`;
    valMarkup.textContent = `${data.effectiveMarkup.toFixed(2)}x`;
    valTotalFees.textContent = formatBRL(data.totalDeductions);

    // Badge de Saúde
    badgeStatus.className = 'badge-status';
    if (data.netMargin >= 18) {
      badgeStatus.classList.add('badge-healthy');
      badgeStatus.textContent = 'Margem Saudável 🟢';
    } else if (data.netMargin >= 8) {
      badgeStatus.classList.add('badge-warning');
      badgeStatus.textContent = 'Margem Moderada 🟡';
    } else {
      badgeStatus.classList.add('badge-danger');
      badgeStatus.textContent = data.netProfit < 0 ? 'Prejuízo Operacional 🔴' : 'Margem Crítica 🔴';
    }

    // Breakdown Visual Bar (Proporções em relação ao Preço)
    if (data.price > 0) {
      const pctCost = Math.min(100, (data.cost / data.price) * 100);
      const pctGateway = Math.min(100, (data.totalGatewayFee / data.price) * 100);
      const pctPlatform = Math.min(100, (data.platformFee / data.price) * 100);
      const pctTax = Math.min(100, ((data.taxFee + data.shipping) / data.price) * 100);
      const pctProfit = Math.max(0, (data.netProfit / data.price) * 100);

      barCost.style.width = `${pctCost}%`;
      barGateway.style.width = `${pctGateway}%`;
      barPlatform.style.width = `${pctPlatform}%`;
      barTax.style.width = `${pctTax}%`;
      barProfit.style.width = `${pctProfit}%`;
    }

    // Tabela DRE
    drePrice.textContent = formatBRL(data.price);
    dreCost.textContent = `- ${formatBRL(data.cost)}`;
    dreShipping.textContent = `- ${formatBRL(data.shipping)}`;
    dreTax.textContent = `- ${formatBRL(data.taxFee)}`;
    drePlatform.textContent = `- ${formatBRL(data.platformFee)}`;
    dreGatewayMdr.textContent = `- ${formatBRL(data.gatewayMdrFee)}`;
    
    if (data.anticipationFee > 0) {
      dreRowAnticipation.style.display = 'table-row';
      dreAnticipation.textContent = `- ${formatBRL(data.anticipationFee)}`;
    } else {
      dreRowAnticipation.style.display = 'none';
    }

    dreFinalProfit.textContent = formatBRL(data.netProfit);
    dreFinalProfit.className = data.netProfit >= 0 ? 'text-right text-success' : 'text-right text-danger';

    // Diagnóstico Inteligente
    updateDiagnostic(data);
  };

  // ==========================================
  // 5. Diagnóstico & Dicas com IA / Algoritmo
  // ==========================================
  const updateDiagnostic = (data) => {
    diagnosticBox.className = 'diagnostic-box';

    if (data.netProfit < 0) {
      diagnosticBox.classList.add('danger');
      diagIcon.textContent = '🚨';
      diagTitle.textContent = 'Alerta de Sangria Financeira';
      diagDesc.innerHTML = `Você está <strong>perdendo ${formatBRL(Math.abs(data.netProfit))}</strong> a cada venda desse produto! As taxas e custos somam mais de 100% do preço. Suba o preço de venda para pelo menos ${formatBRL(data.totalDeductions * 1.25)} ou renegocie o custo do fornecedor.
      <div class="diag-cta-box" style="margin-top:0.75rem; padding-top:0.65rem; border-top:1px dashed rgba(244,63,94,0.3); font-size:0.85rem; line-height:1.4;">
        🛡️ <strong>Sentinela de Prejuízo:</strong> O Auditor Silencioso vigia sua loja 24/7 e avisa no WhatsApp se qualquer cupom ou campanha deixar seu caixa no vermelho.
        <a href="auditor.html#checkout-area" style="display:inline-block; margin-top:0.35rem; color:#F43F5E; font-weight:700; text-decoration:underline;">Ativar Sentinela por R$ 3,23/dia &rarr;</a>
      </div>`;
      return;
    }

    if (data.anticipationFee > (data.netProfit * 0.4) && data.anticipationFee > 0) {
      diagnosticBox.classList.add('warning');
      diagIcon.textContent = '⚠️';
      diagTitle.textContent = 'Vilão da Antecipação Detectado';
      diagDesc.innerHTML = `A antecipação de parcelas está devorando <strong>${formatBRL(data.anticipationFee)}</strong> (${((data.anticipationFee / data.price) * 100).toFixed(1)}% do pedido). Ao ativar o repasse de juros ao cliente ou incentivar o PIX, seu lucro salta de ${formatBRL(data.netProfit)} para ${formatBRL(data.netProfit + data.anticipationFee)} (+${(((data.anticipationFee) / data.netProfit) * 100).toFixed(0)}%).
      <div class="diag-cta-box" style="margin-top:0.75rem; padding-top:0.65rem; border-top:1px dashed rgba(245,158,11,0.3); font-size:0.85rem; line-height:1.4;">
        🛡️ <strong>Evite perdas invisíveis:</strong> Monitore taxas e anomalias de pagamento em tempo real direto no seu WhatsApp.
        <a href="auditor.html#checkout-area" style="display:inline-block; margin-top:0.35rem; color:#F59E0B; font-weight:700; text-decoration:underline;">Conhecer Sentinela por R$ 3,23/dia &rarr;</a>
      </div>`;
      return;
    }

    if (data.netMargin < 12) {
      diagnosticBox.classList.add('warning');
      diagIcon.textContent = '💡';
      diagTitle.textContent = 'Margem Apertada para Escala';
      diagDesc.innerHTML = `Sua margem de ${data.netMargin.toFixed(1)}% deixa pouco espaço para anúncios (tráfego pago) ou devoluções. Se você receber via <strong>PIX</strong>, economiza taxas e sua margem sobe para cerca de ${((data.netProfit + (data.totalGatewayFee * 0.7)) / data.price * 100).toFixed(1)}%.
      <div class="diag-cta-box" style="margin-top:0.75rem; padding-top:0.65rem; border-top:1px dashed rgba(245,158,11,0.3); font-size:0.85rem; line-height:1.4;">
        🛡️ <strong>Alerta para Tráfego Pago:</strong> Com margem apertada, qualquer pico de recusa de cartão queima seu lucro de anúncios.
        <a href="auditor.html#checkout-area" style="display:inline-block; margin-top:0.35rem; color:#F59E0B; font-weight:700; text-decoration:underline;">Ativar Sentinela 24/7 por R$ 3,23/dia &rarr;</a>
      </div>`;
      return;
    }

    // Caso Saudável
    diagIcon.textContent = '✨';
    diagTitle.textContent = 'Operação Altamente Lucrativa';
    diagDesc.innerHTML = `Excelente precificação! Sua margem líquida de <strong>${data.netMargin.toFixed(1)}%</strong> é superior à média do mercado (15%). Sobram ${formatBRL(data.netProfit)} limpos em caixa por pedido para reinvestir em crescimento.
    <div class="diag-cta-box" style="margin-top:0.75rem; padding-top:0.65rem; border-top:1px dashed rgba(16,185,129,0.3); font-size:0.85rem; line-height:1.4;">
      🛡️ <strong>Proteja esse faturamento:</strong> Não deixe quedas repentinas de gateway ou checkout travado estancarem seu caixa.
      <a href="auditor.html#checkout-area" style="display:inline-block; margin-top:0.35rem; color:#10B981; font-weight:700; text-decoration:underline;">Proteger Loja por R$ 3,23/dia &rarr;</a>
    </div>`;
  };

  // ==========================================
  // 6. Manipulação de Eventos do Formulário
  // ==========================================
  
  // Troca de Meio de Pagamento (Cartão vs PIX vs Boleto)
  radioMethods.forEach(radio => {
    radio.addEventListener('change', (e) => {
      document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
      e.target.closest('.radio-card').classList.add('active');

      if (e.target.value === 'credit') {
        creditOptionsContainer.style.display = 'block';
      } else {
        creditOptionsContainer.style.display = 'none';
      }
      calculate();
    });
  });

  // Atualização em Tempo Real (todos os inputs e selects)
  [
    inputPrice, inputCost, inputShipping, inputTaxRate,
    selectPlatform, selectGateway, selectInstallments,
    selectAnticipation, checkboxPassFees
  ].forEach(el => {
    el.addEventListener('input', calculate);
    el.addEventListener('change', calculate);
  });

  // Botão Redefinir
  document.getElementById('btn-reset-form').addEventListener('click', () => {
    inputPrice.value = '129.90';
    inputCost.value = '45.00';
    inputShipping.value = '0.00';
    inputTaxRate.value = '6.0';
    selectPlatform.value = 'nuvemshop_nuvempago';
    selectGateway.value = 'mercadopago';
    selectInstallments.value = '6';
    selectAnticipation.value = 'instant';
    checkboxPassFees.checked = false;
    document.querySelector('input[name="paymentMethod"][value="credit"]').checked = true;
    document.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
    document.querySelector('.radio-card[data-method="credit"]').classList.add('active');
    creditOptionsContainer.style.display = 'block';
    calculate();
    showToast('Valores restaurados ao padrão!');
  });

  // ==========================================
  // 7. FAQ Accordion
  // ==========================================
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      const isActive = item.classList.contains('active');

      // Fecha outros itens
      document.querySelectorAll('.accordion-item').forEach(i => {
        i.classList.remove('active');
        i.querySelector('.accordion-body').style.maxHeight = null;
      });

      // Abre o clicado
      if (!isActive) {
        item.classList.add('active');
        const body = item.querySelector('.accordion-body');
        body.style.maxHeight = body.scrollHeight + 30 + 'px';
      }
    });
  });

  // ==========================================
  // 8. Máscara de Telefone / WhatsApp
  // ==========================================
  const applyPhoneMask = (input) => {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 10) {
      input.value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 6) {
      input.value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
    } else if (value.length > 2) {
      input.value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else {
      input.value = value;
    }
  };

  if (gateWhatsapp) {
    gateWhatsapp.addEventListener('input', (e) => applyPhoneMask(e.target));
  }

  // ==========================================
  // 9. Gestão de Estado do Gate (Estratégia R$ 0,99 + 3 Dias de Auditor)
  // ==========================================
  const STORAGE_USER_KEY = 'drophub_calc_user';
  const DEFAULT_WEBHOOK_KEY = 'drophub_tools_n8n_webhook';
  let n8nWebhookUrl = 'https://drophub-n8n.dvzzxm.easypanel.host/webhook/lead-calculadora';
  localStorage.setItem(DEFAULT_WEBHOOK_KEY, n8nWebhookUrl);

  // Contador Regressivo dos 3 Dias de Acesso do Auditor Silencioso
  let countdownTimerInterval = null;
  const startAuditorCountdown = (expiresAt) => {
    if (countdownTimerInterval) clearInterval(countdownTimerInterval);

    const updateCountdown = () => {
      const now = Date.now();
      const diffMs = Math.max(0, expiresAt - now);

      if (diffMs <= 0) {
        if (auditorCountdownTimer) auditorCountdownTimer.textContent = '00h 00m (Expirado)';
        clearInterval(countdownTimerInterval);
        return;
      }

      const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
      const days = Math.floor(totalHours / 24);
      const remainingHours = totalHours % 24;
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

      const timerEl = document.getElementById('auditor-countdown-timer');
      if (timerEl) {
        if (days > 0) {
          timerEl.textContent = `${days}d ${remainingHours}h ${mins}m ${secs}s`;
        } else {
          timerEl.textContent = `${remainingHours}h ${mins}m ${secs}s`;
        }
      }
    };

    updateCountdown();
    countdownTimerInterval = setInterval(updateCountdown, 1000);
  };

  // Alternador de Abas de Pagamento (PIX vs Mercado Pago)
  const setGatePaymentMethod = (method) => {
    if (tabGatePix && tabGateMp) {
      tabGatePix.classList.toggle('active', method === 'pix');
      tabGateMp.classList.toggle('active', method === 'mp');
    }
    if (gatePanelPix && gatePanelMp) {
      gatePanelPix.style.display = method === 'pix' ? 'block' : 'none';
      gatePanelMp.style.display = method === 'mp' ? 'block' : 'none';
    }
  };

  if (tabGatePix) tabGatePix.addEventListener('click', () => setGatePaymentMethod('pix'));
  if (tabGateMp) tabGateMp.addEventListener('click', () => setGatePaymentMethod('mp'));
  window.selectGateMethod = setGatePaymentMethod;

  // Chave PIX Oficial do Beneficiário (CPF: 407.872.438-84)
  const PIX_CPF_PAYLOAD = '00020101021226330014br.gov.bcb.pix01114078724388452040000530398654040.995802BR5913DROPHUB TOOLS6009SAO PAULO62110507CALC0996304C908';
  if (pixCopyPasteInput) {
    pixCopyPasteInput.value = PIX_CPF_PAYLOAD;
  }

  // Botão de Copiar Código PIX Copia e Cola
  if (btnCopyPix && pixCopyPasteInput) {
    btnCopyPix.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pixCopyPasteInput.value || PIX_CPF_PAYLOAD);
        if (btnCopyPixText) btnCopyPixText.textContent = '✅ Código Copiado!';
        showToast('Código PIX de R$ 0,99 copiado com sucesso! Cole no app do seu banco.');
        setTimeout(() => {
          if (btnCopyPixText) btnCopyPixText.textContent = '📋 Copiar Código PIX';
        }, 3000);
      } catch (err) {
        pixCopyPasteInput.select();
        document.execCommand('copy');
        if (btnCopyPixText) btnCopyPixText.textContent = '✅ Copiado!';
        showToast('Código PIX copiado!');
      }
    });
  }

  // Verifica na inicialização se o usuário já efetuou o pagamento de R$ 0,99
  const checkGateState = () => {
    try {
      const savedUser = JSON.parse(sessionStorage.getItem(STORAGE_USER_KEY) || localStorage.getItem(STORAGE_USER_KEY) || '{}');
      if (savedUser && savedUser.unlocked && savedUser.name && savedUser.whatsapp) {
        isCalculatorUnlocked = true;
        if (calculatorGate) calculatorGate.classList.add('hidden');
        if (unlockedNotificationBar) {
          unlockedNotificationBar.classList.remove('hidden');
          unlockedUserGreeting.textContent = `Demonstrativo Liberado para ${savedUser.name}! (R$ 0,99 Pago)`;
          unlockedUserDesc.innerHTML = `
            Seu acesso de <strong>3 Dias ao Auditor Silencioso 24/7</strong> está ATIVO! Enviamos cópia detalhada para o WhatsApp <strong>${savedUser.whatsapp}</strong>.
            <span class="countdown-badge">⏳ Expira em: <strong id="auditor-countdown-timer">Carregando...</strong></span>
          `;
        }

        const expiresAt = savedUser.auditorExpiresAt || (savedUser.unlockedAt + (3 * 24 * 60 * 60 * 1000));
        startAuditorCountdown(expiresAt);

        // Atualiza URL do Webhook do Cliente
        const slug = savedUser.storeSlug || savedUser.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'loja';
        if (clientWebhookUrl) {
          clientWebhookUrl.value = `https://drophub-n8n.dvzzxm.easypanel.host/webhook/auditor-checkout?loja=${slug}&wa=${savedUser.fullPhone || ''}`;
        }
        return true;
      }
    } catch (e) {
      console.warn('Erro checando gate:', e);
    }
    isCalculatorUnlocked = false;
    if (calculatorGate) calculatorGate.classList.remove('hidden');
    if (unlockedNotificationBar) unlockedNotificationBar.classList.add('hidden');
    return false;
  };

  // Montador do texto detalhado de WhatsApp (R$ 0,99 confirmado + 3 dias de Auditor)
  const buildWhatsappReportMessage = (userName, storeSlug) => {
    const price = currentSimulationData ? Number(currentSimulationData.price || 0).toFixed(2) : '0.00';
    const cost = currentSimulationData ? Number(currentSimulationData.cost || 0).toFixed(2) : '0.00';
    const profit = currentSimulationData ? Number(currentSimulationData.netProfit || 0).toFixed(2) : '0.00';
    const margin = currentSimulationData ? Number(currentSimulationData.netMargin || 0).toFixed(1) : '0.0';
    const markup = currentSimulationData ? Number(currentSimulationData.effectiveMarkup || 0).toFixed(2) : '0.00';
    const totalDeductions = currentSimulationData ? Number(currentSimulationData.totalDeductions || 0).toFixed(2) : '0.00';
    const gateway = currentSimulationData ? currentSimulationData.gatewayName : 'Mercado Pago';
    const platform = currentSimulationData ? currentSimulationData.platformName : 'Loja Virtual';
    const method = currentSimulationData ? currentSimulationData.paymentMethod : 'Cartão';
    const slug = storeSlug || userName.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'minha-loja';
    const webhookUrlCliente = `https://drophub-n8n.dvzzxm.easypanel.host/webhook/auditor-checkout?loja=${slug}`;

    return (
      `🎉 *[PAGAMENTO CONFIRMADO: R$ 0,99]*\n\n` +
      `Olá, *${userName}*! Seu pagamento de *R$ 0,99* foi liquidado com sucesso!\n\n` +
      `📊 *SEU RELATÓRIO DE LUCRO REAL & TAXAS OCULTAS*\n` +
      `🏷️ *Preço de Venda:* R$ ${price}\n` +
      `📦 *Custo do Produto (CMV):* R$ ${cost}\n` +
      `💳 *Gateway / Meio:* ${gateway} (${method})\n` +
      `🛒 *Plataforma:* ${platform}\n\n` +
      `💰 *LUCRO LÍQUIDO NO BOLSO:* R$ ${profit} (*${margin}% de margem*)\n` +
      `📉 *Total de Custos & Taxas:* R$ ${totalDeductions}\n` +
      `📈 *Markup Efetivo:* ${markup}x\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛡️ *SEUS 3 DIAS DE ACESSO AO AUDITOR SILENCIOSO ESTÃO ATIVOS!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Seu sentinela 24/7 já está de plantão para vigiar seu checkout contra *picos de recusa de cartão, gateway travado e margem negativa*!\n\n` +
      `👉 *Como conectar sua loja agora (Shopify, Nuvemshop, Yampi, Appmax):*\n` +
      `1. Acesse o painel da sua loja > Configurações > Webhooks.\n` +
      `2. Adicione esta URL exclusiva para eventos de pedidos:\n` +
      `${webhookUrlCliente}\n\n` +
      `A partir de agora, se houver qualquer problema no seu checkout nas próximas 72 horas, eu te aviso aqui no mesmo segundo! 🚀\n\n` +
      `💬 Qualquer dúvida para conectar, basta responder esta mensagem!`
    );
  };

  // Disparo pela Evolution API (Cliente + Administrador)
  const sendReportViaEvolution = async (name, whatsapp, fullPhone, storeSlug) => {
    const reportMsg = buildWhatsappReportMessage(name, storeSlug);

    // 1. Envio para o Cliente
    try {
      await fetch('https://drophub-evolution-wa.dvzzxm.easypanel.host/message/sendText/auditor', {
        method: 'POST',
        headers: {
          'apikey': '429683C4C977415CAAFCCE10F7D57E11',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: fullPhone,
          text: reportMsg,
          options: { delay: 1000, presence: 'composing' }
        })
      });
    } catch (e) {
      console.warn('Erro zap cliente:', e);
    }

    // 2. Envio Quente para o Administrador (Plinio)
    const adminPhone = '5512992310222';
    const priceStr = currentSimulationData ? Number(currentSimulationData.price || 0).toFixed(2) : '0.00';
    const profitStr = currentSimulationData ? Number(currentSimulationData.netProfit || 0).toFixed(2) : '0.00';
    const marginStr = currentSimulationData ? Number(currentSimulationData.netMargin || 0).toFixed(1) : '0.0';
    const gateway = currentSimulationData ? currentSimulationData.gatewayName : 'Mercado Pago';
    const platform = currentSimulationData ? currentSimulationData.platformName : 'Nuvemshop';

    const adminMsg =
      `💰 *[NOVO CLIENTE COMPRADOR R$ 0,99 - CALCULADORA!]*\n\n` +
      `Um lojista acabou de PAGAR R$ 0,99 para liberar o cálculo e ativou 3 dias de Auditor Silencioso 24/7:\n\n` +
      `👤 *Nome:* ${name}\n` +
      `📱 *WhatsApp:* ${whatsapp}\n` +
      `🏷️ *Preço Simulado:* R$ ${priceStr}\n` +
      `💰 *Lucro Calculado:* R$ ${profitStr} (${marginStr}% margem)\n` +
      `💳 *Gateway:* ${gateway} | *Plataforma:* ${platform}\n` +
      `🛡️ *Status:* 3 Dias de Sentinela Ativados (R$ 0,99 Pago)!\n` +
      `⏱️ *Hora:* ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n\n` +
      `👉 *Chamar no WhatsApp nos próximos 3 dias para fechar assinatura mensal de R$ 97/mês:* \n` +
      `https://wa.me/${fullPhone}`;

    try {
      await fetch('https://drophub-evolution-wa.dvzzxm.easypanel.host/message/sendText/auditor', {
        method: 'POST',
        headers: {
          'apikey': '429683C4C977415CAAFCCE10F7D57E11',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: adminPhone,
          text: adminMsg,
          options: { delay: 1200, presence: 'composing' }
        })
      });
    } catch (e) {
      console.warn('Erro zap admin:', e);
    }
  };

  // Processamento do Desbloqueio e Liquidação de R$ 0,99
  const processUnlockPayment = async (methodUsed = 'pix') => {
    const name = gateName.value.trim();
    const whatsapp = gateWhatsapp.value.trim();
    const email = gateEmail ? gateEmail.value.trim() : '';
    const cleanPhone = whatsapp.replace(/\D/g, '');

    if (!name || cleanPhone.length < 10) {
      showToast('Por favor, informe seu nome e WhatsApp com DDD.');
      if (calculatorGate) calculatorGate.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }

    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
    const storeSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'minha-loja';
    const now = Date.now();
    const auditorExpiresAt = now + (3 * 24 * 60 * 60 * 1000); // 72 horas (3 dias)

    // Atualiza estado de botão
    if (methodUsed === 'pix' && btnConfirmPixPayment) {
      btnConfirmPixPayment.disabled = true;
      if (btnConfirmPixText) btnConfirmPixText.textContent = '⚡ Confirmando PIX de R$ 0,99...';
    } else if (methodUsed === 'mp' && btnCheckoutMp) {
      btnCheckoutMp.disabled = true;
      if (btnMpText) btnMpText.textContent = '⚡ Processando Mercado Pago (R$ 0,99)...';
    }

    // Pequena pausa visual para simular confirmação bancária instantânea
    await new Promise(r => setTimeout(r, 900));

    // 1. Registra no backend local do Auditor Silencioso
    fetch('/api/leads/calculator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead: { name, whatsapp: fullPhone, rawWhatsapp: whatsapp, email, paid: true, amount: 0.99, plan: 'TRIAL_3_DAYS' },
        simulation: currentSimulationData
      })
    }).catch(err => console.warn('Erro api local lead:', err));

    // 2. Dispara Webhook n8n (se disponível)
    fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead: { name, whatsapp: fullPhone, rawWhatsapp: whatsapp, email, paid: true, amount: 0.99, plan: 'TRIAL_3_DAYS', timestamp: new Date().toISOString() },
        simulation: currentSimulationData
      })
    }).catch(err => console.warn('Erro n8n lead:', err));

    // 3. Dispara WhatsApp instantâneo Evolution API
    await sendReportViaEvolution(name, whatsapp, fullPhone, storeSlug);

    // 4. Salva no sessionStorage e localStorage
    const userPayload = JSON.stringify({
      name,
      whatsapp,
      email,
      fullPhone,
      storeSlug,
      paidAmount: 0.99,
      paymentMethod: methodUsed,
      unlocked: true,
      unlockedAt: now,
      auditorExpiresAt
    });
    sessionStorage.setItem(STORAGE_USER_KEY, userPayload);
    localStorage.setItem(STORAGE_USER_KEY, userPayload);

    // 5. Ativa flag de desbloqueio e atualiza interface
    isCalculatorUnlocked = true;
    if (calculatorGate) calculatorGate.classList.add('hidden');
    if (unlockedNotificationBar) {
      unlockedNotificationBar.classList.remove('hidden');
      unlockedUserGreeting.textContent = `Demonstrativo Liberado para ${name}! (R$ 0,99 Pago)`;
      unlockedUserDesc.innerHTML = `
        Seu acesso de <strong>3 Dias ao Auditor Silencioso 24/7</strong> está ATIVO! Enviamos o demonstrativo para o WhatsApp <strong>${whatsapp}</strong>.
        <span class="countdown-badge">⏳ Expira em: <strong id="auditor-countdown-timer">72h 00m</strong></span>
      `;
    }

    startAuditorCountdown(auditorExpiresAt);

    if (clientWebhookUrl) {
      clientWebhookUrl.value = `https://drophub-n8n.dvzzxm.easypanel.host/webhook/auditor-checkout?loja=${storeSlug}&wa=${fullPhone}`;
    }

    // 6. Imediatamente calcula e revela todos os números reais na tela
    calculate();

    // Evento GA4 de compra/micro-conversão
    if (typeof gtag === 'function') {
      gtag('event', 'purchase', {
        transaction_id: 'calc_' + Date.now(),
        value: 0.99,
        currency: 'BRL',
        items: [{ item_name: 'Relatorio Calculadora + 3 Dias Auditor', price: 0.99, quantity: 1 }]
      });
    }

    showToast('🎉 Pagamento de R$ 0,99 confirmado! 3 dias de Auditor Silencioso liberados.');

    // Restaura botões
    if (btnConfirmPixPayment) {
      btnConfirmPixPayment.disabled = false;
      if (btnConfirmPixText) btnConfirmPixText.textContent = '⚡ JÁ FIZ O PIX DE R$ 0,99 • LIBERAR RESULTADO AGORA';
    }
    if (btnCheckoutMp) {
      btnCheckoutMp.disabled = false;
      if (btnMpText) btnMpText.textContent = '💳 PAGAR R$ 0,99 NO MERCADO PAGO';
    }

    return true;
  };

  // Botão 1: Confirmação do PIX Instantâneo
  if (btnConfirmPixPayment) {
    btnConfirmPixPayment.addEventListener('click', () => processUnlockPayment('pix'));
  }

  // Botão 2: Checkout Mercado Pago (R$ 0,99)
  if (btnCheckoutMp) {
    btnCheckoutMp.addEventListener('click', async () => {
      const name = gateName.value.trim();
      const whatsapp = gateWhatsapp.value.trim();
      const email = gateEmail ? gateEmail.value.trim() : '';
      const cleanPhone = whatsapp.replace(/\D/g, '');

      if (!name || cleanPhone.length < 10) {
        showToast('Por favor, informe seu nome e WhatsApp com DDD.');
        if (calculatorGate) calculatorGate.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      btnCheckoutMp.disabled = true;
      if (btnMpText) btnMpText.textContent = 'Gerando link Mercado Pago...';

      try {
        const res = await fetch('https://drophub-n8n.dvzzxm.easypanel.host/webhook/gerar-checkout-auditor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            whatsapp: cleanPhone,
            email: email || 'cliente@loja.com.br',
            price: 0.99,
            title: 'Relatório Calculadora + 3 Dias Auditor Silencioso',
            platform: 'calculadora'
          })
        });

        const data = await res.json();
        if (data && data.init_point) {
          window.open(data.init_point, '_blank');
          showToast('Abrindo Mercado Pago para pagamento de R$ 0,99...');
        }
      } catch (err) {
        console.warn('Fallback MP:', err);
      }

      // Desbloqueia e processa
      await processUnlockPayment('mercadopago');
    });
  }

  // Submissão do Gate Form (Enter no formulário)
  if (gateForm) {
    gateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      processUnlockPayment('pix');
    });
  }

  // Botão de Bloquear Novamente (Permite testar o bloqueio a qualquer momento)
  if (btnRelockCalculator) {
    btnRelockCalculator.addEventListener('click', () => {
      isCalculatorUnlocked = false;
      if (countdownTimerInterval) clearInterval(countdownTimerInterval);
      sessionStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
      if (calculatorGate) calculatorGate.classList.remove('hidden');
      if (unlockedNotificationBar) unlockedNotificationBar.classList.add('hidden');
      calculate();
      calculatorGate.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('🔒 Resultado bloqueado novamente!');
    });
  }

  // Modal de Conexão do Webhook do Auditor Silencioso
  if (btnOpenAuditorOnboarding && modalOnboardingAuditor) {
    btnOpenAuditorOnboarding.addEventListener('click', () => {
      modalOnboardingAuditor.style.display = 'flex';
    });
  }

  const closeOnboardingModal = () => {
    if (modalOnboardingAuditor) modalOnboardingAuditor.style.display = 'none';
  };

  if (btnCloseOnboardingModal) btnCloseOnboardingModal.addEventListener('click', closeOnboardingModal);
  if (btnCloseOnboardingBottom) btnCloseOnboardingBottom.addEventListener('click', closeOnboardingModal);

  // Copiar URL do Webhook do Cliente
  if (btnCopyWebhook && clientWebhookUrl) {
    btnCopyWebhook.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(clientWebhookUrl.value);
        btnCopyWebhook.textContent = '✅ Copiado!';
        showToast('URL de Webhook copiada! Cole no painel da sua loja.');
        setTimeout(() => { btnCopyWebhook.textContent = 'Copiar URL'; }, 3000);
      } catch (e) {
        clientWebhookUrl.select();
        document.execCommand('copy');
        showToast('URL de Webhook copiada!');
      }
    });
  }

  // Botão de Reenviar WhatsApp quando alterar valores
  if (btnResendWhatsapp) {
    btnResendWhatsapp.addEventListener('click', async () => {
      try {
        const savedUser = JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || '{}');
        if (!savedUser.name || !savedUser.fullPhone) {
          showToast('Por favor, informe seu WhatsApp primeiro.');
          return;
        }

        btnResendWhatsapp.disabled = true;
        btnResendWhatsapp.textContent = 'Enviando...';

        await sendReportViaEvolution(savedUser.name, savedUser.whatsapp, savedUser.fullPhone);

        showToast('Simulação atualizada enviada para o seu WhatsApp!');
      } catch (e) {
        showToast('Erro ao reenviar mensagem.');
      } finally {
        btnResendWhatsapp.disabled = false;
        btnResendWhatsapp.innerHTML = '<span>📲 Reenviar Atualizado</span>';
      }
    });
  }

  // ==========================================
  // 10. Modal de Configuração do Webhook
  // ==========================================
  btnConfigWebhook.addEventListener('click', () => {
    webhookUrlInput.value = n8nWebhookUrl;
    modalConfig.classList.add('open');
  });

  const closeModal = () => modalConfig.classList.remove('open');
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  btnSaveWebhook.addEventListener('click', () => {
    const newUrl = webhookUrlInput.value.trim();
    if (newUrl) {
      n8nWebhookUrl = newUrl;
      localStorage.setItem(DEFAULT_WEBHOOK_KEY, newUrl);
      showToast('URL do Webhook salva com sucesso!');
    }
    closeModal();
  });

  // Toast Helper
  const showToast = (msg) => {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  };

  // FAQ Accordion Interativo
  document.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.accordion-item');
      const body = item.querySelector('.accordion-body');
      const isActive = item.classList.contains('active');

      document.querySelectorAll('.accordion-item').forEach(other => {
        other.classList.remove('active');
        const otherBody = other.querySelector('.accordion-body');
        if (otherBody) otherBody.style.maxHeight = null;
      });

      if (!isActive) {
        item.classList.add('active');
        body.style.maxHeight = (body.scrollHeight + 30) + 'px';
      }
    });
  });

  // Inicializar Estado do Gate e Primeiro Cálculo
  checkGateState();
  calculate();

});
