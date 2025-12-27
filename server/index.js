const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Inicializar aplicação
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configurações
const PORT = process.env.PORT || 3020;

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Banco de dados
const db = new sqlite3.Database('./chat.db', (err) => {
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

// Objeto para armazenar usuários online
const onlineUsers = new Map();

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Rota para obter histórico geral de mensagens
app.get('/api/messages/general', (req, res) => {
    const query = 'SELECT * FROM messages WHERE is_private = 0 ORDER BY timestamp DESC LIMIT 50';
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar histórico geral:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para obter histórico privado de um usuário
app.get('/api/messages/private/:userId', (req, res) => {
    const { userId } = req.params;
    const query = 'SELECT * FROM messages WHERE (sender_id = ? OR receiver_id = ?) AND is_private = 1 ORDER BY timestamp DESC LIMIT 50';
    
    db.all(query, [userId, userId], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar histórico privado:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Rota para obter usuários online
app.get('/api/online-users', (req, res) => {
    const users = Array.from(onlineUsers.values());
    res.json(users);
});

// Socket.IO events
io.on('connection', (socket) => {
    console.log(`Novo usuário conectado: ${socket.id}`);
    
    // Evento: Usuário entra no chat
    socket.on('user-join', (userData) => {
        const user = {
            id: socket.id,
            username: userData.username,
            avatarColor: userData.avatarColor,
            joinedAt: new Date().toISOString()
        };
        
        onlineUsers.set(socket.id, user);
        
        // Notificar todos os usuários sobre o novo usuário
        socket.broadcast.emit('user-joined', user);
        
        // Enviar lista de usuários online para o novo usuário
        socket.emit('online-users', Array.from(onlineUsers.values()));
        
        console.log(`${user.username} entrou na sala. Usuários online: ${onlineUsers.size}`);
    });
    
    // Evento: Mensagem geral (para todos)
    socket.on('send-message', (messageData) => {
        const user = onlineUsers.get(socket.id);
        if (!user) return;
        
        const message = {
            id: Date.now(),
            sender: user.username,
            senderId: socket.id,
            content: messageData.content,
            timestamp: new Date().toISOString(),
            avatarColor: user.avatarColor,
            isPrivate: false
        };
        
        // Salvar no banco de dados
        db.run(
            'INSERT INTO messages (id, sender, sender_id, content, timestamp, is_private) VALUES (?, ?, ?, ?, ?, ?)',
            [message.id, message.sender, message.senderId, message.content, message.timestamp, 0],
            (err) => {
                if (err) console.error('Erro ao salvar mensagem:', err);
            }
        );
        
        // Enviar para todos os usuários
        io.emit('receive-message', message);
        console.log(`Mensagem geral de ${user.username}: ${message.content}`);
    });
    
    // Evento: Mensagem privada
    socket.on('send-private-message', (data) => {
        const sender = onlineUsers.get(socket.id);
        if (!sender) return;
        
        // Verificar se o destinatário existe e está online
        const recipientExists = onlineUsers.has(data.receiverId);
        if (!recipientExists) {
            console.log(`Destinatário ${data.receiverId} não encontrado ou offline`);
            socket.emit('error-message', { 
                type: 'recipient-offline',
                message: 'O destinatário não está mais online' 
            });
            return;
        }
        
        const message = {
            id: Date.now(),
            sender: sender.username,
            senderId: socket.id,
            receiverId: data.receiverId,
            content: data.content,
            timestamp: new Date().toISOString(),
            avatarColor: sender.avatarColor,
            isPrivate: true
        };
        
        // Salvar no banco de dados
        db.run(
            'INSERT INTO messages (id, sender, sender_id, receiver_id, content, timestamp, is_private) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [message.id, message.sender, message.senderId, message.receiverId, message.content, message.timestamp, 1],
            (err) => {
                if (err) console.error('Erro ao salvar mensagem privada:', err);
            }
        );
        
        // Enviar apenas para o remetente e destinatário
        socket.emit('receive-private-message', message);
        io.to(data.receiverId).emit('receive-private-message', message);
        
        console.log(`Mensagem privada de ${sender.username} para ${data.receiverId}: ${data.content}`);
    });
    
    // Evento: Usuário está digitando
    socket.on('typing', (isTyping) => {
        const user = onlineUsers.get(socket.id);
        if (!user) return;
        
        socket.broadcast.emit('user-typing', {
            userId: socket.id,
            username: user.username,
            isTyping: isTyping
        });
    });
    
    // Evento: Usuário desconecta
    socket.on('disconnect', () => {
        const user = onlineUsers.get(socket.id);
        if (user) {
            onlineUsers.delete(socket.id);
            io.emit('user-left', { userId: socket.id, username: user.username });
            console.log(`${user.username} desconectou. Usuários online: ${onlineUsers.size}`);
        }
    });
});

// Tratamento de erros para rotas não encontradas
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratamento de erros global
app.use((err, req, res, next) => {
    console.error('Erro do servidor:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`📊 Banco de dados: chat.db`);
});