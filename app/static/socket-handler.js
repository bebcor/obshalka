// Модуль для обработки Socket.IO соединений
class SocketHandler {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        this.socket = null;
        this.socketId = null;
        this.isConnected = false;
    }

    setup() {
        try {
            this.socket = io({
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            this.socket.on('connect', () => {
                this.socketId = this.socket.id;
                this.isConnected = true;
                console.log('Connected to server with ID:', this.socketId);
                this.videoCallManager.uiManager.updateUI();
            });
            
            this.socket.on('disconnect', () => {
                this.isConnected = false;
                this.videoCallManager.isInCall = false;
                console.log('Disconnected from server');
                this.videoCallManager.cleanupCall();
                this.videoCallManager.uiManager.updateUI();
            });
            
            this.socket.on('connection_established', (data) => {
                console.log('Connection established:', data.message);
            });
            
            this.socket.on('room_info', (data) => {
                this.videoCallManager.handleRoomInfo(data);
            });
            
            this.socket.on('user_joined', (data) => {
                this.videoCallManager.handleUserJoined(data);
            });
            
            this.socket.on('user_left', (data) => {
                this.videoCallManager.handleUserLeft(data);
            });
            
            this.socket.on('webrtc_offer', (data) => {
                this.videoCallManager.handleWebRTCOffer(data);
            });
            
            this.socket.on('webrtc_answer', (data) => {
                this.videoCallManager.handleWebRTCAnswer(data);
            });
            
            this.socket.on('ice_candidate', (data) => {
                this.videoCallManager.handleICECandidate(data);
            });
            
            this.socket.on('chat_message', (data) => {
                this.videoCallManager.handleChatMessage(data);
            });
            
            this.socket.on('error', (data) => {
                console.error('Server error:', data.message);
                // Безопасный вывод сообщения об ошибке (notificationManager.show использует textContent)
                const errorMessage = data.message || 'Unknown error';
                this.videoCallManager.notificationManager.show('Ошибка: ' + errorMessage, 'error');
            });
            
        } catch (error) {
            console.error('Error setting up socket connection:', error);
        }
    }

    emit(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        }
    }

    getSocket() {
        return this.socket;
    }

    getSocketId() {
        return this.socketId;
    }

    getIsConnected() {
        return this.isConnected;
    }
}

