// Модуль для управления комнатами
class RoomManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    bootstrapFromURL() {
        const path = window.location.pathname;
        const deeplinkMatch = path.match(/^\/r\/([A-Za-z0-9_-]{3,50})$/);
        if (deeplinkMatch) {
            const roomId = deeplinkMatch[1];
            this.videoCallManager.roomId = roomId;
            // Показываем основной интерфейс
            this.videoCallManager.uiManager.showMainScreen();
            // ЖДЕМ подключения socket перед присоединением к комнате
            const tryJoin = () => {
                if (this.videoCallManager.isConnected) {
                    this.joinRoomFromURL();
                } else {
                    // Ждем подключения
                    setTimeout(tryJoin, 100);
                }
            };
            tryJoin();
        }
    }
    
    async joinRoomFromURL() {
        try {
            if (!this.videoCallManager.roomId) {
                // Если нет roomId, возвращаемся на стартовое окно
                this.videoCallManager.uiManager.showWelcomeScreen();
                return;
            }
            
            // ЖДЕМ подключения socket если еще не подключен
            if (!this.videoCallManager.isConnected) {
                console.log('Waiting for socket connection...');
                let attempts = 0;
                while (!this.videoCallManager.isConnected && attempts < 50) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }
                
                if (!this.videoCallManager.isConnected) {
                    this.videoCallManager.notificationManager.show('Не удалось подключиться к серверу', 'error');
                    return;
                }
            }
            
            console.log('Checking room existence from URL:', this.videoCallManager.roomId);
            this.videoCallManager.notificationManager.show('Проверка комнаты...', 'info');
            
            const response = await fetch(`/api/check_room/${this.videoCallManager.roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                this.videoCallManager.notificationManager.show('Комната не найдена', 'error');
                // Возвращаемся на стартовое окно
                this.videoCallManager.roomId = null;
                window.history.pushState({}, '', '/');
                this.videoCallManager.uiManager.showWelcomeScreen();
                return;
            }
            
            // Комната существует, подключаемся
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room from URL:', error);
            this.videoCallManager.notificationManager.show('Не удалось подключиться: ' + error.message, 'error');
            // Возвращаемся на стартовое окно при ошибке
            this.videoCallManager.roomId = null;
            window.history.pushState({}, '', '/');
            this.videoCallManager.uiManager.showWelcomeScreen();
        }
    }

    async fetchIceServers() {
        try {
            const res = await fetch('/api/ice');
            const data = await res.json();
            if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
                // Обновляем конфигурацию, если нужно
                console.log('ICE servers loaded');
            }
        } catch (e) {
            console.warn('Fallback to default ICE servers');
        }
    }

    async createRoomFromWelcome() {
        try {
            console.log('Creating room...');
            this.videoCallManager.notificationManager.show('Создание комнаты...', 'info');
            
            const response = await fetch('/api/create_room', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.videoCallManager.roomId = data.room_id;
            console.log('Room created with ID:', this.videoCallManager.roomId);
            
            // Обновляем URL и показываем основной интерфейс
            const newUrl = `/r/${this.videoCallManager.roomId}`;
            window.history.pushState({ roomId: this.videoCallManager.roomId }, '', newUrl);
            this.videoCallManager.uiManager.showMainScreen();
            
            const shareUrl = `${window.location.origin}${newUrl}`;
            this.videoCallManager.notificationManager.show(`Комната создана: ${this.videoCallManager.roomId}`, 'success');
            this.copyShareLink(shareUrl);
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error creating room:', error);
            this.videoCallManager.notificationManager.show('Не удалось создать комнату: ' + error.message, 'error');
        }
    }

    async createRoom() {
        // Старый метод для обратной совместимости
        return this.createRoomFromWelcome();
    }

    async copyShareLink(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.videoCallManager.notificationManager.show('Ссылка на комнату скопирована в буфер обмена', 'info');
        } catch (e) {
            this.videoCallManager.notificationManager.show('Не удалось скопировать ссылку. Скопируйте вручную: ' + url, 'warning');
        }
    }

    async joinRoomFromWelcome(roomId) {
        try {
            if (!roomId || !/^[A-Za-z0-9_-]{3,50}$/.test(roomId)) {
                this.videoCallManager.notificationManager.show('Неверный ID комнаты', 'error');
                return;
            }

            console.log('Checking room existence:', roomId);
            this.videoCallManager.notificationManager.show('Проверка комнаты...', 'info');
            
            const response = await fetch(`/api/check_room/${roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                this.videoCallManager.notificationManager.show('Комната не найдена', 'error');
                return;
            }
            
            this.videoCallManager.roomId = roomId;
            // Обновляем URL и показываем основной интерфейс
            const newUrl = `/r/${this.videoCallManager.roomId}`;
            window.history.pushState({ roomId: this.videoCallManager.roomId }, '', newUrl);
            this.videoCallManager.uiManager.showMainScreen();
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.videoCallManager.notificationManager.show('Не удалось подключиться: ' + error.message, 'error');
        }
    }

    async joinRoom() {
        // Старый метод для обратной совместимости
        const roomInput = document.getElementById('roomInput');
        const roomId = roomInput?.value.trim();
        if (roomId) {
            return this.joinRoomFromWelcome(roomId);
        }
    }

    joinRoomAfterCreation() {
        // ПРОВЕРЯЕМ isConnected вместо socket.connected (более надежно)
        if (!this.videoCallManager.socket || !this.videoCallManager.isConnected) {
            console.error('Socket not connected:', {
                socket: !!this.videoCallManager.socket,
                isConnected: this.videoCallManager.isConnected,
                socketConnected: this.videoCallManager.socket?.connected
            });
            this.videoCallManager.notificationManager.show('Not connected to server. Please try again.', 'error');
            // Пробуем подождать и повторить
            setTimeout(() => {
                if (this.videoCallManager.isConnected) {
                    this.joinRoomAfterCreation();
                }
            }, 1000);
            return;
        }
        
        if (!this.videoCallManager.roomId) {
            this.videoCallManager.notificationManager.show('No room ID specified', 'error');
            return;
        }
        
        console.log('Joining room:', this.videoCallManager.roomId);
        
        this.showUserNameModal();
    }

    showUserNameModal() {
        this.videoCallManager.notificationManager.showUserNameModal(
            (userName) => {
                this.videoCallManager.userName = userName;
                
                // НЕ устанавливаем isInCall здесь - это будет сделано в handleRoomInfo после подтверждения сервера
                this.videoCallManager.socket.emit('join_room', {
                    room_id: this.videoCallManager.roomId,
                    user_name: this.videoCallManager.userName
                });
                
                // НЕ вызываем showMediaPrompt здесь - это будет сделано в handleRoomInfo
                // Пользователь должен дождаться подтверждения от сервера
            },
            () => {
                this.videoCallManager.notificationManager.show('Join cancelled', 'info');
            }
        );
    }

    showMediaPrompt() {
        this.videoCallManager.notificationManager.showMediaPrompt(
            async () => {
                try {
                    await this.videoCallManager.mediaController.startVideo();
                    this.videoCallManager.notificationManager.show('Camera and microphone enabled', 'success');
                } catch (error) {
                    this.videoCallManager.notificationManager.show('Could not access media devices. You can enable them later.', 'warning');
                }
            },
            () => {
                this.videoCallManager.notificationManager.show('You joined without media. Click the camera/microphone buttons to enable them.', 'info');
            }
        );
    }

    leaveRoom() {
        if (this.videoCallManager.socket && 
            this.videoCallManager.socket.connected && 
            this.videoCallManager.roomId) {
            this.videoCallManager.socket.emit('leave_room', {
                room_id: this.videoCallManager.roomId
            });
        }
        
        this.videoCallManager.cleanupCall();
        this.videoCallManager.notificationManager.show('Вы вышли из комнаты', 'info');
        
        // Возвращаемся на стартовое окно
        this.videoCallManager.roomId = null;
        window.history.pushState({}, '', '/');
        this.videoCallManager.uiManager.showWelcomeScreen();
    }
}

