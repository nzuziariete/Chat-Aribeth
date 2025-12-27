const sqlite3 = require('sqlite3').verbose();
const path = require('path');

function initializeDatabase() {
    const dbPath = path.join(__dirname, 'chat.db');
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Erro ao conectar ao banco de dados:', err);
        } else {
            console.log('Conectado ao banco de dados SQLite');
        }
    });

    // Criar tabelas
    db.serialize(() => {
        // Tabela de mensagens
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            sender TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            receiver_id TEXT,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_private INTEGER DEFAULT 0
        )`);

        // Tabela de usuários (se necessário para funcionalidades futuras)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        
        console.log('Tabelas criadas ou já existentes');
    });

    return db;
}

module.exports = { initializeDatabase };