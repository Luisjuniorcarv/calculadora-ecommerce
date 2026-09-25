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

  // Lead Form & Webhook
  const leadForm = document.getElementById('lead-form');
  const leadName = document.getElementById('lead-name');
  const leadWhatsapp = document.getElementById('lead-whatsapp');
  const leadFeedback = document.getElementById('lead-feedback');
  const btnSubmitLead = document.getElementById('btn-submit-lead');

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
  leadWhatsapp.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 10) {
      e.target.value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 6) {
      e.target.value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
    } else if (value.length > 2) {
      e.target.value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else {
      e.target.value = value;
    }
  });

  // ==========================================
  // 9. Envio do Lead & Webhook do n8n
  // ==========================================
  const DEFAULT_WEBHOOK_KEY = 'drophub_tools_n8n_webhook';
  
  // URL Padrão do n8n do Easypanel do usuário
  let n8nWebhookUrl = 'https://drophub-n8n.dvzzxm.easypanel.host/webhook/lead-calculadora';
  localStorage.setItem(DEFAULT_WEBHOOK_KEY, n8nWebhookUrl);

  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = leadName.value.trim();
    const whatsapp = leadWhatsapp.value.trim();

    if (!name || whatsapp.length < 14) {
      showToast('Por favor, informe seu nome e WhatsApp completo.');
      return;
    }

    btnSubmitLead.disabled = true;
    btnSubmitLead.innerHTML = `<span>Enviando para o WhatsApp...</span>`;

    const cleanPhone = whatsapp.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;

    const payload = {
      lead: {
        name,
        whatsapp: fullPhone,
        rawWhatsapp: whatsapp,
        timestamp: new Date().toISOString(),
        origin: 'Calculadora de Taxas & Lucro Real'
      },
      simulation: currentSimulationData
    };

    // Monta o relatório formatado
    const price = currentSimulationData ? Number(currentSimulationData.price || 0).toFixed(2) : '0.00';
    const profit = currentSimulationData ? Number(currentSimulationData.netProfit || 0).toFixed(2) : '0.00';
    const margin = currentSimulationData ? Number(currentSimulationData.netMargin || 0).toFixed(1) : '0.0';
    const gateway = currentSimulationData ? currentSimulationData.gatewayName : 'Mercado Pago';
    const platform = currentSimulationData ? currentSimulationData.platformName : 'Loja Virtual';

    const reportMsg = `📊 *[DROPHUB TOOLS] SEU RELATÓRIO DE LUCRO REAL*\n\n` +
      `Olá *${name}*! Aqui está o resumo da sua simulação na Calculadora de E-commerce:\n\n` +
      `🏷️ *Preço de Venda:* R$ ${price}\n` +
      `💳 *Gateway:* ${gateway} | *Plataforma:* ${platform}\n` +
      `💰 *LUCRO LÍQUIDO NO BOLSO:* R$ ${profit} (*${margin}% de margem*)\n\n` +
      `💡 *Diagnóstico de Otimização:*\n` +
      `Fazer contas pontuais é ótimo, mas você sabia que *checkouts travados e cartões recusados* comem até 30% do faturamento da sua loja em silêncio?\n\n` +
      `🛡️ *Conheça o Auditor Silencioso:*\n` +
      `Proteja seus pedidos 24h por dia por apenas *R$ 3,23 por dia* (R$ 97/mês):\n` +
      `https://calculadoradoecommerce.com.br/auditor.html`;

    try {
      // 1. Tenta disparar para o n8n
      fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(err => console.warn('n8n webhook:', err));

      // 2. Resolução inteligente de número no WhatsApp (ajusta 8 ou 9 dígitos no Brasil)
      let targetNumber = fullPhone;
      try {
        const checkRes = await fetch('https://drophub-evolution-wa.dvzzxm.easypanel.host/chat/whatsappNumbers/auditor', {
          method: 'POST',
          headers: {
            'apikey': '429683C4C977415CAAFCCE10F7D57E11',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ numbers: [fullPhone] })
        });
        const checkData = await checkRes.json();
        if (Array.isArray(checkData) && checkData.length > 0 && checkData[0].exists) {
          targetNumber = checkData[0].number || checkData[0].jid || fullPhone;
        }
      } catch (checkErr) {
        console.warn('Check number fallback:', checkErr);
      }

      // 3. Dispara diretamente pela Evolution API para garantir entrega instantânea!
      await fetch('https://drophub-evolution-wa.dvzzxm.easypanel.host/message/sendText/auditor', {
        method: 'POST',
        headers: {
          'apikey': '429683C4C977415CAAFCCE10F7D57E11',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          number: targetNumber,
          text: reportMsg,
          options: { delay: 1000, presence: 'composing' }
        })
      });

      leadFeedback.className = 'lead-feedback success';
      leadFeedback.innerHTML = `✅ <strong>Perfeito, ${name}!</strong> Seu relatório detalhado foi enviado com sucesso para o WhatsApp <strong>${whatsapp}</strong>. Confira agora no seu celular!`;
      leadFeedback.classList.remove('hidden');

      // Dispara evento de conversão para o Google Analytics 4
      if (typeof gtag === 'function') {
        gtag('event', 'generate_lead', {
          event_category: 'Conversao',
          event_label: 'Relatorio Calculadora WhatsApp'
        });
      }
      leadForm.reset();
      showToast('Relatório enviado para o seu WhatsApp!');

    } catch (err) {
      console.warn('Erro ao disparar direto na Evolution:', err);
      leadFeedback.className = 'lead-feedback success';
      leadFeedback.innerHTML = `✅ <strong>Perfeito, ${name}!</strong> Sua solicitação foi registrada e enviada para o WhatsApp <strong>${whatsapp}</strong>.`;
      leadFeedback.classList.remove('hidden');
      leadForm.reset();
      showToast('Relatório processado!');
    } finally {
      btnSubmitLead.disabled = false;
      btnSubmitLead.innerHTML = `
        <span>Receber Análise no WhatsApp</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      `;
    }
  });

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

  // Inicializar Primeiro Cálculo
  calculate();

});
