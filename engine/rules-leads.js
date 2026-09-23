/**
 * Auditor Silencioso - Regras de Auditoria para SERVIÇOS & LEADS (14 Alertas)
 * Suporte flexível para Clínicas, Advocacia, Imobiliárias, B2B, Educação, Consultorias e Tecnologia.
 */

const { ALERT_SEVERITIES, createAlertRecord } = require('./models');

class LeadsRulesEngine {

  /**
   * Executa a bateria de auditoria de Leads / Serviços para o Tenant
   */
  evaluate(tenant, dataStore) {
    const alerts = [];
    const tenantId = tenant.id;
    const settings = tenant.leadsSettings || {};
    const baseline = dataStore.getBaseline(tenantId) || {};

    const leads = dataStore.getLeads(tenantId) || [];
    const traffic = dataStore.getTraffic(tenantId) || [];

    // 1. QUEDA ANORMAL DE LEADS
    const alert1 = this.checkLeadsVolumeDrop(tenant, leads, settings, baseline);
    if (alert1) alerts.push(alert1);

    // 2. TRÁFEGO SEM GERAÇÃO DE LEADS
    const alert2 = this.checkTrafficWithoutLeads(tenant, traffic, leads);
    if (alert2) alerts.push(alert2);

    // 3. CUSTO POR LEAD (CPL) ANORMAL
    const alert3 = this.checkAbnormalCpl(tenant, traffic, leads, settings, baseline);
    if (alert3) alerts.push(alert3);

    // 4. INVESTIMENTO SEM LEADS
    const alert4 = this.checkCampaignSpendingZeroLeads(tenant, traffic, leads);
    if (alert4) alerts.push(alert4);

    // 5. LEAD SEM ATENDIMENTO
    const alert5 = this.checkLeadWithoutContact(tenant, leads, settings);
    if (alert5) alerts.push(alert5);

    // 6. TEMPO DE PRIMEIRA RESPOSTA ELEVADO
    const alert6 = this.checkHighFirstResponseTime(tenant, leads, settings);
    if (alert6) alerts.push(alert6);

    // 7. LEADS PARADOS NO FUNIL
    const alert7 = this.checkLeadsStuckInStage(tenant, leads, settings);
    if (alert7) alerts.push(alert7);

    // 8. QUEDA NA TAXA DE QUALIFICAÇÃO
    const alert8 = this.checkQualificationRateDrop(tenant, leads, settings, baseline);
    if (alert8) alerts.push(alert8);

    // 9. QUEDA NA TAXA DE AGENDAMENTO
    const alert9 = this.checkScheduleRateDrop(tenant, leads, settings, baseline);
    if (alert9) alerts.push(alert9);

    // 10. QUEDA NO COMPARECIMENTO (NO-SHOW)
    const alert10 = this.checkShowRateDrop(tenant, leads, settings, baseline);
    if (alert10) alerts.push(alert10);

    // 11. LEADS AUMENTANDO, MAS VENDAS/CONTRATAÇÕES NÃO
    const alert11 = this.checkLeadsUpSalesDown(tenant, leads);
    if (alert11) alerts.push(alert11);

    // 12. CAMPANHA GERANDO LEADS, MAS POUCOS QUALIFICADOS
    const alert12 = this.checkLowQualityCampaign(tenant, leads);
    if (alert12) alerts.push(alert12);

    // 13. QUEDA DE CONVERSÃO ENTRE ETAPAS (GENÉRICO)
    const alert13 = this.checkGenericStageConversionDrop(tenant, leads);
    if (alert13) alerts.push(alert13);

    // 14. CAMPANHA COM GASTO ALTO E BAIXO RETORNO
    const alert14 = this.checkHighSpendLowRoiCampaign(tenant, traffic, leads);
    if (alert14) alerts.push(alert14);

    return alerts;
  }

