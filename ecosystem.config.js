// PM2 Ecosystem File — Production deployment config
// Usage:
//   Install PM2:       npm install -g pm2
//   Start app:         pm2 start ecosystem.config.js
//   Auto-restart:      pm2 startup && pm2 save
//   Monitor:           pm2 monit
//   Stop:              pm2 stop supportdesk-api
//   Restart:           pm2 restart supportdesk-api

module.exports = {
    apps: [
        {
            name: 'supportdesk-api',
            script: 'server.js',
            instances: 'max',           // Use all CPU cores (cluster mode)
            exec_mode: 'cluster',
            watch: false,               // Don't watch in production
            max_memory_restart: '300M', // Restart if memory exceeds 300MB

            // Environment variables for production
            env_production: {
                NODE_ENV: 'production',
                PORT: 5000,
            },

            // Auto-restart settings
            autorestart: true,
            restart_delay: 3000,
            max_restarts: 10,

            // Logging
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            merge_logs: true,
        }
    ]
};
