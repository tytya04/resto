#!/bin/bash

# Restaurant Bot Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${DOMAIN:-"yourdomain.com"}
EMAIL=${EMAIL:-"admin@yourdomain.com"}
DEPLOY_PATH="/opt/restaurant-bot"
BACKUP_PATH="/opt/backups"

echo -e "${GREEN}Starting Restaurant Bot deployment...${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   exit 1
fi

# 1. System update and dependencies
echo -e "${YELLOW}Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# 2. Install required packages
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get install -y \
    curl \
    git \
    nginx \
    certbot \
    python3-certbot-nginx \
    docker.io \
    docker-compose \
    htop \
    ufw \
    fail2ban

# 3. Configure firewall
echo -e "${YELLOW}Configuring firewall...${NC}"
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp  # Health check port
ufw allow 9090/tcp  # Prometheus
ufw allow 3001/tcp  # Grafana
echo "y" | ufw enable

# 4. Setup fail2ban
echo -e "${YELLOW}Configuring fail2ban...${NC}"
cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
systemctl enable fail2ban
systemctl start fail2ban

# 5. Create deployment directory
echo -e "${YELLOW}Creating deployment directories...${NC}"
mkdir -p $DEPLOY_PATH
mkdir -p $BACKUP_PATH
mkdir -p $DEPLOY_PATH/{data,logs,documents,backups,temp}
mkdir -p $DEPLOY_PATH/nginx/{ssl,logs}
mkdir -p $DEPLOY_PATH/certbot/{conf,www}
mkdir -p $DEPLOY_PATH/prometheus
mkdir -p $DEPLOY_PATH/grafana/provisioning/{dashboards,datasources}

# 6. Clone or update repository
echo -e "${YELLOW}Cloning repository...${NC}"
if [ -d "$DEPLOY_PATH/.git" ]; then
    cd $DEPLOY_PATH
    git pull origin main
else
    git clone https://github.com/yourusername/restaurant-bot.git $DEPLOY_PATH
    cd $DEPLOY_PATH
fi

# 7. Copy configuration files
echo -e "${YELLOW}Setting up configuration...${NC}"
if [ ! -f "$DEPLOY_PATH/.env.production" ]; then
    cp .env.production.example .env.production
    echo -e "${RED}Please edit .env.production with your actual values!${NC}"
    read -p "Press enter to continue after editing..."
fi

# 8. Update nginx configuration with actual domain
echo -e "${YELLOW}Updating nginx configuration...${NC}"
sed -i "s/yourdomain.com/$DOMAIN/g" nginx/sites-enabled/restaurant-bot.conf

# 9. Setup SSL certificate
echo -e "${YELLOW}Setting up SSL certificate...${NC}"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m $EMAIL
fi

# 10. Create htpasswd for Grafana
echo -e "${YELLOW}Setting up basic auth for Grafana...${NC}"
if [ ! -f "$DEPLOY_PATH/nginx/.htpasswd" ]; then
    read -p "Enter username for Grafana access: " GRAFANA_USER
    htpasswd -c $DEPLOY_PATH/nginx/.htpasswd $GRAFANA_USER
fi

# 11. Setup Prometheus configuration
echo -e "${YELLOW}Configuring Prometheus...${NC}"
cat > $DEPLOY_PATH/prometheus/prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'restaurant-bot'
    static_configs:
      - targets: ['app:3000']
    metrics_path: '/metrics'
EOF

# 12. Setup Grafana datasource
echo -e "${YELLOW}Configuring Grafana...${NC}"
cat > $DEPLOY_PATH/grafana/provisioning/datasources/prometheus.yml << EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
EOF

# 13. Build and start containers
echo -e "${YELLOW}Building and starting containers...${NC}"
cd $DEPLOY_PATH
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 14. Wait for services to start
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# 15. Check health status
echo -e "${YELLOW}Checking health status...${NC}"
curl -f http://localhost:3000/health || echo -e "${RED}Health check failed!${NC}"

# 16. Setup cron jobs
echo -e "${YELLOW}Setting up cron jobs...${NC}"
cat > /etc/cron.d/restaurant-bot << EOF
# Database backup every day at 2 AM
0 2 * * * root cd $DEPLOY_PATH && docker-compose exec -T app node scripts/backup.js

# Log rotation
0 0 * * 0 root find $DEPLOY_PATH/logs -name "*.log" -mtime +14 -delete

# Certificate renewal
0 0,12 * * * root certbot renew --quiet && docker-compose restart nginx
EOF

# 17. Setup log rotation
echo -e "${YELLOW}Configuring log rotation...${NC}"
cat > /etc/logrotate.d/restaurant-bot << EOF
$DEPLOY_PATH/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
}
EOF

# 18. Create update script
echo -e "${YELLOW}Creating update script...${NC}"
cat > $DEPLOY_PATH/scripts/update.sh << 'EOFUPDATE'
#!/bin/bash
cd $(dirname $0)/..
git pull origin main
docker-compose build --no-cache app
docker-compose up -d app
docker-compose exec app npm run migrate
echo "Update completed!"
EOFUPDATE
chmod +x $DEPLOY_PATH/scripts/update.sh

# 19. Create backup script
echo -e "${YELLOW}Creating backup script...${NC}"
cat > $DEPLOY_PATH/scripts/backup.sh << 'EOFBACKUP'
#!/bin/bash
BACKUP_DIR="/opt/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cd $(dirname $0)/..

# Backup database
docker-compose exec -T app sqlite3 /app/data/database.sqlite ".backup /app/backups/db_backup_$TIMESTAMP.sqlite"

# Backup configuration
tar -czf $BACKUP_DIR/config_backup_$TIMESTAMP.tar.gz .env.production

# Backup logs
tar -czf $BACKUP_DIR/logs_backup_$TIMESTAMP.tar.gz logs/

# Remove old backups (keep last 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "*.sqlite" -mtime +7 -delete

echo "Backup completed: $TIMESTAMP"
EOFBACKUP
chmod +x $DEPLOY_PATH/scripts/backup.sh

# 20. Final status
echo -e "${GREEN}Deployment completed!${NC}"
echo -e "${YELLOW}Important next steps:${NC}"
echo "1. Edit .env.production with your actual values"
echo "2. Set up Telegram webhook: curl -F 'url=https://$DOMAIN/webhook' https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook"
echo "3. Access Grafana at https://$DOMAIN/grafana/"
echo "4. Monitor logs: docker-compose logs -f app"
echo "5. Create first admin: docker-compose exec app node test_admin.js YOUR_TELEGRAM_ID"

# Display service status
echo -e "\n${YELLOW}Service Status:${NC}"
docker-compose ps