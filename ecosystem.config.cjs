module.exports = {
  apps: [
    {
      name: 'vanguard-lounge',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
