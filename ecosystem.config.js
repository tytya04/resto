module.exports = {
  apps: [{
    name: 'restaurant-bot',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    
    // Process management
    max_memory_restart: '512M',
    restart_delay: 4000,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Graceful reload
    kill_timeout: 10000,
    listen_timeout: 5000,
    shutdown_with_message: true,
    
    // Health monitoring
    cron_restart: '0 0 * * *', // Restart daily at midnight
    
    // Error handling
    error_file: './logs/pm2-error.log',
    combine_logs: true,
    
    // Environment variables from file
    env_file: '.env.production'
  }],

  deploy: {
    production: {
      user: 'deploy',
      host: 'YOUR_SERVER_IP',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/restaurant-bot.git',
      path: '/home/deploy/restaurant-bot',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run migrate && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};