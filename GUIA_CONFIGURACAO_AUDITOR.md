# 🛡️ Guia Oficial: Auditor Silencioso & Repasse Automático no Banco do Brasil

Este guia detalha o passo a passo exato para você colocar o **Auditor Silencioso** no ar, operando com **custo fixo ZERO** e com todos os pagamentos caindo **automaticamente na sua conta do Banco do Brasil**.

---

## ☕ Destaque de Conversão: R$ 3,23 por dia

Nas páginas [`index.html`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/index.html), [`auditor.html`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/auditor.html) e no novo [`dashboard.html`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/dashboard.html), deixamos evidente o preço fracionado:
> **"Por apenas R$ 3,23 por dia (R$ 97,00/mês)"**  
> *"Menos que 1 cafezinho de padaria para proteger dezenas de milhares de reais em vendas ou geração de leads contra falhas e gargalos operacionais."*

---

## 🏦 1. Como Configurar o Recebimento Direto no Banco do Brasil (via Asaas)

Usamos o **Asaas** porque ele **não cobra mensalidade nem taxa de adesão**, aceita **Cartão de Crédito recorrente** e **PIX**, e possui **transferência automática diária** para qualquer banco.

### Passo a Passo no Asaas:
1. **Crie sua conta gratuita:** Acesse [asaas.com](https://www.asaas.com/) e cadastre-se (PF ou PJ).
2. **Cadastre sua conta do Banco do Brasil:**
   - No menu lateral esquerdo, vá em **Transferências** (ou *Minha Conta > Dados Bancários*).
   - Clique em **Adicionar Conta Bancária**.
   - Selecione:
     - **Banco:** `001 - Banco do Brasil S.A.`
     - **Agência:** O número da sua agência BB (sem dígito).
     - **Conta Corrente:** O número da sua conta BB com o dígito verificador.
     - **Chave PIX do BB:** Cadastre sua chave PIX vinculada à sua conta do Banco do Brasil.
3. **Ative a Transferência Automática Diária:**
   - Na aba de transferências, clique em **Configurações de Transferência**.
   - Habilite a opção **"Transferência Automática Diária"** (ou configure para transferir todo saldo disponível diariamente para o seu Banco do Brasil).
   - *Pronto! A partir de agora, toda vez que um cliente pagar os R$ 97,00 no cartão ou PIX, o Asaas liquida e transfere o dinheiro para o seu Banco do Brasil sem você precisar solicitar manualmente.*
4. **Criar a Cobrança / Assinatura de R$ 97,00:**
   - Em **Cobranças > Criar Assinatura**:
     - Valor: `R$ 97,00`
     - Periodicidade: `Mensal`
     - Formas de pagamento: `Cartão de Crédito e PIX`
     - Descrição: `Auditor Silencioso 24/7 - Sentinela de Checkout e Leads`
5. **Conectar o Webhook no n8n:**
   - Vá em **Integrações > Webhooks**.
   - Em **URL do Webhook**, cole:
     `https://n8n.seuservidor.com/webhook/asaas-auditor`
   - Em eventos, marque: `Pagamento Recebido (PAYMENT_RECEIVED)`.

---

## 📲 2. WhatsApp 100% Gratuito: Como Subir a Evolution API no Easypanel

A **Evolution API v2** é open-source e não cobra nenhuma mensalidade:

1. No seu painel **Easypanel**, clique em **Templates** (ou *New Service > App*).
2. Procure por **Evolution API** ou use o template oficial Docker:
   - **Imagem Docker:** `atendai/evolution-api:v2.1.2`
   - **Porta:** `8080`
   - **Variáveis de Ambiente Básicas:**
     ```env
     AUTHENTICATION_API_KEY=sua_chave_secreta_super_forte_123
     SERVER_URL=https://evolution.seuservidor.com
     DATABASE_ENABLED=false
     ```
3. Clique em **Deploy**. O Easypanel gerará o HTTPS automaticamente.
4. **Conectar o WhatsApp:**
   - Acesse o painel web da Evolution API gerado (ou via endpoint `/instance/create`).
   - Crie a instância chamada `auditor`.
   - Aponte a câmera do seu celular no WhatsApp (*Aparelhos Conectados*) e leia o QR Code.
   - Seu robô do Auditor Silencioso estará conectado e pronto para enviar mensagens ilimitadas com custo zero!

---

## ⚙️ 3. Como Importar o Workflow no seu n8n

O arquivo com o fluxo completo e testado está pronto em:
[`auditor_silencioso_workflow.json`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/auditor_silencioso_workflow.json)

### Passos de Importação:
1. Abra seu painel do **n8n**.
2. Clique no botão **Add Workflow** (Novo Fluxo).
3. No menu de três pontinhos (canto superior direito), clique em **Import from File...** e selecione o arquivo `auditor_silencioso_workflow.json`.
4. Configure as Variáveis de Ambiente do n8n (em *Settings > Variables* ou edite os nós):
   - `EVOLUTION_API_URL`: A URL da sua Evolution API (ex: `https://evolution.seuservidor.com`).
   - `EVOLUTION_APIKEY`: A chave que você definiu na Evolution.
   - `EVOLUTION_INSTANCE`: `auditor`.
5. Clique em **Save** e ative o botão **Active (Ligado)** no canto superior direito.

---

## 🚀 4. Como Funciona a Operação nos Dois Modos

O **Auditor Silencioso SaaS** atende tanto lojas virtuais (E-commerce) quanto empresas de serviços que geram leads com tráfego pago:

```
                      AUDITOR SILENCIOSO SAAS
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
[MODO 1: E-COMMERCE]                            [MODO 2: LEADS / SERVIÇOS]
Tráfego → Loja → Carrinho → Checkout            Tráfego → Visita → Lead → Contato →
→ Pagamento → Venda → Estoque                   Qualificação → Agendamento → Venda

8 Alertas Específicos:                          14 Alertas Específicos:
• 1. Pico de Recusa de Cartão                   • 1. Queda Anormal de Leads
• 2. Checkout Travado / Queda Súbita            • 2. Tráfego sem Geração de Leads
• 3. Margem Negativa / Preço Errado             • 3. CPL Anormal (Acima da Meta)
• 4. Abandono de Carrinho Anormal               • 4. Investimento sem Leads (Campanha)
• 5. Falha Concentrada (PIX/Gateway)            • 5. Lead sem Atendimento (> 15 min)
• 6. Estoque Crítico por Velocidade             • 6. Tempo de Resposta Elevado
• 7. Pico de Cancelamentos/Reembolsos           • 7. Leads Parados no Funil (> 24h)
• 8. Tráfego sem Crescimento de Vendas          • 8. Queda na Taxa de Qualificação
                                                • 9. Queda na Taxa de Agendamento
                                                • 10. Queda no Comparecimento (No-Show)
                                                • 11. Leads Sobem, mas Vendas Não
                                                • 12. Campanha com Volume Desqualificado
                                                • 13. Queda de Conversão entre Etapas
                                                • 14. Campanha com Alto Gasto e Baixo ROI
```

---

## 💻 5. Dashboard SaaS & Motor Local

Além do n8n, a plataforma possui um **Motor Node.js autônomo** e um **Dashboard Web completo**:

- **Acessar o Painel SaaS:** Abra o arquivo [`dashboard.html`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/dashboard.html) diretamente no seu navegador ou via servidor local.
- **Iniciar o Servidor de Webhooks & API:**
  ```powershell
  cd C:\Users\plini\.gemini\antigravity-ide\scratch\calculadora-ecommerce
  node engine/server.js
  ```
  O servidor iniciará em `http://localhost:3333` com suporte a:
  - `POST /webhook/auditor-checkout`: Webhook de pedidos para lojas Shopify, Nuvemshop, Yampi e Appmax.
  - `POST /api/webhooks/leads`: Webhook de leads para CRM (RD Station, HubSpot), Meta Ads e formulários de site.
  - `POST /api/webhooks/traffic`: Webhook de métricas de tráfego pago (Meta Ads e Google Ads).
  - `GET /api/dashboard/:tenantId`: Consolidação de métricas, saúde da operação e feed de alertas.

- **Executar os Testes Automatizados (27 Testes):**
  ```powershell
  node tests/run-all-tests.js
  ```
