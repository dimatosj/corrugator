# Static site. TLS termination and the HTTP->HTTPS redirect are Traefik's job
# on the VPS; nginx here only serves files.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
