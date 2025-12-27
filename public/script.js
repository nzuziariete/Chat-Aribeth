// Configurações iniciais
let socket;
let currentUser = {
    id: null,
    username: null,
    avatarColor: '#0082FB'
};
let isPrivateMode = false;
let selectedRecipientId = null;
let typingTimeout = null;

// Elementos DOM
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const joinChatBtn = document.getElementById('joinChatBtn');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const messagesContainer = document.getElementById('messages');
const userListContainer = document.getElementById('userList');
const recipientSelect = document.getElementById('recipientSelect');
const privateRecipientContainer = document.getElementById('privateRecipientContainer');
const generalChatBtn = document.getElementById('generalChatBtn');
const privateChatBtn = document.getElementById('privateChatBtn');
const typingIndicator = document.getElementById('typingIndicator');
const onlineCount = document.getElementById('onlineCount');
const currentUserDisplay = document.getElementById('currentUserDisplay');
const changeUsernameBtn = document.getElementById('changeUsernameBtn');
const loadGeneralHistoryBtn = document.getElementById('loadGeneralHistory');
const loadPrivateHistoryBtn = document.getElementById('loadPrivateHistory');
const colorOptions = document.querySelectorAll('.color-option');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Configurar seleção de cor
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            colorOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            currentUser.avatarColor = option.dataset.color;
        });
    });
    
    // Selecionar cor padrão
    document.querySelector('.color-option[data-color="#0082FB"]').classList.add('selected');
    
    // Evento para entrar no chat
    joinChatBtn.addEventListener('click', joinChat);
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinChat();
    });
    
    // Evento para enviar mensagem
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Evento para digitação
    messageInput.addEventListener('input', handleTyping);
    
    // Eventos para mudar tipo de chat
    generalChatBtn.addEventListener('click', () => switchChatMode(false));
    privateChatBtn.addEventListener('click', () => switchChatMode(true));
    
    // Evento para alterar nome de usuário
    changeUsernameBtn.addEventListener('click', changeUsername);
    
    // Eventos para carregar histórico
    loadGeneralHistoryBtn.addEventListener('click', loadGeneralHistory);
    loadPrivateHistoryBtn.addEventListener('click', loadPrivateHistory);
    
    // Conectar ao servidor Socket.IO
    socket = io();
    
    // Configurar listeners do Socket.IO
    setupSocketListeners();
    
    // Verificar permissão para notificações
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
});

// Função para entrar no chat
function joinChat() {
    const username = usernameInput.value.trim();
    
    if (!username) {
        alert('Por favor, digite um nome de usuário!');
        usernameInput.focus();
        return;
    }
    
    if (username.length < 3) {
        alert('O nome de usuário deve ter pelo menos 3 caracteres!');
        usernameInput.focus();
        return;
    }
    
    currentUser.username = username;
    
    // Conectar ao servidor com os dados do usuário
    socket.emit('user-join', {
        username: currentUser.username,
        avatarColor: currentUser.avatarColor
    });
    
    // Fechar modal
    usernameModal.style.display = 'none';
    
    // Atualizar exibição do usuário atual
    updateCurrentUserDisplay();
    
    // Focar no campo de mensagem
    messageInput.focus();
}

// Configurar listeners do Socket.IO
function setupSocketListeners() {
    // Receber lista de usuários online
    socket.on('online-users', (users) => {
        updateOnlineUsers(users);
    });
    
    // Receber mensagem geral
    socket.on('receive-message', (message) => {
        displayMessage(message);
    });
    
    // Receber mensagem privada
    socket.on('receive-private-message', (message) => {
        displayMessage(message, true);
        
        // Mostrar notificação se a janela não está em foco
        if (document.hidden && message.senderId !== currentUser.id) {
            showNotification(`Mensagem privada de ${message.sender}`, message.content);
        }
    });
    
    // Usuário entrou
    socket.on('user-joined', (user) => {
        addUserToList(user);
        showSystemMessage(`${user.username} entrou no chat.`);
    });
    
    // Usuário saiu
    socket.on('user-left', (data) => {
        removeUserFromList(data.userId);
        showSystemMessage(`${data.username} saiu do chat.`);
    });
    
    // Usuário está digitando
    socket.on('user-typing', (data) => {
        updateTypingIndicator(data);
    });
    
    // Receber erro do servidor
    socket.on('error-message', (errorData) => {
        if (errorData.type === 'recipient-offline') {
            alert(`Erro: ${errorData.message}`);
            // Resetar seleção de destinatário
            selectedRecipientId = null;
            recipientSelect.value = '';
        }
    });
    
    // Receber ID do socket
    socket.on('connect', () => {
        currentUser.id = socket.id;
        console.log('Conectado ao servidor com ID:', currentUser.id);
    });
    
    // Desconexão do servidor
    socket.on('disconnect', () => {
        showSystemMessage('Você foi desconectado do servidor. Tentando reconectar...');
    });
    
    // Reconexão
    socket.on('reconnect', () => {
        showSystemMessage('Reconectado ao servidor!');
        // Reenviar dados do usuário após reconexão
        if (currentUser.username) {
            socket.emit('user-join', {
                username: currentUser.username,
                avatarColor: currentUser.avatarColor
            });
        }
    });
}

