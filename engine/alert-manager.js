/**
 * Auditor Silencioso - Gerenciador Inteligente de Alertas (Alert Manager)
 * Controla:
 * - Cooldown e Anti-spam
 * - Deduplicação por chave única (Regra + Entidade)
 * - Rastreamento de Alertas Ativos (OPEN, TRACKING, RESOLVED)
 * - Resolução Automática quando a métrica normalizar
 * - Disparo de Notificações via WhatsApp (Evolution API)
 */

const { OPERATION_MODES, ALERT_STATUS, ALERT_SEVERITIES } = require('./models');
const storage = require('./storage');
const ecommerceRules = require('./rules-ecommerce');
const leadsRules = require('./rules-leads');
const notificationDispatcher = require('./notification-dispatcher');

class AlertManager {

  /**
   * Avalia as regras de auditoria para um Tenant específico
   */
  async runAudit(tenantId) {
    const tenant = storage.getTenant(tenantId);
    if (!tenant) return { error: 'Tenant não encontrado' };

    let generatedAlerts = [];

    // Roteamento inteligente baseado no modo de operação do cliente
    if (tenant.operationMode === OPERATION_MODES.ECOMMERCE) {
      generatedAlerts = ecommerceRules.evaluate(tenant, storage);
    } else if (tenant.operationMode === OPERATION_MODES.LEADS) {
      generatedAlerts = leadsRules.evaluate(tenant, storage);
    }

    const results = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      mode: tenant.operationMode,
      evaluatedRulesCount: generatedAlerts.length,
      dispatched: [],
      inCooldown: [],
      resolved: []
    };

    const activeMap = storage.getActiveAlertsMap(tenant.id);
    const now = Date.now();

    // 1. Processar Alertas Gerados (Detecção / Atualização)
    for (const newAlert of generatedAlerts) {
      // Filtrar por nível de severidade permitido pelo usuário
      if (tenant.allowedSeverities && !tenant.allowedSeverities.includes(newAlert.severity)) {
        continue;
      }

      const dedupKey = `${newAlert.alertKey}_${newAlert.entityId || 'general'}`;
      const activeAlert = activeMap.get(dedupKey);

      if (!activeAlert || activeAlert.status === ALERT_STATUS.RESOLVED) {
        // --- NOVO ALERTA (PRIMEIRO DISPARO) ---
        newAlert.status = ALERT_STATUS.OPEN;
        newAlert.firstTriggeredAt = now;
        newAlert.lastTriggeredAt = now;
        newAlert.cooldownUntil = now + (30 * 60 * 1000); // 30 min cooldown padrão

        storage.recordAlert(newAlert);

        // Dispara mensagem no WhatsApp se configurado
        if (tenant.notifyWhatsapp && tenant.whatsappDestination) {
          await notificationDispatcher.sendWhatsappAlert(tenant, newAlert, 'NEW');
        }

        results.dispatched.push(newAlert);

      } else {
        // --- ALERTA JÁ ATIVO ---
        if (now >= activeAlert.cooldownUntil) {
          // Cooldown expirou e o problema continua -> Disparar atualização
          activeAlert.status = ALERT_STATUS.TRACKING;
          activeAlert.lastTriggeredAt = now;
          activeAlert.currentValue = newAlert.currentValue;
          activeAlert.cooldownUntil = now + (45 * 60 * 1000); // Espaça mais a próxima notificação

          storage.recordAlert(activeAlert);

          if (tenant.notifyWhatsapp && tenant.whatsappDestination) {
            await notificationDispatcher.sendWhatsappAlert(tenant, activeAlert, 'REMINDER');
          }

          results.dispatched.push(activeAlert);
        } else {
          // Em cooldown: Silencia para não lotar o WhatsApp do dono da empresa
          activeAlert.currentValue = newAlert.currentValue;
          results.inCooldown.push({
            alertKey: activeAlert.alertKey,
            cooldownLeftMin: Math.ceil((activeAlert.cooldownUntil - now) / 60000)
          });
        }
      }
    }

    // 2. Auto-Resolução: Verificar alertas ativos cujas anomalias desapareceram
    const generatedKeys = new Set(generatedAlerts.map(a => `${a.alertKey}_${a.entityId || 'general'}`));
    
    for (const [key, activeAlert] of activeMap.entries()) {
      if (!generatedKeys.has(key) && activeAlert.status !== ALERT_STATUS.RESOLVED) {
        // O problema foi sanado!
        const resolved = storage.resolveAlert(tenant.id, activeAlert.alertKey, activeAlert.entityId, 'Problema normalizado automaticamente pelo sistema');
        
        if (resolved) {
          results.resolved.push(resolved);
          if (tenant.notifyWhatsapp && tenant.whatsappDestination) {
            await notificationDispatcher.sendWhatsappAlert(tenant, resolved, 'RESOLVED');
          }
        }
      }
    }

    return results;
  }

  /**
   * Resumo de Saúde da Operação (para Dashboard e Widgets)
   */
  getOperationHealth(tenantId) {
    const tenant = storage.getTenant(tenantId);
    if (!tenant) return { status: 'UNKNOWN', score: 0, label: 'Operação Não Encontrada' };

    const active = storage.getActiveAlerts(tenantId);
    const criticals = active.filter(a => a.severity === ALERT_SEVERITIES.CRITICAL);
    const warnings = active.filter(a => a.severity === ALERT_SEVERITIES.WARNING);

    if (criticals.length > 0) {
      return {
        level: 'CRITICAL',
        color: 'red',
        badge: '🔴',
        label: `${criticals.length} ${criticals.length === 1 ? 'problema crítico' : 'problemas críticos'}`,
        description: 'Há anomalias ativas causando perda imediata de faturamento ou queima de orçamento.',
        criticalCount: criticals.length,
        warningCount: warnings.length,
        totalActive: active.length
      };
    }

    if (warnings.length > 0) {
      return {
        level: 'WARNING',
        color: 'yellow',
        badge: '🟡',
        label: `${warnings.length} ${warnings.length === 1 ? 'ponto de atenção' : 'pontos de atenção'}`,
        description: 'Desvios operacionais detectados que requerem acompanhamento.',
        criticalCount: 0,
        warningCount: warnings.length,
        totalActive: active.length
      };
    }

    return {
      level: 'HEALTHY',
      color: 'green',
      badge: '🟢',
      label: 'Operação Normal',
      description: 'Todos os indicadores de checkout, tráfego e atendimento estão saudáveis.',
      criticalCount: 0,
      warningCount: 0,
      totalActive: 0
    };
  }
}

module.exports = new AlertManager();
