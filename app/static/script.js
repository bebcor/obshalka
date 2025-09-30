class VideoCallManager {
    constructor() {
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.roomId = null;
        this.socket = null;
        this.socketId = null;
        this.remoteUsers = new Map();
        this.isConnected = false;
        
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.setupSocketConnection();
    }

    setupSocketConnection() {
        try {
            // Подключаемся к Socket.IO серверу
            this.socket = io({
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });
            
            this.socket.on('connect', () => {
                this.socketId = this.socket.id;
                this.isConnected = true;
                console.log('Connected to server with ID:', this.socketId);
                this.updateUI();
            });
            
            this.socket.on('disconnect', () => {
                this.isConnected = false;
                console.log('Disconnected from server');
                this.updateUI();
            });
            
            this.socket.on('connection_established', (data) => {
                console.log('Connection established:', data.message);
            });
            
            this.socket.on('room_info', (data) => {
                this.handleRoomInfo(data);
            });
            
            this.socket.on('user_joined', (data) => {
                this.handleUserJoined(data);
            });
            
            this.socket.on('user_left', (data) => {
                this.handleUserLeft(data);
            });
            
            this.socket.on('webrtc_offer', (data) => {
                this.handleWebRTCOffer(data);
            });
            
            this.socket.on('webrtc_answer', (data) => {
                this.handleWebRTCAnswer(data);
            });
            
            this.socket.on('ice_candidate', (data) => {
                this.handleICECandidate(data);
            });
            
            this.socket.on('error', (data) => {
                console.error('Server error:', data.message);
                alert('Error: ' + data.message);
            });
            
        } catch (error) {
            console.error('Error setting up socket connection:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('createRoom').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoom').addEventListener('click', () => this.joinRoom());
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('shareScreen').addEventListener('click', () => this.shareScreen());
    }

    updateUI() {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = this.isConnected ? 'status-connected' : 'status-disconnected';
        }
    }

    async createRoom() {
        try {
            console.log('Creating room...');
            const response = await fetch('/api/create_room', { method: 'POST' });
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.roomId = data.room_id;
            console.log('Room created with ID:', this.roomId);
            
            await this.startVideo();
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.
error('Error creating room:', error);
            alert('Failed to create room: ' + error.message);
        }
    }

    async joinRoom() {
        try {
            this.roomId = document.getElementById('roomInput').value.trim();
            
            if (!this.roomId) {
                alert('Please enter a room ID');
                return;
            }
            
            console.log('Checking room existence:', this.roomId);
            
            // Проверяем существование комнаты
            const response = await fetch(`/api/check_room/${this.roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                alert('Room does not exist');
                return;
            }
            
            await this.startVideo();
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room: ' + error.message);
        }
    }

    joinRoomAfterCreation() {
        if (!this.socket || !this.socket.connected) {
            alert('Not connected to server. Please try again.');
            return;
        }
        
        if (!this.roomId) {
            alert('No room ID specified');
            return;
        }
        
        console.log('Joining room:', this.roomId);
        
        // Запрашиваем имя пользователя
        const userName = prompt('Enter your name:', 'User' + Math.floor(Math.random() * 1000));
        
        if (!userName) {
            alert('Name is required to join the room');
            return;
        }
        
        // Присоединяемся к комнате через сокет
        this.socket.emit('join_room', {
            room_id: this.roomId,
            user_name: userName
        });
    }

    async startVideo() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            alert('Could not access camera/microphone: ' + error.message);
        }
    }

    handleRoomInfo(data) {
        console.log('Room info received:', data);
        document.getElementById('roomIdDisplay').textContent = this.roomId;
        document.getElementById('participantsCount').textContent = data.participants.length;
        
        // Устанавливаем соединения с другими участниками
        data.participants.forEach(participant => {
            if (participant.socket_id !== this.socketId) {
                this.setupPeerConnection(participant.socket_id);
            }
        });
    }

    handleUserJoined(data) {
        console.log('User joined:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        // Устанавливаем соединение с новым пользователем
        if (data.user_id !== this.socketId) {
            this.setupPeerConnection(data.user_id);
            this.createOffer(data.user_id);
        }
    }

    handleUserLeft(data) {
        console.log('User left:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        // Удаляем соединение с пользователем
        if (this.remoteUsers.has(data.user_id)) {
            this.remoteUsers.get(data.user_id).close();
            this.remoteUsers.delete(data.user_id);
        }
    }

    setupPeerConnection(targetUserId) {
        if (this.remoteUsers.has(targetUserId)) {
            console.log('Peer connection already exists for:', targetUserId);
            return;
        }
try {
            console.log('Setting up peer connection for:', targetUserId);
            
            const peerConnection = new RTCPeerConnection(this.configuration);
            
            // Добавляем локальные треки
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }
            
            // Обработчики событий WebRTC
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('Sending ICE candidate to:', targetUserId);
                    this.socket.emit('ice_candidate', {
                        target_user_id: targetUserId,
                        candidate: event.candidate
                    });
                }
            };
            
            peerConnection.ontrack = (event) => {
                console.log('Remote track received from:', targetUserId);
                this.remoteStream = event.streams[0];
                
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) {
                    remoteVideo.srcObject = this.remoteStream;
                }
            };
            
            peerConnection.onconnectionstatechange = () => {
                console.log('Connection state with', targetUserId, ':', peerConnection.connectionState);
            };
            
            peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE connection state with', targetUserId, ':', peerConnection.iceConnectionState);
            };
            
            // Сохраняем соединение
            this.remoteUsers.set(targetUserId, peerConnection);
            
        } catch (error) {
            console.error('Error setting up peer connection:', error);
        }
    }

    async createOffer(targetUserId) {
        if (!this.remoteUsers.has(targetUserId)) {
            console.error('No peer connection for:', targetUserId);
            return;
        }
        
        try {
            const peerConnection = this.remoteUsers.get(targetUserId);
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            await peerConnection.setLocalDescription(offer);
            
            console.log('Sending offer to:', targetUserId);
            
            this.socket.emit('webrtc_offer', {
                target_user_id: targetUserId,
                offer: offer
            });
            
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleWebRTCOffer(data) {
        try {
            console.log('Received offer from:', data.sender_id);
            
            if (!this.remoteUsers.has(data.sender_id)) {
                this.setupPeerConnection(data.sender_id);
            }
            
            const peerConnection = this.remoteUsers.get(data.sender_id);
            await peerConnection.setRemoteDescription(data.offer);
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            console.log('Sending answer to:', data.sender_id);
            
            this.socket.emit('webrtc_answer', {
                target_user_id: data.sender_id,
                answer: answer
            });
            
        } catch (error) {
            console.error('Error handling WebRTC offer:', error);
        }
    }

    async handleWebRTCAnswer(data) {
        try {
            console.log('Received answer from:', data.sender_id);
            
            if (!this.remoteUsers.has(data.sender_id)) {
                console.error('No peer connection for:', data.sender_id);
                return;
            }
            
            const peerConnection = this.remoteUsers.get(data.sender_id);
await peerConnection.setRemoteDescription(data.answer);
            
        } catch (error) {
            console.error('Error handling WebRTC answer:', error);
        }
    }

    async handleICECandidate(data) {
        try {
            console.log('Received ICE candidate from:', data.sender_id);
            
            if (!this.remoteUsers.has(data.sender_id)) {
                console.error('No peer connection for:', data.sender_id);
                return;
            }
            
            const peerConnection = this.remoteUsers.get(data.sender_id);
            await peerConnection.addIceCandidate(data.candidate);
            
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    toggleAudio() {
        if (!this.localStream) return;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const enabled = !audioTracks[0].enabled;
            audioTracks[0].enabled = enabled;
            
            const button = document.getElementById('toggleAudio');
            button.textContent = enabled ? '🔊' : '🔇';
        }
    }

    toggleVideo() {
        if (!this.localStream) return;
        
        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            const enabled = !videoTracks[0].enabled;
            videoTracks[0].enabled = enabled;
            
            const button = document.getElementById('toggleVideo');
            button.textContent = enabled ? '📷' : '🚫';
        }
    }

    async shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });
            
            // Заменяем видеотрек на экранный
            const videoTrack = screenStream.getVideoTracks()[0];
            
            if (this.localStream) {
                const oldVideoTrack = this.localStream.getVideoTracks()[0];
                this.localStream.removeTrack(oldVideoTrack);
                this.localStream.addTrack(videoTrack);
                
                // Обновляем отображение локального видео
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                }
                
                // Обновляем треки во всех активных соединениях
                for (const [userId, peerConnection] of this.remoteUsers) {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }
                }
                
                // Обработчик завершения демонстрации экрана
                videoTrack.onended = () => {
                    this.toggleVideo(); // Вернуться к обычной камере
                };
            }
            
        } catch (error) {
            console.error('Error sharing screen:', error);
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.videoCallManager = new VideoCallManager();
});

