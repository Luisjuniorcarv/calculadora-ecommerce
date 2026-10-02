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

  // Calculator Lead Gate & Unlocked Elements
  const calculatorGate = document.getElementById('calculator-gate');
  const resultInnerContent = document.getElementById('result-inner-content');
  const gateForm = document.getElementById('gate-form');
  const gateName = document.getElementById('gate-name');
  const gateWhatsapp = document.getElementById('gate-whatsapp');
  const btnUnlockCalculator = document.getElementById('btn-unlock-calculator');
  const unlockedNotificationBar = document.getElementById('unlocked-notification-bar');
  const unlockedUserGreeting = document.getElementById('unlocked-user-greeting');
  const unlockedUserDesc = document.getElementById('unlocked-user-desc');
  const btnResendWhatsapp = document.getElementById('btn-resend-whatsapp');

  // Modal Webhook
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
    // Lucro e Métricas Principais
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
  // 9. Gestão de Estado do Gate (Desbloqueio)
  // ==========================================
  const STORAGE_USER_KEY = 'drophub_calc_user';
  const DEFAULT_WEBHOOK_KEY = 'drophub_tools_n8n_webhook';
  let n8nWebhookUrl = 'https://drophub-n8n.dvzzxm.easypanel.host/webhook/lead-calculadora';
  localStorage.setItem(DEFAULT_WEBHOOK_KEY, n8nWebhookUrl);

  const checkGateState = () => {
    try {
      const savedUser = JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || '{}');
      if (savedUser && savedUser.unlocked && savedUser.name) {
        // Usuário já desbloqueou nesta máquina
        if (resultInnerContent) resultInnerContent.classList.remove('is-locked-blurred');
        if (calculatorGate) calculatorGate.classList.add('hidden');
        if (unlockedNotificationBar) {
          unlockedNotificationBar.classList.remove('hidden');
          unlockedUserGreeting.textContent = `Demonstrativo liberado para ${savedUser.name}!`;
          unlockedUserDesc.innerHTML = `Cópia enviada para o WhatsApp <strong>${savedUser.whatsapp}</strong> com o <strong>Bônus de 10 Dias Grátis do Auditor Silencioso</strong>.`;
        }
        return true;
      }
    } catch (e) {
      // Ignora erro
    }
    return false;
  };

  // Montador do texto detalhado de WhatsApp com a promoção de 10 dias grátis
  const buildWhatsappReportMessage = (userName) => {
    const price = currentSimulationData ? Number(currentSimulationData.price || 0).toFixed(2) : '0.00';
    const cost = currentSimulationData ? Number(currentSimulationData.cost || 0).toFixed(2) : '0.00';
    const profit = currentSimulationData ? Number(currentSimulationData.netProfit || 0).toFixed(2) : '0.00';
    const margin = currentSimulationData ? Number(currentSimulationData.netMargin || 0).toFixed(1) : '0.0';
    const markup = currentSimulationData ? Number(currentSimulationData.effectiveMarkup || 0).toFixed(2) : '0.00';
    const totalDeductions = currentSimulationData ? Number(currentSimulationData.totalDeductions || 0).toFixed(2) : '0.00';
    const gateway = currentSimulationData ? currentSimulationData.gatewayName : 'Mercado Pago';
    const platform = currentSimulationData ? currentSimulationData.platformName : 'Loja Virtual';
    const method = currentSimulationData ? currentSimulationData.paymentMethod : 'Cartão';

    return (
      `📊 *[DROPHUB TOOLS] SEU RELATÓRIO DE LUCRO REAL & TAXAS*\n\n` +
      `Olá, *${userName}*! Aqui está o resumo financeiro detalhado da sua simulação:\n\n` +
      `🏷️ *Preço de Venda:* R$ ${price}\n` +
      `📦 *Custo do Produto (CMV):* R$ ${cost}\n` +
      `💳 *Gateway / Meio:* ${gateway} (${method})\n` +
      `🛒 *Plataforma:* ${platform}\n\n` +
      `💰 *LUCRO LÍQUIDO NO BOLSO:* R$ ${profit} (*${margin}% de margem*)\n` +
      `📉 *Total de Custos & Taxas:* R$ ${totalDeductions}\n` +
      `📈 *Markup Efetivo:* ${markup}x\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🎁 *SEU PRESENTE EXCLUSIVO DESBLOQUEADO:*\n` +
      `*10 DIAS GRÁTIS DO AUDITOR SILENCIOSO 24/7!*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Fazer contas no papel é o 1º passo. Mas sabia que *checkouts travados, picos de recusa de cartão e taxas ocultas* comem até 23% do faturamento de lojas online sem o lojista perceber?\n\n` +
      `O **Auditor Silencioso** fica de guarda 24h por dia e apita imediatamente no seu WhatsApp se qualquer anomalia acontecer na sua loja.\n\n` +
      `👉 *Para ativar seus 10 dias de teste grátis (sem cartão e sem compromisso):*\n` +
      `Basta responder esta mensagem com:\n` +
      `*QUERO ATIVAR 10 DIAS*\n\n` +
      `Ou clique no link direto da nossa equipe:\n` +
      `https://wa.me/5512992310222?text=Ol%C3%A1%2C%20fiz%20o%20c%C3%A1lculo%20na%20calculadora%20e%20quero%20ativar%20meus%2010%20dias%20gr%C3%A1tis%20do%20Auditor%20Silencioso!`
    );
  };

  // Disparo pela Evolution API (Cliente + Admin)
  const sendReportViaEvolution = async (name, whatsapp, fullPhone) => {
    const reportMsg = buildWhatsappReportMessage(name);

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
      `🔔 *[NOVO LEAD QUALIFICADO NA CALCULADORA!]*\n\n` +
      `Um lojista acabou de desbloquear o cálculo e recebeu a oferta de 10 dias grátis:\n\n` +
      `👤 *Nome:* ${name}\n` +
      `📱 *WhatsApp:* ${whatsapp}\n` +
      `🏷️ *Preço Simulado:* R$ ${priceStr}\n` +
      `💰 *Lucro Calculado:* R$ ${profitStr} (${marginStr}% margem)\n` +
      `💳 *Gateway:* ${gateway} | *Plataforma:* ${platform}\n` +
      `⏱️ *Hora:* ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n\n` +
      `🎁 *Status:* O relatório e o voucher de 10 dias foram enviados no zap dele!\n\n` +
      `👉 *Chamar no WhatsApp para ativar o teste:* \n` +
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

  // Submissão do Gate Obrigatório
  if (gateForm) {
    gateForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = gateName.value.trim();
      const whatsapp = gateWhatsapp.value.trim();
      const cleanPhone = whatsapp.replace(/\D/g, '');

      if (!name || cleanPhone.length < 10) {
        showToast('Por favor, informe seu nome e WhatsApp com DDD.');
        return;
      }

      btnUnlockCalculator.disabled = true;
      btnUnlockCalculator.innerHTML = `<span>🔓 Desbloqueando & Enviando...</span>`;

      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;

      // 1. Registra no backend local do Auditor Silencioso
      fetch('/api/leads/calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: { name, whatsapp: fullPhone, rawWhatsapp: whatsapp },
          simulation: currentSimulationData
        })
      }).catch(err => console.warn('Erro api local lead:', err));

      // 2. Dispara Webhook n8n (se disponível)
      fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: { name, whatsapp: fullPhone, rawWhatsapp: whatsapp, timestamp: new Date().toISOString() },
          simulation: currentSimulationData
        })
      }).catch(err => console.warn('Erro n8n lead:', err));

      // 3. Dispara WhatsApp instantâneo Evolution API
      await sendReportViaEvolution(name, whatsapp, fullPhone);

      // 4. Salva no localStorage para manter a sessão desbloqueada
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify({
        name,
        whatsapp,
        fullPhone,
        unlocked: true,
        unlockedAt: Date.now()
      }));

      // 5. Desbloqueia na tela com animação
      if (resultInnerContent) resultInnerContent.classList.remove('is-locked-blurred');
      if (calculatorGate) calculatorGate.classList.add('hidden');
      if (unlockedNotificationBar) {
        unlockedNotificationBar.classList.remove('hidden');
        unlockedUserGreeting.textContent = `Demonstrativo liberado para ${name}!`;
        unlockedUserDesc.innerHTML = `Enviamos o demonstrativo para o WhatsApp <strong>${whatsapp}</strong> com o <strong>Voucher de 10 Dias Grátis do Auditor Silencioso</strong>.`;
      }

      // Evento GA4
      if (typeof gtag === 'function') {
        gtag('event', 'generate_lead', {
          event_category: 'Conversao',
          event_label: 'Gate Calculadora Desbloqueado'
        });
      }

      showToast('🎉 Cálculo desbloqueado! Relatório enviado ao seu WhatsApp.');
      btnUnlockCalculator.disabled = false;
      btnUnlockCalculator.innerHTML = `<span>🔓 Desbloquear Lucro & Receber Análise Grátis</span>`;
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
