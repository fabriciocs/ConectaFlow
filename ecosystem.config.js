module.exports = {
  apps: [
    {
      name: "wa-evomenu",
      cwd: "/opt/WA-AKG",
      script: "/home/evomenu/.nvm/versions/node/v22.23.3/bin/node",
      args: "node_modules/tsx/dist/cli.mjs src/server/index.ts",
      interpreter: "none",
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      env_production: {
        NODE_ENV: "production"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
