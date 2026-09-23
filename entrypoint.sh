#!/bin/sh
set -e

echo "========================================================"
echo "🛡️  DropHub / Auditor Silencioso & Calculadora (Easypanel)"
echo "========================================================"

# Inicia o motor do Auditor Silencioso (APIs REST + Webhooks) em segundo plano
echo "🚀 Iniciando motor Node.js na porta interna 3333..."
cd /app
node engine/server.js &

# Inicia o Nginx Web Server em primeiro plano na porta 80
echo "🌐 Iniciando Nginx Web Server na porta 80..."
exec nginx -g "daemon off;"
