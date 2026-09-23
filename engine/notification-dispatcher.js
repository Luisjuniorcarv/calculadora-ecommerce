/**
 * Auditor Silencioso - Disparador de Notificações WhatsApp (Evolution API)
 * Mensagens padronizadas, sem jargões técnicos complexos, diretas para o dono da empresa.
 */

const https = require('https');
const http = require('http');

class NotificationDispatcher {
  constructor() {
    this.sentLog = []; // Buffer em memória para auditoria e testes unitários
    this.evolutionUrl = process.env.EVOLUTION_API_URL || 'https://drophub-evolution-wa.dvzzxm.easypanel.host';
    this.evolutionApiKey = process.env.EVOLUTION_APIKEY || '429683C4C977415CAAFCCE10F7D57E11';
    this.evolutionInstance = process.env.EVOLUTION_INSTANCE || 'auditor';
  }

  /**
   * Formata e despacha o alerta no WhatsApp do cliente
   */
  async sendWhatsappAlert(tenant, alert, context = 'NEW') {
    const phone = tenant.whatsappDestination ? String(tenant.whatsappDestination).replace(/\D/g, '') : null;
    if (!phone) return { error: 'Telefone do WhatsApp não configurado' };

    const formattedNumber = phone.startsWith('55') ? phone : ('55' + phone);
    let messageText = '';

    if (context === 'RESOLVED') {
      messageText = 
        `✅ *AUDITOR SILENCIOSO: PROBLEMA NORMALIZADO*\n\n` +
        `Ótima notícia! A anomalia de *${alert.title}* na empresa *${tenant.name}* foi normalizada.\n\n` +
        `📊 *Métrica Atual:* ${alert.currentValue} ${alert.metricUnit || ''}\n` +
        `🛡️ *Status:* Operação restabelecida com segurança.\n\n` +
        `Seu sentinela 24/7 continuará monitorando em segundo plano! 🚀`;

    } else if (context === 'REMINDER') {
      messageText = 
        `⚠️ *[ATUALIZAÇÃO] AUDITOR SILENCIOSO*\n\n` +
        `O problema *"${alert.title}"* na empresa *${tenant.name}* ainda não foi resolvido e requer atenção:\n\n` +
        `📊 *Valor Registrado:* ${alert.currentValue} ${alert.metricUnit || ''} (Normal esperado: ${alert.expectedValue} ${alert.metricUnit || ''})\n` +
        `⏳ *Tempo Ativo:* Detectado há ${Math.round((Date.now() - alert.firstTriggeredAt) / 60000)} minutos\n\n` +
        `👉 *Ação:* ${alert.recommendedAction || 'Verifique sua operação o quanto antes para estancar possíveis perdas.'}`;

    } else {
      // Alerta Novo (Usa o texto formatado da regra ou monta estrutura padrão)
      messageText = alert.whatsappMessage || (
        `🚨 *AUDITOR SILENCIOSO*\n\n` +
        `*${alert.severity === 'CRITICAL' ? 'ALERTA CRÍTICO' : 'PONTO DE ATENÇÃO'}*\n\n` +
        `*Problema identificado:* ${alert.title}\n` +
        `*Empresa:* ${tenant.name}\n` +
        `*Valor Atual:* ${alert.currentValue} ${alert.metricUnit || ''} (Normal: ${alert.expectedValue} ${alert.metricUnit || ''})\n\n` +
        `👉 *Ação Recomendada:* ${alert.recommendedAction || 'Verifique o painel operacional para detalhes.'}`
      );
    }

    const payload = {
      number: formattedNumber,
      text: messageText
    };

    // Registra no buffer local de auditoria
    const dispatchEntry = {
      timestamp: Date.now(),
      tenantId: tenant.id,
      phone: formattedNumber,
      context,
      alertKey: alert.alertKey,
      messageText
    };
    this.sentLog.unshift(dispatchEntry);
    if (this.sentLog.length > 100) this.sentLog.pop();

    // Envio HTTP real para a Evolution API (não bloqueante)
    try {
      await this.postToEvolutionApi(formattedNumber, messageText);
      dispatchEntry.status = 'SENT';
    } catch (err) {
      dispatchEntry.status = 'MOCKED_OR_FAILED';
      dispatchEntry.error = err.message;
    }

    return dispatchEntry;
  }

  /**
   * Chamada HTTP para a Evolution API v2
   */
  postToEvolutionApi(number, text) {
    return new Promise((resolve, reject) => {
      const url = `${this.evolutionUrl}/message/sendText/${this.evolutionInstance}`;
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const bodyData = JSON.stringify({ number, text });

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey,
          'Content-Length': Buffer.byteLength(bodyData)
        },
        timeout: 5000 // 5s timeout para não travar a aplicação
      };

      const req = client.request(options, (res) => {
        let respData = '';
        res.on('data', chunk => respData += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, statusCode: res.statusCode, body: respData });
          } else {
            resolve({ success: false, statusCode: res.statusCode, body: respData });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout de envio' });
      });

      req.write(bodyData);
      req.end();
    });
  }

  getRecentDispatches(tenantId = null) {
    if (tenantId) {
      return this.sentLog.filter(d => d.tenantId === tenantId);
    }
    return this.sentLog;
  }

  clearLog() {
    this.sentLog = [];
  }
}

module.exports = new NotificationDispatcher();
