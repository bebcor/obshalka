// Модуль для управления комнатами
class RoomManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    bootstrapFromURL() {
        const path = window.location.pathname;
        const deeplinkMatch = path.match(/^\/r\/([A-Za-z0-9_-]{3,})$/);
        if (deeplinkMatch) {
            const roomId = deeplinkMatch[1];
            const input = document.getElementById('roomInput');
            if (input) input.value = roomId;
            // не авто-запускаем медиа, только автопросоединение к комнате
            setTimeout(() => this.joinRoom(), 0);
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

    async createRoom() {
        try {
            console.log('Creating room...');
            this.videoCallManager.notificationManager.show('Creating room...', 'info');
            
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
            const shareUrl = `${window.location.origin}/r/${this.videoCallManager.roomId}`;
            this.videoCallManager.notificationManager.show(`Комната создана: ${this.videoCallManager.roomId}`, 'success');
            this.copyShareLink(shareUrl);
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error creating room:', error);
            this.videoCallManager.notificationManager.show('Failed to create room: ' + error.message, 'error');
        }
    }

    async copyShareLink(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.videoCallManager.notificationManager.show('Ссылка на комнату скопирована в буфер обмена', 'info');
        } catch (e) {
            this.videoCallManager.notificationManager.show('Не удалось скопировать ссылку. Скопируйте вручную: ' + url, 'warning');
        }
    }

    async joinRoom() {
        try {
            this.videoCallManager.roomId = document.getElementById('roomInput').value.trim();
            
            if (!this.videoCallManager.roomId) {
                this.videoCallManager.notificationManager.show('Please enter a room ID', 'warning');
                return;
            }
            
            console.log('Checking room existence:', this.videoCallManager.roomId);
            this.videoCallManager.notificationManager.show('Checking room...', 'info');
            
            const response = await fetch(`/api/check_room/${this.videoCallManager.roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                this.videoCallManager.notificationManager.show('Room does not exist', 'error');
                return;
            }
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.videoCallManager.notificationManager.show('Failed to join room: ' + error.message, 'error');
        }
    }

    joinRoomAfterCreation() {
        if (!this.videoCallManager.socketHandler.getSocket() || !this.videoCallManager.socketHandler.getSocket().connected) {
            this.videoCallManager.notificationManager.show('Not connected to server. Please try again.', 'error');
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
                
                this.videoCallManager.socketHandler.emit('join_room', {
                    room_id: this.videoCallManager.roomId,
                    user_name: this.videoCallManager.userName
                });
                
                this.videoCallManager.isInCall = true;
                this.videoCallManager.uiManager.updateUI();
                this.videoCallManager.notificationManager.show(`Joined room ${this.videoCallManager.roomId} as ${this.videoCallManager.userName}`, 'success');
                
                this.showMediaPrompt();
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
        if (this.videoCallManager.socketHandler.getSocket() && 
            this.videoCallManager.socketHandler.getSocket().connected && 
            this.videoCallManager.roomId) {
            this.videoCallManager.socketHandler.emit('leave_room', {
                room_id: this.videoCallManager.roomId
            });
        }
        
        this.videoCallManager.cleanupCall();
        this.videoCallManager.notificationManager.show('Left the room', 'info');
    }
}

