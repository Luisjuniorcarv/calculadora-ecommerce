/**
 * Auditor Silencioso - Gerenciador Inteligente de Licenças e Assinaturas
 * 
 * Funcionalidades Automatizadas:
 * 1. Teste Gratuito de 10 Dias (contagem e bloqueio automático).
 * 2. Assinatura Mensal de 30 Dias (contagem a partir da data de aquisição).
 * 3. Aviso Prévio Automático no WhatsApp 1 dia antes de vencer (com link de renovação).
 * 4. Bloqueio Imediato do Monitoramento e Alertas se não renovar.
 * 5. Desbloqueio e Extensão Instantânea por mais 30 dias após confirmação de pagamento (Webhook Asaas).
 * 6. Notificação em tempo real no WhatsApp do Administrador a cada evento.
 */

const storage = require('./storage');
const notificationDispatcher = require('./notification-dispatcher');
const { SUBSCRIPTION_STATUS, SUBSCRIPTION_PLANS } = require('./models');

class LicenseManager {
  constructor() {
    this.adminPhone = process.env.ADMIN_WHATSAPP || '5512992310222';
    this.defaultAsaasLink = process.env.ASAAS_PAYMENT_URL || 'https://www.asaas.com/c/auditor-silencioso';
  }

  /**
   * Rotina periódica: Verifica o status de todos os tenants
   * Dispara aviso 1 dia antes e bloqueia os vencidos.
   */
  async checkAllLicenses() {
    const tenants = storage.getAllTenants();
    const now = Date.now();
    const results = {
      evaluatedCount: tenants.length,
      warningsSent: [],
      blockedCount: [],
      activeCount: 0
    };

    for (const tenant of tenants) {
      if (!tenant.subscription) {
        tenant.subscription = {
          status: SUBSCRIPTION_STATUS.TRIAL,
          planType: SUBSCRIPTION_PLANS.TRIAL,
          durationDays: 10,
          activatedAt: tenant.createdAt || now,
          expiresAt: (tenant.createdAt || now) + (10 * 24 * 60 * 60 * 1000),
          oneDayWarningSent: false,
          blockedAt: null,
          lastPaymentConfirmedAt: null,
          asaasPaymentId: null,
          monthlyFee: 97.00,
          paymentLink: this.defaultAsaasLink
        };
        storage.saveTenant(tenant);
      }

      const sub = tenant.subscription;
      const msRemaining = sub.expiresAt - now;
      const hoursRemaining = msRemaining / (1000 * 60 * 60);

      // 1. REGRA: AVISO 1 DIA ANTES (Entre 0 e 24h restantes)
      if (hoursRemaining <= 24 && hoursRemaining > 0 && !sub.oneDayWarningSent && sub.status !== SUBSCRIPTION_STATUS.BLOCKED) {
        await this.sendExpirationWarning(tenant, hoursRemaining);
        sub.oneDayWarningSent = true;
        sub.status = SUBSCRIPTION_STATUS.EXPIRING_SOON;
        storage.saveTenant(tenant);
        results.warningsSent.push(tenant.name);
      }

      // 2. REGRA: BLOQUEIO AUTOMÁTICO APÓS EXPIRAÇÃO
      else if (msRemaining <= 0 && sub.status !== SUBSCRIPTION_STATUS.BLOCKED) {
        await this.blockTenantForNonPayment(tenant);
        results.blockedCount.push(tenant.name);
      }

      // Contagem de ativos
      if (sub.status === SUBSCRIPTION_STATUS.ACTIVE || sub.status === SUBSCRIPTION_STATUS.TRIAL || sub.status === SUBSCRIPTION_STATUS.EXPIRING_SOON) {
        results.activeCount++;
      }
    }

    return results;
  }

