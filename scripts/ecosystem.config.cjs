module.exports = {
  apps: [{
    name: 'momentkaph_be',
    script: 'dist/index.js',
    cwd: '/opt/momentkaph_be',
    node_args: '--env-file=/opt/momentkaph_be/.env',
    max_memory_restart: '100M',
    error_file: '/opt/momentkaph_be/logs/pm2-err.log',
    out_file: '/opt/momentkaph_be/logs/pm2-out.log',
  }],
};