// Модуль для работы с чатом

class ChatManager {
    constructor(socket, roomId) {
        this.socket = socket;
        this.roomId = roomId;
        this.messages = [];
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('new_message', (data) => {
            this.addMessage(data);
        });

        this.socket.on('chat_cleared', () => {
            this.clearMessages();
        });

        this.socket.on('room_info', (data) => {
            if (data.chat_messages && Array.isArray(data.chat_messages)) {
                this.messages = data.chat_messages;
                this.renderMessages();
            }
        });
    }

    sendMessage(message, userName) {
        if (!this.socket || !this.roomId || !message.trim()) return;

        const sanitizedMessage = sanitizeText(message, 500);
        const sanitizedUserName = sanitizeText(userName, 30);

        this.socket.emit('send_message', {
            room_id: this.roomId,
            message: sanitizedMessage,
            user_name: sanitizedUserName
        });
    }

    addMessage(messageData) {
        this.messages.push(messageData);
        this.renderMessages();
        this.scrollToBottom();
    }

    clearMessages() {
        this.messages = [];
        this.renderMessages();
    }

    renderMessages() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        if (this.messages.length === 0) {
            chatMessages.innerHTML = '<p class="empty-chat">Пока нет сообщений</p>';
            return;
        }

        chatMessages.innerHTML = this.messages.map(msg => `
            <div class="chat-message">
                <div class="chat-message-header">
                    <span class="chat-message-user">${escapeHtml(msg.user_name || 'Anonymous')}</span>
                    <span class="chat-message-time">${formatTime(msg.timestamp)}</span>
                </div>
                <div class="chat-message-text">${escapeHtml(msg.message)}</div>
            </div>
        `).join('');

        this.scrollToBottom();
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    showModal() {
        const modal = document.getElementById('chatModal');
        if (modal) {
            modal.style.display = 'flex';
            this.renderMessages();
            setTimeout(() => {
                const input = document.getElementById('chatInput');
                if (input) input.focus();
            }, 100);
        }
    }

    hideModal() {
        const modal = document.getElementById('chatModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupUI() {
        const showChatBtn = document.getElementById('showChat');
        const closeChatBtn = document.getElementById('closeChatModal');
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendChatMessage');

        if (showChatBtn) {
            showChatBtn.addEventListener('click', () => this.showModal());
        }

        if (closeChatBtn) {
            closeChatBtn.addEventListener('click', () => this.hideModal());
        }

        if (chatInput && sendBtn) {
            const sendMessage = () => {
                const message = chatInput.value.trim();
                if (message) {
                    const userName = window.videoCallManager?.userNames?.get(window.videoCallManager?.socketId) || 'User';
                    this.sendMessage(message, userName);
                    chatInput.value = '';
                }
            };

            sendBtn.addEventListener('click', sendMessage);
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });
        }

        // Закрытие по клику вне модального окна
        const modal = document.getElementById('chatModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                }
            });
        }
    }
}

