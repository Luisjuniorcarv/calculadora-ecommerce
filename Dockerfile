FROM nginx:alpine

# Instala Node.js para rodar o motor do Auditor Silencioso
RUN apk add --no-cache nodejs

# Copia a configuração otimizada do Nginx com Proxy Reverso
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos da aplicação frontend para o Nginx
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY auditor.html /usr/share/nginx/html/
COPY dashboard.html /usr/share/nginx/html/
COPY dashboard.css /usr/share/nginx/html/
COPY dashboard.js /usr/share/nginx/html/
COPY video.html /usr/share/nginx/html/
COPY story-sentinela.jpg /usr/share/nginx/html/
COPY sitemap.xml /usr/share/nginx/html/
COPY robots.txt /usr/share/nginx/html/
COPY google*.html /usr/share/nginx/html/

# Configura o diretório do motor Node.js
WORKDIR /app
COPY engine/ /app/engine/

# Copia e configura permissões do script de inicialização
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
