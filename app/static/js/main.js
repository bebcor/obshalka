// Главный класс VideoCallManager, объединяющий все модули
class VideoCallManager {
    constructor() {
        this.localStream = null;
        this.remoteStreams = new Map();
        this.peerConnection = null;
        this.roomId = null;
        this.remoteUsers = new Map();
        this.isConnected = false;
        this.isInCall = false;
        this.userName = null;
        this.configuration = ICE_CONFIG;
        
        // Инициализируем модули
        this.notificationManager = new NotificationManager();
        this.socketHandler = new SocketHandler(this);
        this.webrtcManager = new WebRTCManager(this);
        this.mediaController = new MediaController(this);
        this.roomManager = new RoomManager(this);
        this.uiManager = new UIManager(this);
        
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.socketHandler.setup();
        this.uiManager.updateUI();
        this.roomManager.bootstrapFromURL();
        this.roomManager.fetchIceServers();
        this.webrtcManager.testTurnServer();
    }

    setupEventListeners() {
        // Room controls
        const createRoomBtn = document.getElementById('createRoom');
        const joinRoomBtn = document.getElementById('joinRoom');
        const endCallBtn = document.getElementById('endCall');
        const roomInput = document.getElementById('roomInput');

        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => this.roomManager.createRoom());
        }

        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => this.roomManager.joinRoom());
        }

        if (endCallBtn) {
            endCallBtn.addEventListener('click', () => this.roomManager.leaveRoom());
        }

        const copyBtn = document.getElementById('copyLink');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!this.roomId) {
                    this.notificationManager.show('Сначала создайте или введите комнату', 'warning');
                    return;
                }
                const shareUrl = `${window.location.origin}/r/${this.roomId}`;
                this.roomManager.copyShareLink(shareUrl);
            });
        }

        // Media controls
        const toggleAudioBtn = document.getElementById('toggleAudio');
        const toggleVideoBtn = document.getElementById('toggleVideo');
        const shareScreenBtn = document.getElementById('shareScreen');
        const toggleFullscreenBtn = document.getElementById('toggleFullscreen');

        if (toggleAudioBtn) {
            toggleAudioBtn.addEventListener('click', () => this.mediaController.toggleAudio());
        }

        if (toggleVideoBtn) {
            toggleVideoBtn.addEventListener('click', () => this.mediaController.toggleVideo());
        }

        if (shareScreenBtn) {
            shareScreenBtn.addEventListener('click', () => this.mediaController.shareScreen());
        }

        if (toggleFullscreenBtn) {
            toggleFullscreenBtn.addEventListener('click', () => this.mediaController.toggleFullscreen());
        }

        // Room input enter key
        if (roomInput) {
            roomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.roomManager.joinRoom();
                }
            });
        }
    }

    handleRoomInfo(data) {
        console.log('Room info received:', data);
        this.isInCall = true;
        
        document.getElementById('roomIdDisplay').textContent = this.roomId;
        document.getElementById('participantsCount').textContent = data.participants.length;
        
        data.participants.forEach(participant => {
            if (participant.socket_id !== this.socketHandler.getSocketId()) {
                this.webrtcManager.setupPeerConnection(participant.socket_id);
            }
        });
        
        this.uiManager.updateUI();
    }

    handleUserJoined(data) {
        console.log('User joined:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        this.notificationManager.show(`${data.user_name || 'User'} joined the room`, 'info');
        
        if (data.user_id !== this.socketHandler.getSocketId()) {
            this.webrtcManager.setupPeerConnection(data.user_id);
            this.webrtcManager.createOffer(data.user_id);
        }
    }

    handleUserLeft(data) {
        console.log('User left:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        this.notificationManager.show(`${data.user_name || 'User'} left the room`, 'info');
        
        if (this.remoteUsers.has(data.user_id)) {
            this.remoteUsers.get(data.user_id).close();
            this.remoteUsers.delete(data.user_id);
        }
        
        // Удаляем видео элемент и поток этого пользователя
        if (this.remoteStreams.has(data.user_id)) {
            this.remoteStreams.delete(data.user_id);
        }
        
        const wrapper = document.getElementById(`remoteWrapper-${data.user_id}`);
        if (wrapper) {
            wrapper.remove();
        } else {
            const videoElement = document.getElementById(`remoteVideo-${data.user_id}`);
            if (videoElement && videoElement.parentElement) {
                videoElement.parentElement.remove();
            }
        }
        
        this.uiManager.updateVideoOverlays();
    }

    handleWebRTCOffer(data) {
        this.webrtcManager.handleWebRTCOffer(data);
    }

    handleWebRTCAnswer(data) {
        this.webrtcManager.handleWebRTCAnswer(data);
    }

    handleICECandidate(data) {
        this.webrtcManager.handleICECandidate(data);
    }

    cleanupCall() {
        // Close all peer connections
        this.remoteUsers.forEach((connection, userId) => {
            connection.close();
        });
        this.remoteUsers.clear();
        
        // Clear all remote streams and video elements
        this.remoteStreams.forEach((stream, userId) => {
            const wrapper = document.getElementById(`remoteWrapper-${userId}`);
            if (wrapper) {
                wrapper.remove();
                return;
            }
            const videoElement = document.getElementById(`remoteVideo-${userId}`);
            if (videoElement && videoElement.parentElement) {
                videoElement.parentElement.remove();
            }
        });
        this.remoteStreams.clear();
        
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Clear room info
        this.roomId = null;
        this.isInCall = false;
        
        // Update UI
        const roomIdDisplay = document.getElementById('roomIdDisplay');
        const participantsCount = document.getElementById('participantsCount');
        if (roomIdDisplay) roomIdDisplay.textContent = '-';
        if (participantsCount) participantsCount.textContent = '0';
        this.uiManager.updateUI();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.videoCallManager = new VideoCallManager();
});

// Обработка полноэкранного режима
document.addEventListener('fullscreenchange', () => {
    const container = document.querySelector('.container');
    if (!document.fullscreenElement) {
        container.classList.remove('fullscreen-mode');
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.fullscreenElement) {
        const container = document.querySelector('.container');
        container.classList.remove('fullscreen-mode');
    }
});

