module.exports = {
    apps: [
        {
            name: "alerta-cx-carga-api",
            script: "./src/server.js",
            instances: 1,
            exec_mode: "fork",
            autorestart: true,
            max_memory_restart: "300M",
            env: { NODE_ENV: "development" },
            env_production: { NODE_ENV: "production" },
        },
    ],
};
