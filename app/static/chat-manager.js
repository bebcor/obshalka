// Модуль для управления чатом
class ChatManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        this.messages = [];
        this.isOpen = false;
    }

    showChatModal() {
        const modal = document.createElement('div');
        modal.className = 'chat-modal';
        modal.id = 'chatModal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content chat-modal-content">
                    <div class="modal-header">
                        <h3>Чат</h3>
                        <button class="modal-close" id="closeChatModal">&times;</button>
                    </div>
                    <div class="chat-messages" id="chatMessages">
                        ${this.renderMessages()}
                    </div>
                    <div class="chat-input-container">
                        <input type="text" id="chatInput" placeholder="Введите сообщение..." maxlength="500">
                        <button id="sendChatMessage" class="btn btn-primary">Отправить</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.isOpen = true;
        
        // Прокрутка вниз
        const messagesContainer = document.getElementById('chatMessages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        document.getElementById('closeChatModal').addEventListener('click', () => {
            this.closeChatModal();
        });
        
        modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target === modal.querySelector('.modal-overlay')) {
                this.closeChatModal();
            }
        });
        
        const chatInput = document.getElementById('chatInput');
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        document.getElementById('sendChatMessage').addEventListener('click', () => {
            this.sendMessage();
        });
        
        chatInput.focus();
    }

    closeChatModal() {
        const modal = document.getElementById('chatModal');
        if (modal) {
            document.body.removeChild(modal);
            this.isOpen = false;
        }
    }

    sendMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        
        if (!message) {
            return;
        }
        
        // ПРОВЕРЯЕМ что пользователь действительно присоединился к комнате
        if (!this.videoCallManager.roomId || !this.videoCallManager.isInCall) {
            this.videoCallManager.notificationManager.show('Вы не в комнате', 'warning');
            return;
        }
        
        // Отправляем сообщение на сервер
        this.videoCallManager.socket.emit('chat_message', {
            room_id: this.videoCallManager.roomId,
            message: message,
            user_name: this.videoCallManager.userName || 'Анонимный'
        });
        
        // Показываем уведомление о отправке сообщения
        this.videoCallManager.notificationManager.show('Сообщение отправлено', 'success');
        
        chatInput.value = '';
    }

    addMessage(userName, message, isOwn = false, timestamp = null) {
        const messageObj = {
            userName: userName,
            message: message,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            isOwn: isOwn
        };
        
        this.messages.push(messageObj);
        
        // Ограничиваем количество сообщений (последние 100)
        if (this.messages.length > 100) {
            this.messages = this.messages.slice(-100);
        }
        
        if (this.isOpen) {
            this.updateChatMessages();
        }
    }

    renderMessages() {
        if (this.messages.length === 0) {
            return '<p class="no-messages">Нет сообщений. Начните общение!</p>';
        }
        
        return this.messages.map(msg => {
            const timestamp = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
            const time = timestamp.toLocaleTimeString('ru-RU', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            return `
                <div class="chat-message ${msg.isOwn ? 'own-message' : ''}">
                    <div class="message-header">
                        <span class="message-author">${this.escapeHtml(msg.userName)}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-text">${this.escapeHtml(msg.message)}</div>
                </div>
            `;
        }).join('');
    }

    updateChatMessages() {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            const wasAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 50;
            messagesContainer.innerHTML = this.renderMessages();
            if (wasAtBottom) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }
    }

    clearChat() {
        this.messages = [];
        if (this.isOpen) {
            this.updateChatMessages();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

