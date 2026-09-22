# 🛡️ Guia Oficial: Auditor Silencioso & Repasse Automático no Banco do Brasil

Este guia detalha o passo a passo exato para você colocar o **Auditor Silencioso** no ar, operando com **custo fixo ZERO** e com todos os pagamentos caindo **automaticamente na sua conta do Banco do Brasil**.

---

## ☕ Destaque de Conversão: R$ 3,23 por dia

Nas páginas [`index.html`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/index.html) e [`auditor.html`](file:///c:/Users/plini/.gemini/antigravity-ide/scratch/calculadora-ecommerce/auditor.html), deixamos evidente o preço fracionado:
> **"Por apenas R$ 3,23 por dia (R$ 97,00/mês)"**  
> *"Menos que 1 cafezinho de padaria para proteger dezenas de milhares de reais em vendas contra checkouts travados e recusas de cartão."*

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
     - Descrição: `Auditor Silencioso 24/7 - Sentinela de Checkout`
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

## 🚀 4. Como Funciona a Operação no Dia a Dia

```
1. O Lojista acessa a Calculadora de Lucro ou a página auditor.html
                               │
                               ▼
2. Vê a oferta destacada: "Apenas R$ 3,23 por dia (R$ 97/mês)"
                               │
                               ▼
3. Preenche os dados e assina via Cartão ou PIX
                               │
                               ▼
4. O Asaas confirma o pagamento:
   ├─► Repassa automaticamente para sua conta no Banco do Brasil
   └─► Dispara o Webhook para o n8n
                               │
                               ▼
5. O n8n envia a mensagem no WhatsApp do Lojista:
   "🎉 Bem-vindo! Cole esta URL única no webhook da sua loja: https://..."
                               │
                               ▼
6. Quando a loja do cliente tem um pico de cartão recusado (> 25%) ou checkout fora do ar:
   └─► O Auditor Silencioso apita no WhatsApp do lojista no mesmo minuto!
```

Toda a infraestrutura foi desenvolvida para rodar no piloto automático, sem custos de mensalidade de terceiros e depositando as receitas no seu Banco do Brasil!