  /**
   * Dispara aviso no WhatsApp 1 dia antes do vencimento
   */
  async sendExpirationWarning(tenant, hoursRemaining) {
    const isTrial = tenant.subscription.planType === SUBSCRIPTION_PLANS.TRIAL;
    const planName = isTrial ? 'seu teste grátis de 10 dias' : 'sua assinatura de 30 dias';
    const payUrl = tenant.subscription.paymentLink || this.defaultAsaasLink;

    const clientMsg =
      `⚠️ *[AVISO DO AUDITOR SILENCIOSO: 1 DIA PARA VENCER]*\n\n` +
      `Olá, *${tenant.name}*!\n\n` +
      `Faltam menos de *24 horas* para o término de *${planName}* do Auditor Silencioso 24/7.\n\n` +
      `🛡️ *Por que manter ativo?*\n` +
      `Sem o Auditor, você fica no escuro se o gateway tiver *pico de recusa de cartão*, *checkout travar* ou cobrar taxas a mais nas parcelas.\n\n` +
      `☕ *Preço Fracionado:* Menos que um café de padaria: apenas *R$ 3,23 por dia* (R$ 97,00/mês).\n\n` +
      `👉 *Link para Renovar via Cartão ou PIX:* \n` +
      `${payUrl}\n\n` +
      `Assim que o pagamento for confirmado, seu sentinela continua 100% ativo sem nenhuma interrupção! 🚀`;

    if (tenant.whatsappDestination) {
      await notificationDispatcher.sendDirectMessage(tenant.whatsappDestination, clientMsg, 'LICENSE_WARNING');
    }

    // Avisa o administrador
    const adminMsg =
      `🔔 *[AVISO COMERCIAL] CLIENTE VENCE AMANHÃ!*\n\n` +
      `👤 *Cliente:* ${tenant.name}\n` +
      `📱 *WhatsApp:* ${tenant.whatsappDestination}\n` +
      `📦 *Plano:* ${isTrial ? '10 Dias de Teste' : 'Assinatura Mensal'}\n` +
      `⏳ *Expira em:* Aproximadamente ${Math.max(1, Math.round(hoursRemaining))} horas.\n\n` +
      `O aviso automático com link de pagamento já foi enviado. Vale a pena mandar um olá no WhatsApp para tirar dúvidas e fechar a renovação!\n` +
      `👉 https://wa.me/${tenant.whatsappDestination}`;

    await notificationDispatcher.sendDirectMessage(this.adminPhone, adminMsg, 'ADMIN_CLIENT_EXPIRING');
  }

  /**
   * Bloqueia o tenant por expiração de prazo
   */
  async blockTenantForNonPayment(tenant) {
    const isTrial = tenant.subscription.planType === SUBSCRIPTION_PLANS.TRIAL;
    const payUrl = tenant.subscription.paymentLink || this.defaultAsaasLink;

    tenant.subscription.status = SUBSCRIPTION_STATUS.BLOCKED;
    tenant.subscription.blockedAt = Date.now();
    storage.saveTenant(tenant);

    const clientMsg =
      `🔒 *[AUDITOR SILENCIOSO: ACESSO PAUSADO]*\n\n` +
      `Olá, *${tenant.name}*.\n\n` +
      `Seu período de ${isTrial ? '10 dias de teste gratuito' : '30 dias de assinatura'} encerrou e o monitoramento em tempo real do seu checkout foi *SUSPENSO*.\n\n` +
      `⚠️ Enquanto estiver pausado, você *não receberá alertas* se sua loja perder vendas por instabilidade de gateway ou recusas.\n\n` +
      `💰 *Para reativar instantaneamente por R$ 3,23/dia (R$ 97,00/mês):*\n` +
      `👉 Acesse o link de regularização: \n` +
      `${payUrl}\n\n` +
      `Assim que o pagamento for liquidado no Asaas, seu sistema é *desbloqueado automaticamente* em poucos segundos! ⚡`;

    if (tenant.whatsappDestination) {
      await notificationDispatcher.sendDirectMessage(tenant.whatsappDestination, clientMsg, 'LICENSE_BLOCKED');
    }

    // Avisa o administrador
    const adminMsg =
      `🚨 *[CLIENTE BLOQUEADO - AUDITOR SILENCIOSO]*\n\n` +
      `👤 *Cliente:* ${tenant.name}\n` +
      `📱 *WhatsApp:* ${tenant.whatsappDestination}\n` +
      `🛑 O prazo expirou e o monitoramento foi pausado automaticamente.\n\n` +
      `👉 Chame agora para fechar a renovação de R$ 97,00:\n` +
      `https://wa.me/${tenant.whatsappDestination}`;

    await notificationDispatcher.sendDirectMessage(this.adminPhone, adminMsg, 'ADMIN_CLIENT_BLOCKED');
  }

