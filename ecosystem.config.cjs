module.exports = {
  apps: [
    {
      name: "quant-console",
      script: "dist/index.js",
      cwd: "/opt/quant-console",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
        PORT: "3000",
        DATABASE_URL: "postgresql://quantuser:QuantPass2024!@localhost:5432/quantdb",
      },
      error_file: "/var/log/pm2/quant-console-error.log",
      out_file: "/var/log/pm2/quant-console-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