// Atualizar exibição do usuário atual
function updateCurrentUserDisplay() {
    currentUserDisplay.innerHTML = `
        <div class="user-avatar" style="background-color: ${currentUser.avatarColor}">
            ${currentUser.username.charAt(0).toUpperCase()}
        </div>
        <div class="user-info">
            <div class="user-name">${currentUser.username}</div>
            <div class="user-status online">Online</div>
        </div>
    `;
}

// Enviar mensagem
function sendMessage() {
    const content = messageInput.value.trim();
    
    if (!content) return;
    
    if (isPrivateMode && !selectedRecipientId) {
        alert('Selecione um destinatário para enviar mensagem privada!');
        return;
    }
    
    if (isPrivateMode) {
        // Enviar mensagem privada
        socket.emit('send-private-message', {
            receiverId: selectedRecipientId,
            content: content
        });
    } else {
        // Enviar mensagem geral
        socket.emit('send-message', {
            content: content
        });
    }
    
    // Limpar campo de entrada
    messageInput.value = '';
    
    // Parar indicador de digitação
    socket.emit('typing', false);
    
    // Focar novamente no campo
    messageInput.focus();
}

// Lidar com digitação
function handleTyping() {
    if (typingTimeout) clearTimeout(typingTimeout);
    
    socket.emit('typing', true);
    
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
}

// Alternar entre chat geral e privado
function switchChatMode(isPrivate) {
    isPrivateMode = isPrivate;
    
    if (isPrivate) {
        generalChatBtn.classList.remove('active');
        privateChatBtn.classList.add('active');
        privateRecipientContainer.style.display = 'flex';
        messageInput.placeholder = 'Digite sua mensagem privada...';
        
        // Se houver um destinatário selecionado, mostrar
        if (selectedRecipientId) {
            const selectedUser = Array.from(document.querySelectorAll('.user-item'))
                .find(item => item.dataset.userId === selectedRecipientId);
            if (selectedUser) {
                selectedUser.classList.add('private-selected');
            }
        }
    } else {
        privateChatBtn.classList.remove('active');
        generalChatBtn.classList.add('active');
        privateRecipientContainer.style.display = 'none';
        messageInput.placeholder = 'Digite sua mensagem...';
        
        // Limpar seleção
        selectedRecipientId = null;
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('private-selected');
        });
    }
}

// Atualizar lista de usuários online
function updateOnlineUsers(users) {
    userListContainer.innerHTML = '';
    recipientSelect.innerHTML = '<option value="">Selecione um usuário...</option>';
    
    let userCount = 0;
    
    users.forEach(user => {
        if (user.id !== currentUser.id) {
            addUserToList(user);
            userCount++;
            
            // Adicionar ao select de destinatários
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            recipientSelect.appendChild(option);
        }
    });
    
    // Atualizar contador
    onlineCount.textContent = users.length;
    
    // Atualizar seleção de destinatário
    recipientSelect.addEventListener('change', (e) => {
        selectedRecipientId = e.target.value;
        
        // Destacar usuário selecionado na lista
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('private-selected');
            if (item.dataset.userId === selectedRecipientId) {
                item.classList.add('private-selected');
            }
        });
        
        // Se estiver no modo privado, focar no campo de mensagem
        if (isPrivateMode && selectedRecipientId) {
            messageInput.focus();
        }
    });
}

// Adicionar usuário à lista
function addUserToList(user) {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    userItem.dataset.userId = user.id;
    
    userItem.innerHTML = `
        <div class="user-avatar" style="background-color: ${user.avatarColor || '#0082FB'}">
            ${user.username.charAt(0).toUpperCase()}
        </div>
        <div class="user-info">
            <div class="user-name">${user.username}</div>
            <div class="user-status online" id="status-${user.id}">Online</div>
        </div>
    `;
    
    // Selecionar usuário para chat privado ao clicar
    userItem.addEventListener('click', () => {
        if (!isPrivateMode) {
            switchChatMode(true);
        }
        
        selectedRecipientId = user.id;
        recipientSelect.value = user.id;
        
        // Destacar usuário selecionado
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('private-selected');
        });
        userItem.classList.add('private-selected');
        
        // Focar no campo de mensagem
        messageInput.focus();
    });
    
    userListContainer.appendChild(userItem);
}

// Remover usuário da lista
function removeUserFromList(userId) {
    const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    if (userItem) {
        userItem.remove();
    }
    
    // Remover do select de destinatários
    const option = document.querySelector(`#recipientSelect option[value="${userId}"]`);
    if (option) {
        option.remove();
    }
    
    // Se este era o destinatário selecionado, limpar a seleção
    if (selectedRecipientId === userId) {
        selectedRecipientId = null;
        recipientSelect.value = '';
    }
}