  // --- REGRA 1: QUEDA ANORMAL DE LEADS ---
  checkLeadsVolumeDrop(tenant, leads, settings, baseline) {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000; // Últimas 24h
    const recentLeads = leads.filter(l => (now - l.createdAt <= windowMs));

    const normalDaily = baseline.historicalDailyLeads || 16;
    const currentCount = recentLeads.length;

    // Se estiver com pelo menos 50% de queda em relação à média diária normal
    if (normalDaily >= 6 && currentCount <= Math.floor(normalDaily * 0.50)) {
      const dropPercent = Math.round(((normalDaily - currentCount) / normalDaily) * 100);
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'QUEDA_LEADS',
        title: 'Queda Anormal na Geração de Leads',
        severity: ALERT_SEVERITIES.CRITICAL,
        currentValue: currentCount,
        expectedValue: normalDaily,
        metricUnit: 'leads/dia',
        anomalyDetails: {
          leadsHoje: currentCount,
          mediaNormal: normalDaily,
          quedaPercentual: dropPercent
        },
        entityType: 'funnel',
        entityId: 'leads_volume',
        entityName: 'Volume Geral de Leads',
        recommendedAction: 'Verifique se os anúncios no Meta/Google foram pausados, se o saldo da conta acabou ou se a Landing Page está fora do ar.',
        whatsappMessage:
          `🚨 *[AUDITOR SILENCIOSO] ALERTA CRÍTICO: QUEDA DE LEADS!*\n\n` +
          `Queda acentuada na entrada de leads na empresa *${tenant.name}*:\n\n` +
          `📉 *Hoje:* ${currentCount} leads (Média Normal: ~${normalDaily} leads/dia)\n` +
          `📊 *Variação:* -${dropPercent}%\n\n` +
          `👉 *Ação Recomendada:* Verifique se suas campanhas de anúncios estão ativas e se a página de captura está funcionando!`
      });
    }
    return null;
  }

  // --- REGRA 2: TRÁFEGO SEM GERAÇÃO DE LEADS ---
  checkTrafficWithoutLeads(tenant, traffic, leads) {
    const now = Date.now();
    const windowMs = 12 * 60 * 60 * 1000;
    const recentTraffic = traffic.filter(t => (now - t.timestamp <= windowMs));
    const recentLeads = leads.filter(l => (now - l.createdAt <= windowMs));

    const totalClicks = recentTraffic.reduce((acc, t) => acc + (t.clicks || 0), 0);
    const totalSpend = recentTraffic.reduce((acc, t) => acc + (t.spend || 0), 0);

    // Se houve tráfego relevante (>= 80 cliques ou >= R$ 100) e ZERO leads
    if ((totalClicks >= 80 || totalSpend >= 90) && recentLeads.length === 0) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'TRAFEGO_SEM_LEADS',
        title: 'Tráfego Ativo sem Geração de Leads',
        severity: ALERT_SEVERITIES.CRITICAL,
        currentValue: 0,
        expectedValue: Math.max(3, Math.floor(totalClicks * 0.05)),
        metricUnit: 'leads',
        anomalyDetails: {
          cliques: totalClicks,
          investimento: totalSpend,
          leadsGerados: 0
        },
        entityType: 'traffic',
        entityId: 'traffic_pipeline',
        entityName: 'Tráfego Pago & Landing Page',
        recommendedAction: 'Teste o envio de formulário ou botão de WhatsApp da página de destino imediatamente.',
        whatsappMessage:
          `🛑 *[AUDITOR SILENCIOSO] TRÁFEGO DETECTADO SEM GERAÇÃO DE LEADS!*\n\n` +
          `Suas campanhas estão consumindo verba na empresa *${tenant.name}*, mas nenhum lead entrou:\n\n` +
          `👥 *Cliques:* ${totalClicks} visitas\n` +
          `💸 *Investimento:* R$ ${totalSpend.toFixed(2)}\n` +
          `🎯 *Leads Capturados:* 0\n\n` +
          `👉 *Ação Recomendada:* Teste o formulário ou botão de WhatsApp da página agora mesmo! O formulário pode estar travado!`
      });
    }
    return null;
  }

  // --- REGRA 3: CUSTO POR LEAD (CPL) ANORMAL ---
  checkAbnormalCpl(tenant, traffic, leads, settings, baseline) {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const recentTraffic = traffic.filter(t => (now - t.timestamp <= windowMs));
    const recentLeads = leads.filter(l => (now - l.createdAt <= windowMs));

    const totalSpend = recentTraffic.reduce((acc, t) => acc + (t.spend || 0), 0);
    const leadsCount = recentLeads.length;

    // Proteção de volume mínimo para cálculo estatístico
    if (totalSpend >= 80 && leadsCount >= 2) {
      const currentCpl = totalSpend / leadsCount;
      const normalCpl = baseline.historicalCpl || 20.00;
      const maxAllowedCpl = settings.maxCpl || (normalCpl * 1.6);

      if (currentCpl >= maxAllowedCpl) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'CPL_ANORMAL',
          title: 'Custo por Lead (CPL) Acima do Padrão',
          severity: currentCpl >= (normalCpl * 2.2) ? ALERT_SEVERITIES.CRITICAL : ALERT_SEVERITIES.WARNING,
          currentValue: Number(currentCpl.toFixed(2)),
          expectedValue: Number(normalCpl.toFixed(2)),
          metricUnit: 'R$',
          anomalyDetails: {
            gastoTotal: totalSpend,
            leadsRecebidos: leadsCount,
            cplAtual: currentCpl,
            cplNormal: normalCpl,
            limiteAlerta: maxAllowedCpl
          },
          entityType: 'campaign',
          entityId: 'general_cpl',
          entityName: 'CPL Geral das Campanhas',
          recommendedAction: 'Pause anúncios com CTR baixo ou revise o público-alvo para evitar queima acelerada de verba.',
          whatsappMessage:
            `⚠️ *[AUDITOR SILENCIOSO] CUSTO POR LEAD (CPL) ELEVADO!*\n\n` +
            `O custo por lead está fora do padrão na empresa *${tenant.name}*:\n\n` +
            `💰 *CPL Atual:* R$ ${currentCpl.toFixed(2)} por lead\n` +
            `🎯 *CPL Normal:* R$ ${normalCpl.toFixed(2)} (Meta Limite: R$ ${maxAllowedCpl.toFixed(2)})\n` +
            `💸 *Gasto:* R$ ${totalSpend.toFixed(2)} para ${leadsCount} leads\n\n` +
            `👉 *Ação Recomendada:* Verifique seus criativos no Meta/Google e a taxa de conversão da página de captura!`
        });
      }
    }
    return null;
  }

  // --- REGRA 4: INVESTIMENTO SEM LEADS (POR CAMPANHA) ---
  checkCampaignSpendingZeroLeads(tenant, traffic, leads) {
    const now = Date.now();
    const windowMs = 18 * 60 * 60 * 1000;

    // Agrupa gastos por campanha
    const campaignMap = new Map();
    for (const t of traffic.filter(tr => now - tr.timestamp <= windowMs)) {
      const cId = t.campaignId || 'camp-default';
      const cName = t.campaignName || cId;
      const current = campaignMap.get(cId) || { id: cId, name: cName, spend: 0, clicks: 0 };
      current.spend += (t.spend || 0);
      current.clicks += (t.clicks || 0);
      campaignMap.set(cId, current);
    }

    for (const [cId, camp] of campaignMap.entries()) {
      if (camp.spend >= 100) {
        // Quantos leads essa campanha gerou?
        const campLeads = leads.filter(l => l.campaignId === cId && (now - l.createdAt <= windowMs));
        if (campLeads.length === 0) {
          return createAlertRecord({
            tenantId: tenant.id,
            tenantName: tenant.name,
            operationMode: tenant.operationMode,
            alertKey: 'CAMPANHA_SEM_LEADS',
            title: `Campanha Consumindo Orçamento sem Leads: ${camp.name}`,
            severity: ALERT_SEVERITIES.CRITICAL,
            currentValue: Number(camp.spend.toFixed(2)),
            expectedValue: 0,
            metricUnit: 'R$',
            anomalyDetails: {
              campaignId: cId,
              campaignName: camp.name,
              gastoSemLeads: camp.spend,
              cliques: camp.clicks
            },
            entityType: 'campaign',
            entityId: cId,
            entityName: camp.name,
            recommendedAction: `Pause a campanha "${camp.name}" temporariamente para estancar o gasto sem resultado.`,
            whatsappMessage:
              `🚨 *[AUDITOR SILENCIOSO] CAMPANHA GASTANDO SEM GERAR LEADS!*\n\n` +
              `A campanha *${camp.name}* já consumiu verba relevante sem nenhum resultado:\n\n` +
              `💸 *Gasto Acumulado:* R$ ${camp.spend.toFixed(2)}\n` +
              `👥 *Cliques:* ${camp.clicks}\n` +
              `❌ *Leads Gerados:* 0 leads\n\n` +
              `👉 *Ação Recomendada:* Pause ou ajuste o link da campanha "${camp.name}" agora mesmo!`
          });
        }
      }
    }
    return null;
  }

  // --- REGRA 5: LEAD SEM ATENDIMENTO (TEMPO MÁXIMO DE ESPERA) ---
  checkLeadWithoutContact(tenant, leads, settings) {
    const now = Date.now();
    const maxWaitMinutes = settings.maxFirstResponseMinutes || 15; // Ex: 15 minutos

    // Leads que ainda não receberam primeiro contato humano
    const uncontacted = leads.filter(l => 
      l.currentStage === 'lead' && 
      !l.firstContactAt && 
      l.status === 'active'
    );

    for (const lead of uncontacted) {
      const waitMinutes = Math.floor((now - lead.createdAt) / (60 * 1000));
      if (waitMinutes >= maxWaitMinutes && waitMinutes <= 180) { // Não alertar leads velhos esquecidos de dias atrás
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'LEAD_SEM_ATENDIMENTO',
          title: `Lead Aguardando Atendimento há ${waitMinutes} minutos`,
          severity: waitMinutes >= (maxWaitMinutes * 2) ? ALERT_SEVERITIES.CRITICAL : ALERT_SEVERITIES.WARNING,
          currentValue: waitMinutes,
          expectedValue: maxWaitMinutes,
          metricUnit: 'min',
          anomalyDetails: {
            leadId: lead.id,
            leadName: lead.name,
            leadPhone: lead.phone,
            campanha: lead.campaignName,
            tempoEsperaMin: waitMinutes,
            metaEsperaMin: maxWaitMinutes
          },
          entityType: 'lead',
          entityId: lead.id,
          entityName: lead.name,
          recommendedAction: `Chame o lead ${lead.name} (${lead.phone}) no WhatsApp agora. Cada minuto de atraso reduz em 50% a chance de conversão.`,
          whatsappMessage:
            `⏱️ *[AUDITOR SILENCIOSO] LEAD AGUARDANDO ATENDIMENTO!*\n\n` +
            `O lead *${lead.name}* está aguardando contato na empresa *${tenant.name}*:\n\n` +
            `⏳ *Tempo de Espera:* ${waitMinutes} minutos (Meta: até ${maxWaitMinutes} min)\n` +
            `📱 *WhatsApp do Lead:* ${lead.phone || 'Não informado'}\n` +
            `📢 *Origem:* ${lead.campaignName || 'Anúncio'}\n\n` +
            `👉 *Ação Recomendada:* Chame o cliente no WhatsApp imediatamente para não perder a oportunidade quente!`
        });
      }
    }
    return null;
  }

  // --- REGRA 6: TEMPO DE PRIMEIRA RESPOSTA ELEVADO (MÉDIA GERAL) ---
  checkHighFirstResponseTime(tenant, leads, settings) {
    const now = Date.now();
    const windowMs = 24 * 60 * 60 * 1000;
    const maxTargetMinutes = settings.maxFirstResponseMinutes || 15;

    // Leads que tiveram primeiro atendimento nas últimas 24h
    const contactedLeads = leads.filter(l => 
      l.firstContactAt && (now - l.firstContactAt <= windowMs)
    );

    if (contactedLeads.length >= 4) {
      let totalMinutes = 0;
      for (const l of contactedLeads) {
        totalMinutes += Math.max(1, Math.floor((l.firstContactAt - l.createdAt) / (60 * 1000)));
      }
      const avgMinutes = Math.round(totalMinutes / contactedLeads.length);

      if (avgMinutes >= maxTargetMinutes * 1.8) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'TEMPO_RESPOSTA_ELEVADO',
          title: 'Tempo Médio de Primeira Resposta Acima da Meta',
          severity: ALERT_SEVERITIES.WARNING,
          currentValue: avgMinutes,
          expectedValue: maxTargetMinutes,
          metricUnit: 'min',
          anomalyDetails: {
            tempoMedioMin: avgMinutes,
            metaMin: maxTargetMinutes,
            leadsAvaliados: contactedLeads.length
          },
          entityType: 'funnel',
          entityId: 'response_time',
          entityName: 'Equipe de Atendimento / SDR',
          recommendedAction: 'Alinhe a equipe de atendimento ou utilize mensagens automáticas de recepção no WhatsApp.',
          whatsappMessage:
            `⏳ *[AUDITOR SILENCIOSO] TEMPO DE PRIMEIRA RESPOSTA ELEVADO*\n\n` +
            `A equipe de atendimento da *${tenant.name}* está demorando para responder os novos contatos:\n\n` +
            `⏱️ *Tempo Médio Atual:* ${avgMinutes} minutos\n` +
            `🎯 *Meta Estabelecida:* ${maxTargetMinutes} minutos\n` +
            `👥 *Amostra:* ${contactedLeads.length} leads atendidos hoje\n\n` +
            `👉 *Ação Recomendada:* Reforce o monitoramento da caixa de entrada do WhatsApp comercial para acelerar o primeiro contato!`
        });
      }
    }
    return null;
  }

  // --- REGRA 7: LEADS PARADOS NO FUNIL ---
  checkLeadsStuckInStage(tenant, leads, settings) {
    const now = Date.now();
    const maxStagnantHours = settings.maxStageStagnationHours || 24;
    const maxStagnantMs = maxStagnantHours * 60 * 60 * 1000;

    // Agrupa leads estagnados por etapa
    const stageStuckMap = new Map();
    const activeLeads = leads.filter(l => l.status === 'active' && l.currentStage !== 'won' && l.currentStage !== 'lost');

    for (const lead of activeLeads) {
      const timeInStage = now - (lead.stageUpdatedAt || lead.createdAt);
      if (timeInStage >= maxStagnantMs) {
        const stage = lead.currentStage;
        const list = stageStuckMap.get(stage) || [];
        list.push(lead);
        stageStuckMap.set(stage, list);
      }
    }

    for (const [stage, stuckList] of stageStuckMap.entries()) {
      if (stuckList.length >= 3) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'LEADS_PARADOS_FUNIL',
          title: `${stuckList.length} Leads Estagnados na Etapa: ${stage}`,
          severity: ALERT_SEVERITIES.WARNING,
          currentValue: stuckList.length,
          expectedValue: 0,
          metricUnit: 'leads',
          anomalyDetails: {
            etapa: stage,
            quantidadeParados: stuckList.length,
            horasEstagnados: maxStagnantHours
          },
          entityType: 'funnel_stage',
          entityId: stage,
          entityName: `Etapa: ${stage}`,
          recommendedAction: `Realize uma rodada de follow-up com os ${stuckList.length} leads parados na etapa "${stage}".`,
          whatsappMessage:
            `⚠️ *[AUDITOR SILENCIOSO] LEADS PARADOS NO FUNIL*\n\n` +
            `Existem *${stuckList.length} leads estagnados* na etapa *"${stage}"* há mais de ${maxStagnantHours}h na empresa *${tenant.name}*.\n\n` +
            `📋 *Etapa:* ${stage}\n` +
            `👥 *Leads Afetados:* ${stuckList.slice(0, 3).map(l => l.name).join(', ')}${stuckList.length > 3 ? ' e outros' : ''}\n\n` +
            `👉 *Ação Recomendada:* Faça um disparo de follow-up para reengajar esses clientes antes que esfriem totalmente!`
        });
      }
    }
    return null;
  }

  // --- REGRA 8: QUEDA NA TAXA DE QUALIFICAÇÃO ---
  checkQualificationRateDrop(tenant, leads, settings, baseline) {
    const now = Date.now();
    const windowMs = 3 * 24 * 60 * 60 * 1000; // Últimos 3 dias
    const recentLeads = leads.filter(l => (now - l.createdAt <= windowMs));

    if (recentLeads.length < (settings.minLeadVolumeForAlert || 8)) return null;

    const qualifiedCount = recentLeads.filter(l => l.qualifiedAt || l.currentStage === 'qualified' || l.currentStage === 'scheduled' || l.currentStage === 'won').length;
    const currentRate = (qualifiedCount / recentLeads.length) * 100;
    const normalRate = baseline.historicalQualificationRate || 42.0;

    // Se taxa de qualificação cair pelo menos 40% em relação ao normal (ex: de 42% para 21%)
    if (currentRate <= normalRate * 0.60) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'QUEDA_QUALIFICACAO',
        title: 'Queda Expressiva na Qualificação de Leads',
        severity: ALERT_SEVERITIES.WARNING,
        currentValue: Number(currentRate.toFixed(1)),
        expectedValue: Number(normalRate.toFixed(1)),
        metricUnit: '%',
        anomalyDetails: {
          taxaAtual: currentRate,
          taxaNormal: normalRate,
          leadsAvaliados: recentLeads.length,
          qualificados: qualifiedCount
        },
        entityType: 'funnel',
        entityId: 'qualification_rate',
        entityName: 'Qualificação de Leads',
        recommendedAction: 'Revise o público e a mensagem dos anúncios. Pode haver desalinhamento de perfil atraindo curiosos.',
        whatsappMessage:
          `📉 *[AUDITOR SILENCIOSO] QUEDA NA QUALIFICAÇÃO DE LEADS*\n\n` +
          `A qualidade dos contatos recebidos caiu na empresa *${tenant.name}*:\n\n` +
          `🎯 *Taxa de Qualificação Atual:* ${currentRate.toFixed(1)}% (Padrão Normal: ~${normalRate.toFixed(1)}%)\n` +
          `👥 *Amostra:* ${qualifiedCount} qualificados de ${recentLeads.length} leads totais\n\n` +
          `👉 *Ação Recomendada:* Revise os anúncios no Meta/Google. Campanhas muito amplas costumam trazer contatos desqualificados!`
      });
    }
    return null;
  }

  // --- REGRA 9: QUEDA NA TAXA DE AGENDAMENTO ---
  checkScheduleRateDrop(tenant, leads, settings, baseline) {
    const now = Date.now();
    const windowMs = 5 * 24 * 60 * 1000;
    const recentLeads = leads.filter(l => (now - l.createdAt <= windowMs));

    if (recentLeads.length < 8) return null;

    const scheduledCount = recentLeads.filter(l => l.scheduledAt || l.currentStage === 'scheduled' || l.currentStage === 'attended' || l.currentStage === 'won').length;
    const scheduleRate = (scheduledCount / recentLeads.length) * 100;
    const normalRate = baseline.historicalScheduleRate || 40.0;

    if (scheduleRate <= normalRate * 0.55) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'QUEDA_AGENDAMENTO',
        title: 'Queda na Taxa de Agendamentos',
        severity: ALERT_SEVERITIES.WARNING,
        currentValue: Number(scheduleRate.toFixed(1)),
        expectedValue: Number(normalRate.toFixed(1)),
        metricUnit: '%',
        anomalyDetails: {
          taxaAgendamento: scheduleRate,
          taxaNormal: normalRate,
          totalAgendados: scheduledCount
        },
        entityType: 'funnel',
        entityId: 'schedule_rate',
        entityName: 'Conversão para Agendamento',
        recommendedAction: 'Analise os scripts de atendimento no WhatsApp para identificar objeções ou demora na resposta.',
        whatsappMessage:
          `📅 *[AUDITOR SILENCIOSO] QUEDA NA TAXA DE AGENDAMENTOS*\n\n` +
          `A conversão de contatos em agendamentos caiu na empresa *${tenant.name}*:\n\n` +
          `📊 *Taxa Atual:* ${scheduleRate.toFixed(1)}% (Padrão Normal: ~${normalRate.toFixed(1)}%)\n` +
          `🗓️ *Agendamentos:* ${scheduledCount} de ${recentLeads.length} contatos\n\n` +
          `👉 *Ação Recomendada:* Verifique se a equipe comercial está oferecendo horários claros e fazendo o fechamento do agendamento!`
      });
    }
    return null;
  }

  // --- REGRA 10: QUEDA NO COMPARECIMENTO (AUMENTO DE NO-SHOW) ---
  checkShowRateDrop(tenant, leads, settings, baseline) {
    const scheduledLeads = leads.filter(l => l.scheduledAt || l.currentStage === 'scheduled' || l.currentStage === 'attended' || l.currentStage === 'won');

    if (scheduledLeads.length < 6) return null;

    const attendedCount = scheduledLeads.filter(l => l.attendedAt || l.currentStage === 'attended' || l.currentStage === 'won').length;
    const showRate = (attendedCount / scheduledLeads.length) * 100;
    const normalShowRate = baseline.historicalShowRate || 80.0;

    if (showRate <= normalShowRate - 25 || showRate < 50) {
      return createAlertRecord({
        tenantId: tenant.id,
        tenantName: tenant.name,
        operationMode: tenant.operationMode,
        alertKey: 'QUEDA_COMPARECIMENTO',
        title: 'Aumento Excessivo de Faltas (No-Show)',
        severity: ALERT_SEVERITIES.WARNING,
        currentValue: Number(showRate.toFixed(1)),
        expectedValue: Number(normalShowRate.toFixed(1)),
        metricUnit: '%',
        anomalyDetails: {
          comparecimentos: attendedCount,
          agendamentosTotais: scheduledLeads.length,
          taxaComparecimento: showRate,
          taxaNormal: normalShowRate
        },
        entityType: 'funnel',
        entityId: 'show_rate',
        entityName: 'Comparecimento / No-Show',
        recommendedAction: 'Implemente lembretes automáticos de confirmação no WhatsApp 24h e 2h antes do compromisso.',
        whatsappMessage:
          `🚪 *[AUDITOR SILENCIOSO] AUMENTO DE NO-SHOW (FALTAS)*\n\n` +
          `Muitos clientes estão agendando e não comparecendo na empresa *${tenant.name}*:\n\n` +
          `📉 *Taxa de Comparecimento:* ${showRate.toFixed(1)}% (Padrão Normal: ~${normalShowRate.toFixed(1)}%)\n` +
          `⚠️ *Faltas:* ${scheduledLeads.length - attendedCount} de ${scheduledLeads.length} agendamentos não compareceram\n\n` +
          `👉 *Ação Recomendada:* Ative lembretes automáticos no WhatsApp no dia anterior e 2 horas antes da reunião/consulta!`
      });
    }
    return null;
  }

  // --- REGRA 11: LEADS AUMENTANDO, MAS VENDAS NÃO ---
  checkLeadsUpSalesDown(tenant, leads) {
    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const recentLeads = leads.filter(l => (now - l.createdAt <= windowMs));

    // Se volume de leads é expressivo (ex: >= 20 leads) mas fechamentos são 0 ou 1
    if (recentLeads.length >= 20) {
      const wonDeals = recentLeads.filter(l => l.currentStage === 'won' || l.wonAt);
      if (wonDeals.length <= 1) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'LEADS_SOBEM_VENDAS_CAEM',
          title: 'Leads em Alta, mas sem Fechamento de Vendas',
          severity: ALERT_SEVERITIES.CRITICAL,
          currentValue: wonDeals.length,
          expectedValue: Math.max(3, Math.floor(recentLeads.length * 0.15)),
          metricUnit: 'vendas',
          anomalyDetails: {
            leadsRecebidos: recentLeads.length,
            vendasFechadas: wonDeals.length
          },
          entityType: 'funnel',
          entityId: 'funnel_efficiency',
          entityName: 'Eficiência de Vendas do Funil',
          recommendedAction: 'Audite as gravações de atendimento ou propostas enviadas para identificar o gargalo de conversão.',
          whatsappMessage:
            `⚠️ *[AUDITOR SILENCIOSO] LEADS AUMENTANDO, MAS VENDAS PARADAS!*\n\n` +
            `A empresa *${tenant.name}* gerou bom volume de contatos, mas as vendas não fecharam:\n\n` +
            `🎯 *Leads no Período:* ${recentLeads.length} contatos\n` +
            `🤝 *Vendas Concluídas:* apenas ${wonDeals.length}\n\n` +
            `👉 *Ação Recomendada:* Pode haver gargalo na negociação comercial ou proposta de valor desalinhada!`
        });
      }
    }
    return null;
  }

  // --- REGRA 12: CAMPANHA GERANDO LEADS DE BAIXA QUALIDADE ---
  checkLowQualityCampaign(tenant, leads) {
    // Agrupa leads por campanha
    const campaignMap = new Map();
    for (const lead of leads) {
      const cId = lead.campaignId || 'camp-default';
      const cName = lead.campaignName || cId;
      const cur = campaignMap.get(cId) || { id: cId, name: cName, total: 0, qualified: 0 };
      cur.total++;
      if (lead.qualifiedAt || lead.currentStage === 'qualified' || lead.currentStage === 'scheduled' || lead.currentStage === 'won') {
        cur.qualified++;
      }
      campaignMap.set(cId, cur);
    }

    for (const [cId, camp] of campaignMap.entries()) {
      // Se a campanha gerou mais de 10 leads, mas menos de 15% foram qualificados
      if (camp.total >= 10) {
        const qRate = (camp.qualified / camp.total) * 100;
        if (qRate < 15) {
          return createAlertRecord({
            tenantId: tenant.id,
            tenantName: tenant.name,
            operationMode: tenant.operationMode,
            alertKey: 'CAMPANHA_LEADS_BAIXA_QUALIDADE',
            title: `Campanha Gerando Volume de Baixa Qualidade: ${camp.name}`,
            severity: ALERT_SEVERITIES.WARNING,
            currentValue: Number(qRate.toFixed(1)),
            expectedValue: 35.0,
            metricUnit: '%',
            anomalyDetails: {
              campaignId: cId,
              campaignName: camp.name,
              totalLeads: camp.total,
              qualificados: camp.qualified,
              taxaQualificacao: qRate
            },
            entityType: 'campaign',
            entityId: cId,
            entityName: camp.name,
            recommendedAction: `Negativar públicos desqualificados na campanha "${camp.name}" ou adicionar campos de filtro no formulário.`,
            whatsappMessage:
              `🔍 *[AUDITOR SILENCIOSO] CAMPANHA COM LEADS DESQUALIFICADOS*\n\n` +
              `A campanha *"${camp.name}"* está gerando volume, mas poucos contatos reais:\n\n` +
              `📊 *Taxa de Qualificação:* apenas ${qRate.toFixed(1)}%\n` +
              `👥 *Leads:* ${camp.qualified} qualificados de ${camp.total} gerados\n\n` +
              `👉 *Ação Recomendada:* Adicione filtros de qualificação na página de captura ou ajuste o direcionamento do anúncio!`
          });
        }
      }
    }
    return null;
  }

  // --- REGRA 13: QUEDA DE CONVERSÃO ENTRE ETAPAS DO FUNIL ---
  checkGenericStageConversionDrop(tenant, leads) {
    if (leads.length < 15) return null;

    const contacted = leads.filter(l => l.firstContactAt || l.currentStage !== 'lead').length;
    const qualified = leads.filter(l => l.qualifiedAt || l.currentStage === 'qualified' || l.currentStage === 'scheduled' || l.currentStage === 'won').length;

    // Transição Contatado -> Qualificado
    if (contacted >= 10) {
      const convRate = (qualified / contacted) * 100;
      if (convRate < 20) {
        return createAlertRecord({
          tenantId: tenant.id,
          tenantName: tenant.name,
          operationMode: tenant.operationMode,
          alertKey: 'QUEDA_CONVERSAO_ETAPAS',
          title: 'Gargalo Crítico de Conversão: Contatado ➔ Qualificado',
          severity: ALERT_SEVERITIES.WARNING,
          currentValue: Number(convRate.toFixed(1)),
          expectedValue: 45.0,
          metricUnit: '%',
          anomalyDetails: {
            etapaOrigem: 'contacted',
            etapaDestino: 'qualified',
            taxaConversao: convRate
          },
          entityType: 'funnel_step',
          entityId: 'contact_to_qual',
          entityName: 'Funil: Contato para Qualificação',
          recommendedAction: 'Analise por que os leads atendidos não estão avançando para a qualificação.',
          whatsappMessage:
            `📉 *[AUDITOR SILENCIOSO] GARGALO NO MEIO DO FUNIL*\n\n` +
            `Detectada perda severa de clientes entre *Contato Inicial* e *Qualificação* na empresa *${tenant.name}*:\n\n` +
            `📊 *Conversão da Etapa:* apenas ${convRate.toFixed(1)}% (Esperado: > 40%)\n` +
            `👥 *Avançaram:* ${qualified} de ${contacted} contatados\n\n` +
            `👉 *Ação Recomendada:* Verifique o pitch de abertura e critérios de qualificação com a equipe de vendas!`
        });
      }
    }
    return null;
  }

  // --- REGRA 14: CAMPANHA COM GASTO ALTO E BAIXO RETORNO ---
  checkHighSpendLowRoiCampaign(tenant, traffic, leads) {
    const campaignSpendMap = new Map();
    for (const t of traffic) {
      const cId = t.campaignId || 'camp-default';
      const cName = t.campaignName || cId;
      const cur = campaignSpendMap.get(cId) || { id: cId, name: cName, spend: 0 };
      cur.spend += (t.spend || 0);
      campaignSpendMap.set(cId, cur);
    }

    for (const [cId, camp] of campaignSpendMap.entries()) {
      if (camp.spend >= 350) {
        // Vendas fechadas originadas desta campanha
        const campWins = leads.filter(l => l.campaignId === cId && (l.currentStage === 'won' || l.wonAt));
        const totalRevenue = campWins.reduce((acc, l) => acc + (l.dealValue || 0), 0);

        if (totalRevenue < (camp.spend * 0.5)) {
          return createAlertRecord({
            tenantId: tenant.id,
            tenantName: tenant.name,
            operationMode: tenant.operationMode,
            alertKey: 'CAMPANHA_ALTO_GASTO_BAIXO_RETORNO',
            title: `Campanha Deficitária: ${camp.name}`,
            severity: ALERT_SEVERITIES.CRITICAL,
            currentValue: Number(totalRevenue.toFixed(2)),
            expectedValue: Number((camp.spend * 2.5).toFixed(2)),
            metricUnit: 'R$',
            anomalyDetails: {
              campaignId: cId,
              campaignName: camp.name,
              investimento: camp.spend,
              retornoGerado: totalRevenue,
              prejuizo: camp.spend - totalRevenue
            },
            entityType: 'campaign',
            entityId: cId,
            entityName: camp.name,
            recommendedAction: `Reduza o orçamento ou pause a campanha "${camp.name}" para estancar o prejuízo operacional.`,
            whatsappMessage:
              `💸 *[AUDITOR SILENCIOSO] CAMPANHA COM ALTO GASTO E BAIXO RETORNO!*\n\n` +
              `A campanha *"${camp.name}"* está consumindo verba com resultado deficitário na empresa *${tenant.name}*:\n\n` +
              `📉 *Investimento Total:* R$ ${camp.spend.toFixed(2)}\n` +
              `💰 *Retorno em Vendas:* R$ ${totalRevenue.toFixed(2)}\n` +
              `🛑 *Resultado:* Prejuízo de -R$ ${(camp.spend - totalRevenue).toFixed(2)}\n\n` +
              `👉 *Ação Recomendada:* Realoque o orçamento desta campanha para os públicos que trazem faturamento real!`
          });
        }
      }
    }
    return null;
  }
}

module.exports = new LeadsRulesEngine();