  /**
   * Ativa 10 Dias de Teste Gratuito para um Tenant
   */
  async activateTrial(tenantId, days = 10) {
    const tenant = storage.getTenant(tenantId);
    if (!tenant) throw new Error('Cliente/Tenant não encontrado');

    const now = Date.now();
    tenant.subscription = {
      ...(tenant.subscription || {}),
      status: SUBSCRIPTION_STATUS.TRIAL,
      planType: SUBSCRIPTION_PLANS.TRIAL,
      durationDays: days,
      activatedAt: now,
      expiresAt: now + (days * 24 * 60 * 60 * 1000),
      oneDayWarningSent: false,
      blockedAt: null,
      monthlyFee: 97.00,
      paymentLink: tenant.subscription?.paymentLink || this.defaultAsaasLink
    };
    storage.saveTenant(tenant);

    const clientMsg =
      `🛡️ *[AUDITOR SILENCIOSO: 10 DIAS GRÁTIS ATIVADOS!]*\n\n` +
      `Parabéns, *${tenant.name}*! Seus 10 dias de proteção inteligente 24/7 estão oficialmente *NO AR*.\n\n` +
      `🚀 *O que seu Sentinela já está fazendo:*\n` +
      `• Vigia taxa de aprovação de cartão minuto a minuto.\n` +
      `• Monitora abandono e travamentos de checkout.\n` +
      `• Apita imediatamente aqui se houver anomalias ou vazamento de margem.\n\n` +
      `📊 *Acompanhe pelo painel:* https://calculadoradoecommerce.com.br/dashboard.html\n\n` +
      `Boas vendas com total tranquilidade! ⚡`;

    if (tenant.whatsappDestination) {
      await notificationDispatcher.sendDirectMessage(tenant.whatsappDestination, clientMsg, 'TRIAL_ACTIVATED');
    }

    // Notifica admin
    const adminMsg = `✅ *[TRIAL ATIVADO]* Cliente *${tenant.name}* (${tenant.whatsappDestination}) ativado para 10 dias de teste grátis!`;
    await notificationDispatcher.sendDirectMessage(this.adminPhone, adminMsg, 'ADMIN_TRIAL_ACTIVATED');

    return tenant.subscription;
  }

  /**
   * Ativa ou Renova a Assinatura por 30 Dias (Contando a partir de hoje)
   * Disparado após confirmação de pagamento Asaas ou ativação manual
   */
  async activatePaid(tenantId, days = 30, paymentDetails = {}) {
    const tenant = storage.getTenant(tenantId);
    if (!tenant) throw new Error('Cliente/Tenant não encontrado');

    const now = Date.now();
    tenant.subscription = {
      ...(tenant.subscription || {}),
      status: SUBSCRIPTION_STATUS.ACTIVE,
      planType: SUBSCRIPTION_PLANS.MONTHLY,
      durationDays: days,
      activatedAt: now,
      expiresAt: now + (days * 24 * 60 * 60 * 1000), // 30 dias a partir da confirmação
      oneDayWarningSent: false,
      blockedAt: null,
      lastPaymentConfirmedAt: now,
      asaasPaymentId: paymentDetails.id || paymentDetails.paymentId || 'manual_' + now,
      monthlyFee: Number(paymentDetails.value || 97.00),
      paymentLink: tenant.subscription?.paymentLink || this.defaultAsaasLink
    };
    storage.saveTenant(tenant);

    const clientMsg =
      `🎉 *[PAGAMENTO CONFIRMADO - ASSINATURA 100% ATIVA!]*\n\n` +
      `Excelente notícia, *${tenant.name}*!\n\n` +
      `Confirmamos o pagamento da sua assinatura do **Auditor Silencioso 24/7** com sucesso.\n\n` +
      `🛡️ *Status:* OPERAÇÃO 100% PROTEGIDA\n` +
      `⏳ *Vigência:* 30 dias contínuos (renovável automaticamente)\n` +
      `📊 *Painel do Assinante:* https://calculadoradoecommerce.com.br/dashboard.html\n\n` +
      `Seu checkout está blindado contra falhas invisíveis e sangrias de caixa. Muito obrigado pela parceria! 🚀`;

    if (tenant.whatsappDestination) {
      await notificationDispatcher.sendDirectMessage(tenant.whatsappDestination, clientMsg, 'PAYMENT_CONFIRMED');
    }

    // Notifica admin
    const amountStr = Number(paymentDetails.value || 97.00).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const adminMsg =
      `💰 *[PAGAMENTO CONFIRMADO NO AUDITOR!]*\n\n` +
      `Cliente: *${tenant.name}*\n` +
      `Valor: *${amountStr}*\n` +
      `Status: Liberado por mais 30 dias automaticamente!\n` +
      `ID Asaas: ${paymentDetails.id || 'N/A'}`;

    await notificationDispatcher.sendDirectMessage(this.adminPhone, adminMsg, 'ADMIN_PAYMENT_CONFIRMED');

    return tenant.subscription;
  }

