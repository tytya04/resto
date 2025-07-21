#!/bin/bash

# System monitoring script
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Restaurant Bot System Monitor ===${NC}\n"

# 1. Docker containers status
echo -e "${YELLOW}Docker Containers:${NC}"
docker-compose ps
echo ""

# 2. System resources
echo -e "${YELLOW}System Resources:${NC}"
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print "  Total: " $2 + $4 "%"}'
echo ""

echo "Memory Usage:"
free -h | grep "^Mem:" | awk '{print "  Total: " $2 "\n  Used: " $3 "\n  Free: " $4}'
echo ""

echo "Disk Usage:"
df -h | grep -E "^/dev/" | awk '{print "  " $6 ": " $5 " used (" $3 "/" $2 ")"}'
echo ""

# 3. Bot statistics
echo -e "${YELLOW}Bot Statistics:${NC}"
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "  Health Check: ${GREEN}OK${NC}"
    
    # Get metrics
    METRICS=$(curl -s http://localhost:3000/metrics 2>/dev/null || echo "")
    
    if [ ! -z "$METRICS" ]; then
        # Extract key metrics
        ACTIVE_USERS=$(echo "$METRICS" | grep "bot_active_users" | grep -v "#" | awk '{print $2}' | head -1)
        TOTAL_COMMANDS=$(echo "$METRICS" | grep "bot_commands_total" | grep -v "#" | awk '{print $2}' | head -1)
        
        echo "  Active Users: ${ACTIVE_USERS:-0}"
        echo "  Total Commands: ${TOTAL_COMMANDS:-0}"
    fi
else
    echo -e "  Health Check: ${RED}FAILED${NC}"
fi
echo ""

# 4. Database info
echo -e "${YELLOW}Database:${NC}"
if [ -f "./data/database.sqlite" ]; then
    DB_SIZE=$(du -h ./data/database.sqlite | cut -f1)
    echo "  Size: $DB_SIZE"
    
    # Get table counts
    docker-compose exec -T app sqlite3 /app/data/database.sqlite "SELECT 'Users: ' || COUNT(*) FROM Users;" 2>/dev/null || echo "  Users: N/A"
    docker-compose exec -T app sqlite3 /app/data/database.sqlite "SELECT 'Orders: ' || COUNT(*) FROM Orders;" 2>/dev/null || echo "  Orders: N/A"
    docker-compose exec -T app sqlite3 /app/data/database.sqlite "SELECT 'Restaurants: ' || COUNT(*) FROM Restaurants;" 2>/dev/null || echo "  Restaurants: N/A"
else
    echo "  Database not found"
fi
echo ""

# 5. Logs analysis
echo -e "${YELLOW}Recent Errors (last 24h):${NC}"
ERROR_COUNT=$(find ./logs -name "*.log" -mtime -1 -exec grep -i "error" {} \; 2>/dev/null | wc -l)
echo "  Error count: $ERROR_COUNT"

if [ $ERROR_COUNT -gt 0 ]; then
    echo "  Last 5 errors:"
    find ./logs -name "*.log" -mtime -1 -exec grep -i "error" {} \; 2>/dev/null | tail -5 | sed 's/^/    /'
fi
echo ""

# 6. SSL Certificate status
echo -e "${YELLOW}SSL Certificate:${NC}"
DOMAIN=$(grep "server_name" nginx/sites-enabled/restaurant-bot.conf | head -1 | awk '{print $2}' | tr -d ';')
if [ ! -z "$DOMAIN" ] && [ "$DOMAIN" != "yourdomain.com" ]; then
    CERT_EXPIRY=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ ! -z "$CERT_EXPIRY" ]; then
        echo "  Domain: $DOMAIN"
        echo "  Expires: $CERT_EXPIRY"
        
        # Check if expiring soon
        EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s)
        CURRENT_EPOCH=$(date +%s)
        DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))
        
        if [ $DAYS_LEFT -lt 30 ]; then
            echo -e "  ${RED}WARNING: Certificate expires in $DAYS_LEFT days!${NC}"
        else
            echo -e "  Status: ${GREEN}Valid ($DAYS_LEFT days remaining)${NC}"
        fi
    else
        echo "  Unable to check certificate"
    fi
else
    echo "  SSL not configured yet"
fi
echo ""

# 7. Backup status
echo -e "${YELLOW}Backups:${NC}"
if [ -d "./backups" ]; then
    BACKUP_COUNT=$(ls -1 ./backups/*.gz 2>/dev/null | wc -l)
    echo "  Total backups: $BACKUP_COUNT"
    
    if [ $BACKUP_COUNT -gt 0 ]; then
        LATEST_BACKUP=$(ls -t ./backups/*.gz 2>/dev/null | head -1)
        BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
        BACKUP_DATE=$(stat -c %y "$LATEST_BACKUP" | cut -d' ' -f1)
        echo "  Latest: $(basename $LATEST_BACKUP)"
        echo "  Date: $BACKUP_DATE"
        echo "  Size: $BACKUP_SIZE"
    fi
else
    echo "  No backups found"
fi

echo -e "\n${GREEN}Monitoring complete!${NC}"