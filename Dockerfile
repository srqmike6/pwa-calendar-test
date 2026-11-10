FROM nginx:alpine

# Copy your three local assets into the web server's public folder
COPY index.html /usr/share/nginx/html/index.html
COPY manifest.json /usr/share/nginx/html/manifest.json
COPY sw.js /usr/share/nginx/html/sw.js

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