  /**
   * Bloqueio manual direto
   */
  async blockTenant(tenantId, reason = 'manual') {
    const tenant = storage.getTenant(tenantId);
    if (!tenant) throw new Error('Cliente/Tenant não encontrado');

    tenant.subscription = {
      ...(tenant.subscription || {}),
      status: SUBSCRIPTION_STATUS.BLOCKED,
      blockedAt: Date.now()
    };
    storage.saveTenant(tenant);
    return tenant.subscription;
  }

  /**
   * Processador de Webhook do Asaas (Liquidação e Desbloqueio Automático)
   */
  async handleAsaasWebhook(body) {
    const event = body.event || body.type;
    const payment = body.payment || body.data || {};
    
    // Eventos de sucesso de pagamento
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_AUTHORIZED') {
      const externalReference = payment.externalReference || '';
      const customerEmail = payment.customerEmail || '';
      const customerPhone = payment.customerPhone || '';

      // Tenta encontrar o tenant
      let targetTenant = null;

      if (externalReference) {
        targetTenant = storage.getTenant(externalReference);
      }

      if (!targetTenant) {
        // Tenta encontrar por telefone
        const cleanPhone = String(customerPhone).replace(/\D/g, '');
        const allTenants = storage.getAllTenants();
        targetTenant = allTenants.find(t => {
          const tPhone = String(t.whatsappDestination || '').replace(/\D/g, '');
          return cleanPhone && (tPhone.includes(cleanPhone) || cleanPhone.includes(tPhone));
        });
      }

      if (!targetTenant) {
        // Fallback: DropHub ou primeiro tenant disponível se não achar
        targetTenant = storage.getTenant('drophub') || storage.getAllTenants()[0];
      }

      if (targetTenant) {
        await this.activatePaid(targetTenant.id, 30, payment);
        return {
          success: true,
          action: 'subscription_activated',
          tenantId: targetTenant.id,
          tenantName: targetTenant.name,
          event
        };
      }
    }

    return {
      success: true,
      action: 'ignored_or_unmatched',
      event
    };
  }

  /**
   * Obter sumário de licença com dias restantes calculados em tempo real
   */
  getLicenseSummary(tenant) {
    if (!tenant || !tenant.subscription) return null;
    const now = Date.now();
    const sub = tenant.subscription;
    const msRemaining = sub.expiresAt - now;
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60)));
    const isBlocked = sub.status === SUBSCRIPTION_STATUS.BLOCKED || msRemaining <= 0;

    return {
      status: isBlocked ? SUBSCRIPTION_STATUS.BLOCKED : sub.status,
      planType: sub.planType,
      durationDays: sub.durationDays,
      daysRemaining,
      hoursRemaining,
      isBlocked,
      expiresAt: sub.expiresAt,
      expiresAtFormatted: new Date(sub.expiresAt).toLocaleDateString('pt-BR'),
      activatedAtFormatted: new Date(sub.activatedAt).toLocaleDateString('pt-BR'),
      monthlyFee: sub.monthlyFee || 97.00,
      paymentLink: sub.paymentLink || this.defaultAsaasLink
    };
  }
}

module.exports = new LicenseManager();