// Exibir mensagem
function displayMessage(message, isPrivate = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.senderId === currentUser.id ? 'own' : ''}`;
    
    const time = new Date(message.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    
    messageDiv.innerHTML = `
        <div class="message-avatar" style="background-color: ${message.avatarColor || '#0082FB'}">
            ${message.sender ? message.sender.charAt(0).toUpperCase() : '?'}
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-sender">${message.sender || 'Usuário desconhecido'}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">
                ${escapeHtml(message.content)}
                ${isPrivate ? '<span class="private-badge">PRIVADO</span>' : ''}
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Scroll para a mensagem mais recente
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Exibir mensagem do sistema
function showSystemMessage(text) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'system-message';
    systemDiv.style.textAlign = 'center';
    systemDiv.style.color = '#64748b';
    systemDiv.style.fontSize = '0.9rem';
    systemDiv.style.margin = '10px 0';
    systemDiv.style.fontStyle = 'italic';
    systemDiv.style.padding = '8px';
    systemDiv.style.backgroundColor = '#f1f5f9';
    systemDiv.style.borderRadius = '8px';
    systemDiv.textContent = `⚡ ${text}`;
    
    messagesContainer.appendChild(systemDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Atualizar indicador de digitação
function updateTypingIndicator(data) {
    const statusElement = document.getElementById(`status-${data.userId}`);
    
    if (statusElement) {
        if (data.isTyping) {
            statusElement.textContent = 'digitando...';
            statusElement.className = 'user-status typing';
            
            // Mostrar indicador global
            if (data.userId !== currentUser.id) {
                typingIndicator.textContent = `${data.username} está digitando...`;
                typingIndicator.style.display = 'block';
                
                // Limpar após 3 segundos
                setTimeout(() => {
                    typingIndicator.textContent = '';
                    typingIndicator.style.display = 'none';
                }, 3000);
            }
        } else {
            statusElement.textContent = 'Online';
            statusElement.className = 'user-status online';
            
            // Limpar indicador global se este usuário era o que estava digitando
            if (typingIndicator.textContent.includes(data.username)) {
                typingIndicator.textContent = '';
                typingIndicator.style.display = 'none';
            }
        }
    }
}

// Alterar nome de usuário
function changeUsername() {
    const newUsername = prompt('Digite seu novo nome de usuário:', currentUser.username);
    
    if (newUsername && newUsername.trim() && newUsername !== currentUser.username) {
        if (newUsername.trim().length < 3) {
            alert('O nome de usuário deve ter pelo menos 3 caracteres!');
            return;
        }
        
        const oldUsername = currentUser.username;
        currentUser.username = newUsername.trim();
        
        // Atualizar exibição
        updateCurrentUserDisplay();
        
        // Notificar servidor sobre mudança de nome
        // Em um sistema mais completo, você emitiria um evento para o servidor
        showSystemMessage(`Você alterou seu nome de ${oldUsername} para ${currentUser.username}`);
        
        // Emitir evento para atualizar nome (opcional)
        socket.emit('user-update', {
            username: currentUser.username,
            avatarColor: currentUser.avatarColor
        });
    }
}

// Carregar histórico geral
function loadGeneralHistory() {
    fetch('/api/messages/general')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(messages => {
            if (messages.length > 0) {
                // Limpar mensagens atuais (opcional)
                // messagesContainer.innerHTML = '';
                
                messages.reverse().forEach(message => {
                    displayMessage(message);
                });
                showSystemMessage(`📜 Histórico geral carregado (${messages.length} mensagens)`);
                
                // Scroll para o topo do histórico
                messagesContainer.scrollTop = 0;
            } else {
                showSystemMessage('📭 Nenhuma mensagem no histórico geral.');
            }
        })
        .catch(error => {
            console.error('Erro ao carregar histórico geral:', error);
            showSystemMessage('❌ Erro ao carregar histórico geral.');
        });
}

// Carregar histórico privado
function loadPrivateHistory() {
    if (!currentUser.id) {
        showSystemMessage('⚠️ Você precisa estar conectado para carregar histórico privado.');
        return;
    }
    
    fetch(`/api/messages/private/${currentUser.id}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(messages => {
            if (messages.length > 0) {
                messages.reverse().forEach(message => {
                    displayMessage(message, true);
                });
                showSystemMessage(`🔒 Histórico privado carregado (${messages.length} mensagens)`);
                
                // Scroll para o topo do histórico
                messagesContainer.scrollTop = 0;
            } else {
                showSystemMessage('🔏 Nenhuma mensagem no histórico privado.');
            }
        })
        .catch(error => {
            console.error('Erro ao carregar histórico privado:', error);
            showSystemMessage('❌ Erro ao carregar histórico privado.');
        });
}

// Mostrar notificação
function showNotification(title, body) {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
        new Notification(title, { 
            body,
            icon: 'https://cdn-icons-png.flaticon.com/512/733/733585.png' // Ícone do WhatsApp como exemplo
        });
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification(title, { body });
            }
        });
    }
}

// Utilitário: Escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utilitário: Formatar data
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}