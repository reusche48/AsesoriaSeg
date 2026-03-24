const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '107.180.115.202',
    user: 'usuadmin',
    password: 'Aa@33590728',
    database: 'asesoria_seguros',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
});

module.exports = pool;
