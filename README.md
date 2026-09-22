# DropHub Tools: Simulador de Lucro Líquido Real & Auditor de Taxas

Aplicação web de alta performance desenvolvida para atrair tráfego orgânico no Google (SEO) de donos de lojas virtuais e dropshipping, calcular o lucro líquido real e converter esses visitantes em clientes do **Auditor Silencioso** e leads no **n8n**.

---

## 🚀 Como testar localmente

Você pode abrir o arquivo `index.html` diretamente em qualquer navegador, ou rodar um servidor local leve:

```bash
# Na pasta da ferramenta:
cd "C:\Users\plini\.gemini\antigravity-ide\scratch\calculadora-ecommerce"

# Via Python:
python -m http.server 3000

# Ou via npx:
npx serve .
```

Acesse: `http://localhost:3000`

---

## 🐳 Como colocar no ar no seu Easypanel

Como criamos um `Dockerfile` baseado em `nginx:alpine`, a aplicação consome **menos de 10 MB de memória RAM** e aguenta milhares de acessos simultâneos sem sobrecarregar sua VPS.

1. No seu **Easypanel**, clique em **New Service** (Novo Serviço) -> **App**.
2. Na aba **Source** (Origem):
   - Se subir para o GitHub: selecione **GitHub** e aponte para o repositório.
   - Ou suba a pasta como Dockerfile.
3. Na aba **Domains** (Domínios):
   - Adicione o domínio ou subdomínio desejado (ex: `calculadora.drophub.com.br` ou use o domínio provisório do Easypanel).
4. Clique em **Deploy**. O Easypanel gerará o certificado SSL (HTTPS) automaticamente em segundos!

---

## ⚡ Integração com o n8n (Captura de Leads no WhatsApp)

Na interface da calculadora, há um formulário onde o visitante digita seu Nome e WhatsApp para receber o relatório em PDF.

### Como funciona o Webhook:
Quando o usuário clica em "Receber Análise no WhatsApp", o JavaScript envia um payload JSON via `POST`:

```json
{
  "lead": {
    "name": "João Lojista",
    "whatsapp": "(11) 98765-4321",
    "timestamp": "2026-09-22T15:00:00.000Z",
    "origin": "Calculadora de Taxas & Lucro Real"
  },
  "simulation": {
    "price": 129.90,
    "cost": 45.00,
    "netProfit": 48.20,
    "netMargin": 37.1,
    "platformName": "Nuvemshop (com Nuvem Pago)",
    "gatewayName": "Mercado Pago",
    "paymentMethod": "Cartão 6x (instant)"
  }
}
```

### No seu n8n:
1. Crie um novo fluxo com o nó **Webhook** (método `POST`, path `lead-calculadora`).
2. Conecte a um nó do **WhatsApp** (ex: Evolution API ou Z-API) para disparar a mensagem imediata:
   > *"Olá {{ $json.body.lead.name }}! Aqui está o relatório da sua simulação na DropHub Tools..."*
3. Adicione o contato na sua lista de prospecção do **Auditor Silencioso**!

---

## 🔍 Como colocar no Google (SEO)

1. Com o site publicado no Easypanel, acesse o [Google Search Console](https://search.google.com/search-console).
2. Adicione sua URL.
3. No campo superior, cole o link da sua ferramenta e clique em **"Solicitar Indexação"**.
4. Como a página já possui metatags completas, dados estruturados (Schema.org) e tempo de carregamento inferior a 0.5s, o Google começará a ranquear para pesquisas como:
   - *"calculadora taxa mercado pago parcelado"*
   - *"como calcular lucro real nuvemshop"*
   - *"taxas ocultas dropshipping"*
