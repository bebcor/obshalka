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
        this.audioAnalyzer = new AudioAnalyzer(this);
        this.usersManager = new UsersManager(this);
        this.chatManager = new ChatManager(this);
        
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
        
        // Users and Chat buttons
        const showUsersBtn = document.getElementById('showUsers');
        const showChatBtn = document.getElementById('showChat');
        
        if (showUsersBtn) {
            showUsersBtn.addEventListener('click', () => this.usersManager.showUsersModal());
        }
        
        if (showChatBtn) {
            showChatBtn.addEventListener('click', () => this.chatManager.showChatModal());
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
        
        // Обновляем список пользователей
        this.usersManager.updateParticipants(data.participants);
        
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
        
        // Обновляем список пользователей
        this.usersManager.addParticipant(data.user_id, data.user_name);
        
        if (data.user_id !== this.socketHandler.getSocketId()) {
            this.webrtcManager.setupPeerConnection(data.user_id);
            this.webrtcManager.createOffer(data.user_id);
        }
    }

    handleUserLeft(data) {
        console.log('User left:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        this.notificationManager.show(`${data.user_name || 'User'} left the room`, 'info');
        
        // Удаляем из списка пользователей
        this.usersManager.removeParticipant(data.user_id);
        
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
        
        // Обновляем grid layout
        this.uiManager.updateGridLayout();
        
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

    handleChatMessage(data) {
        const isOwn = data.user_id === this.socketHandler.getSocketId();
        this.chatManager.addMessage(data.user_name, data.message, isOwn);
    }

    cleanupCall() {
        // Останавливаем анализ аудио
        if (this.audioAnalyzer) {
            this.audioAnalyzer.cleanup();
        }
        
        // Очищаем чат
        if (this.chatManager) {
            this.chatManager.clearChat();
            this.chatManager.closeChatModal();
        }
        
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
        
        // Восстанавливаем статический элемент если он был изменен
        const videoContainer = document.querySelector('.video-container');
        const existingStaticVideo = document.getElementById('remoteVideo');
        if (!existingStaticVideo) {
            // Восстанавливаем статический элемент безопасно
            const staticWrapper = document.createElement('div');
            staticWrapper.className = 'video-wrapper remote';
            
            const video = document.createElement('video');
            video.id = 'remoteVideo';
            video.autoplay = true;
            video.playsInline = true;
            
            const label = document.createElement('div');
            label.className = 'video-label';
            label.textContent = 'Remote Participant';
            
            const overlay = document.createElement('div');
            overlay.className = 'video-overlay';
            overlay.id = 'remoteVideoOverlay';
            
            const overlayIcon = document.createElement('div');
            overlayIcon.className = 'overlay-icon';
            overlayIcon.textContent = '👤';
            
            const overlayText = document.createElement('p');
            overlayText.textContent = 'Waiting for participant to join...';
            
            overlay.appendChild(overlayIcon);
            overlay.appendChild(overlayText);
            
            staticWrapper.appendChild(video);
            staticWrapper.appendChild(label);
            staticWrapper.appendChild(overlay);
            
            videoContainer.insertBefore(staticWrapper, videoContainer.firstChild);
        } else {
            // Восстанавливаем оригинальный ID и содержимое
            const wrapper = existingStaticVideo.closest('.video-wrapper.remote');
            if (wrapper && wrapper.id && wrapper.id.startsWith('remoteWrapper-')) {
                wrapper.id = '';
                existingStaticVideo.id = 'remoteVideo';
                existingStaticVideo.srcObject = null;
                const label = wrapper.querySelector('.video-label');
                if (label) {
                    label.textContent = 'Remote Participant';
                    // Удаляем badge-group если есть
                    const badgeGroup = label.querySelector('.badge-group');
                    if (badgeGroup) {
                        badgeGroup.remove();
                    }
                }
            }
        }
        
        // Обновляем grid layout
        this.uiManager.updateGridLayout();
        
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

