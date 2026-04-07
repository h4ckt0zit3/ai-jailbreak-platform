module.exports = {
  apps: [
    {
      name: 'jailbreak-challenge',
      script: './server/index.js',
      instances: 1,          // Single instance — SQLite is in-memory, can't be shared across processes
      exec_mode: 'fork',     // Fork mode (not cluster) to avoid DB data inconsistency
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '500M',
      error_file: './logs/error.log',
      out_file: './logs/output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      watch: false,
      kill_timeout: 5000,        // Give 5s for graceful shutdown (flush DB)
      listen_timeout: 10000,     // Wait 10s for app to be ready
      autorestart: true,         // Auto-restart on crash
      max_restarts: 10,          // Max 10 restarts in a window
      restart_delay: 2000,       // Wait 2s between restarts
    },
  ],
};
