#!/bin/bash

# SSL and Security Setup Script
set -e

# Configuration
DOMAIN=${1:-"yourdomain.com"}
EMAIL=${2:-"admin@yourdomain.com"}

echo "Setting up SSL for domain: $DOMAIN"

# 1. Initial SSL certificate (standalone mode for first setup)
echo "Obtaining SSL certificate..."
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --force-renewal \
    -d $DOMAIN \
    -d www.$DOMAIN

# 2. Generate strong DH parameters
echo "Generating DH parameters (this may take a while)..."
if [ ! -f "./nginx/ssl/dhparam.pem" ]; then
    openssl dhparam -out ./nginx/ssl/dhparam.pem 4096
fi

# 3. Create SSL configuration for nginx
cat > ./nginx/ssl/ssl-params.conf << EOF
# SSL Configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;

# SSL optimization
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;

# OCSP stapling
ssl_stapling on;
ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval'" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# DH parameters
ssl_dhparam /etc/nginx/ssl/dhparam.pem;

# Resolver
resolver 8.8.8.8 8.8.4.4 valid=300s;
resolver_timeout 5s;
EOF

# 4. Create certificate renewal script
cat > ./scripts/renew-ssl.sh << 'EOF'
#!/bin/bash
docker-compose run --rm certbot renew --quiet
docker-compose exec nginx nginx -s reload
EOF
chmod +x ./scripts/renew-ssl.sh

# 5. Add renewal to crontab
echo "0 0,12 * * * cd $(pwd) && ./scripts/renew-ssl.sh" | crontab -

# 6. Restart nginx with new configuration
docker-compose restart nginx

echo "SSL setup completed!"
echo "Test your SSL configuration at: https://www.ssllabs.com/ssltest/analyze.html?d=$DOMAIN"