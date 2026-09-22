FROM nginx:alpine

# Copia a configuração otimizada do Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia os arquivos da aplicação
COPY index.html /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY google*.html /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
