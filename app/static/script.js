class VideoCallManager {
    constructor() {
        this.localStream = null;
        // ЗАМЕНА: используем Map для хранения потоков всех пользователей
        this.remoteStreams = new Map();
        this.peerConnection = null;
        this.roomId = null;
        this.socket = null;
        this.socketId = null;
        this.remoteUsers = new Map();
        this.isConnected = false;
        this.isInCall = false;
        this.userName = null;
        
	// ЗАМЕНИТЕ ВАШУ КОНФИГУРАЦИЮ НА ЭТУ:
	this.configuration = {
    	iceServers: [
        // STUN серверы
        	{ urls: 'stun:stun.l.google.com:19302' },
        	{ urls: 'stun:stun1.l.google.com:19302' },
        	{ urls: 'stun:stun2.l.google.com:19302' },
        	{ urls: 'stun:stun3.l.google.com:19302' },
        	{ urls: 'stun:stun4.l.google.com:19302' },
        
        // TURN серверы (несколько вариантов)
        	{
            	urls: 'turn:openrelay.metered.ca:80',
            	username: 'openrelayproject',
            	credential: 'openrelayproject'
        	},
        	{
            	urls: 'turn:openrelay.metered.ca:443',
            	username: 'openrelayproject',
            	credential: 'openrelayproject'
        	},
        	{
            	urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            	username: 'openrelayproject',
            	credential: 'openrelayproject'
        	},
        	// Резервные TURN серверы
        	{
            	urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            	username: 'webrtc',
            	credential: 'webrtc'
        	}
    	],
    	iceTransportPolicy: 'all',
    	iceCandidatePoolSize: 10
	};

              
    this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.setupSocketConnection();
        this.updateUI();
        this.bootstrapFromURL();
        this.fetchIceServers();
	this.testTurnServer();
    }

	async testTurnServer() {
    	try {
        	const testPeerConnection = new RTCPeerConnection({
            	iceServers: [{
                	urls: 'turn:openrelay.metered.ca:80',
                	username: 'openrelayproject',
                	credential: 'openrelayproject'
           	 }]
        	});
        
        	testPeerConnection.onicecandidate = (e) => {
            	if (e.candidate) {
                	console.log('TURN candidate found:', e.candidate.type, e.candidate.protocol);
            	} else {
                	console.log('TURN gathering complete');
            	}
        	};
        
        // Создаем пустой оффер для активации ICE
        	await testPeerConnection.createOffer();
        	await testPeerConnection.setLocalDescription(await testPeerConnection.createOffer());
        
        	setTimeout(() => {
            	testPeerConnection.close();
        	}, 5000);
        
    	} catch (error) {
        	console.error('TURN test failed:', error);
    	}
	}

    setupSocketConnection() {
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
                this.updateUI();
            });
            
            this.socket.on('disconnect', () => {
                this.isConnected = false;
                this.isInCall = false;
                console.log('Disconnected from server');
                this.cleanupCall();
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
                this.showNotification('Error: ' + data.message, 'error');
            });
            
        } catch (error) {
            console.error('Error setting up socket connection:', error);
        }
    }

    async fetchIceServers() {
        try {
            const res = await fetch('/api/ice');
            const data = await res.json();
            if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
                this.configuration.iceServers = data.iceServers;
                console.log('ICE servers loaded');
            }
        } catch (e) {
            console.warn('Fallback to default ICE servers');
        }
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

    setupEventListeners() {
        // Room controls
        document.getElementById('createRoom').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoom').addEventListener('click', () => this.joinRoom());
        document.getElementById('endCall').addEventListener('click', () => this.leaveRoom());
        const copyBtn = document.getElementById('copyLink');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!this.roomId) {
                    this.showNotification('Сначала создайте или введите комнату', 'warning');
                    return;
                }
                const shareUrl = `${window.location.origin}/r/${this.roomId}`;
                this.copyShareLink(shareUrl);
            });
        }
        
        // Media controls
        document.getElementById('toggleAudio').addEventListener('click', () => this.toggleAudio());
        document.getElementById('toggleVideo').addEventListener('click', () => this.toggleVideo());
        document.getElementById('shareScreen').addEventListener('click', () => this.shareScreen());
        
        // Room input enter key
        document.getElementById('roomInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinRoom();
            }
        });
    }

    updateUI() {
        // Update connection status
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = this.isConnected ? 'status-connected' : 'status-disconnected';
        }
        
        // Show/hide call controls based on state
        const endCallBtn = document.getElementById('endCall');
        const roomControls = document.querySelector('.room-controls');
        
        if (this.isInCall) {
            endCallBtn.style.display = 'flex';
            roomControls.style.opacity = '0.5';
            roomControls.style.pointerEvents = 'none';
        } else {
            endCallBtn.style.display = 'none';
            roomControls.style.opacity = '1';
            roomControls.style.pointerEvents = 'auto';
        }
        
        // Update video overlays
        this.updateVideoOverlays();
        this.updateBadges();
    }

    updateVideoOverlays() {
        const localVideo = document.getElementById('localVideo');
        const localOverlay = document.getElementById('localVideoOverlay');
        
        // Local video overlay
        if (localVideo && localOverlay) {
            const videoTrack = this.localStream?.getVideoTracks()[0];
            if (videoTrack && videoTrack.enabled && this.localStream) {
                localOverlay.style.display = 'none';
            } else {
                localOverlay.style.display = 'flex';
            }
        }
        
        // Remote video overlays для всех пользователей
        this.remoteStreams.forEach((stream, userId) => {
            const remoteVideo = document.getElementById(`remoteVideo-${userId}`);
            const remoteOverlay = remoteVideo?.parentElement.querySelector('.video-overlay');
            
            if (remoteVideo && remoteOverlay) {
                if (stream && remoteVideo.srcObject) {
                    const videoTracks = stream.getVideoTracks();
                    if (videoTracks.length > 0 && videoTracks[0].readyState === 'live') {
                        remoteOverlay.style.display = 'none';
                    } else {
                        remoteOverlay.style.display = 'flex';
                    }
                } else {
                    remoteOverlay.style.display = 'flex';
                }
            }
        });
    }

    async createRoom() {
        try {
            console.log('Creating room...');
            this.showNotification('Creating room...', 'info');
            
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
            
            this.roomId = data.room_id;
            console.log('Room created with ID:', this.roomId);
            const shareUrl = `${window.location.origin}/r/${this.roomId}`;
            this.showNotification(`Комната создана: ${this.roomId}`, 'success');
            this.copyShareLink(shareUrl);
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error creating room:', error);
            this.showNotification('Failed to create room: ' + error.message, 'error');
        }
    }

    async copyShareLink(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.showNotification('Ссылка на комнату скопирована в буфер обмена', 'info');
        } catch (e) {
            this.showNotification('Не удалось скопировать ссылку. Скопируйте вручную: ' + url, 'warning');
        }
    }

    async joinRoom() {
        try {
            this.roomId = document.getElementById('roomInput').value.trim();
            
            if (!this.roomId) {
                this.showNotification('Please enter a room ID', 'warning');
                return;
            }
            
            console.log('Checking room existence:', this.roomId);
            this.showNotification('Checking room...', 'info');
            
            const response = await fetch(`/api/check_room/${this.roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                this.showNotification('Room does not exist', 'error');
                return;
            }
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room: ' + error.message, 'error');
        }
    }

    joinRoomAfterCreation() {
        if (!this.socket || !this.socket.connected) {
            this.showNotification('Not connected to server. Please try again.', 'error');
            return;
        }
        
        if (!this.roomId) {
            this.showNotification('No room ID specified', 'error');
            return;
        }
        
        console.log('Joining room:', this.roomId);
        
        this.showUserNameModal();
    }

    showUserNameModal() {
        const modal = document.createElement('div');
        modal.className = 'user-name-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>Join Video Call</h3>
                    <p>Enter your name to join the room</p>
                    <input type="text" id="userNameInput" placeholder="Your name" maxlength="20" value="User${Math.floor(Math.random() * 1000)}">
                    <div class="modal-buttons">
                        <button id="cancelJoin" class="btn btn-secondary">Cancel</button>
                        <button id="confirmJoin" class="btn btn-primary">Join Room</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const userNameInput = document.getElementById('userNameInput');
        userNameInput.focus();
        userNameInput.select();
        
        document.getElementById('confirmJoin').addEventListener('click', () => {
            this.handleUserJoinConfirmation(modal);
        });
        
        document.getElementById('cancelJoin').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.showNotification('Join cancelled', 'info');
        });
        
        userNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleUserJoinConfirmation(modal);
            }
        });
        
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                this.showNotification('Join cancelled', 'info');
            }
        });
    }

    handleUserJoinConfirmation(modal) {
        const userNameInput = document.getElementById('userNameInput');
        this.userName = userNameInput.value.trim();
        
        if (!this.userName) {
            userNameInput.style.borderColor = 'var(--error)';
            userNameInput.focus();
            return;
        }
        
        document.body.removeChild(modal);
        
        this.socket.emit('join_room', {
            room_id: this.roomId,
            user_name: this.userName
        });
        
        this.isInCall = true;
        this.updateUI();
        this.showNotification(`Joined room ${this.roomId} as ${this.userName}`, 'success');
        
        this.showMediaPrompt();
    }

    showMediaPrompt() {
        const mediaPrompt = document.createElement('div');
        mediaPrompt.className = 'media-prompt-modal';
        mediaPrompt.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>Enable Camera & Microphone?</h3>
                    <p>You can enable your camera and microphone now or later during the call</p>
                    <div class="media-options">
                        <button id="enableMedia" class="btn btn-primary">
                            <span>🎤📹</span>
                            Enable Both
                        </button>
                        <button id="joinWithoutMedia" class="btn btn-secondary">
                            Join Without Media
                        </button>
                    </div>
                    <p class="note">You can always enable camera and microphone using the controls below</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(mediaPrompt);
        
        document.getElementById('enableMedia').addEventListener('click', async () => {
            document.body.removeChild(mediaPrompt);
            try {
                await this.startVideo();
                this.showNotification('Camera and microphone enabled', 'success');
            } catch (error) {
                this.showNotification('Could not access media devices. You can enable them later.', 'warning');
            }
        });
        
        document.getElementById('joinWithoutMedia').addEventListener('click', () => {
            document.body.removeChild(mediaPrompt);
            this.showNotification('You joined without media. Click the camera/microphone buttons to enable them.', 'info');
        });
    }

    leaveRoom() {
        if (this.socket && this.socket.connected && this.roomId) {
            this.socket.emit('leave_room', {
                room_id: this.roomId
            });
        }
        
        this.cleanupCall();
        this.showNotification('Left the room', 'info');
    }

    cleanupCall() {
        // Close all peer connections
        this.remoteUsers.forEach((connection, userId) => {
            connection.close();
        });
        this.remoteUsers.clear();
        
        // Clear all remote streams and video elements
        this.remoteStreams.forEach((stream, userId) => {
            // wrapper and video share the same id today; prefer wrapper lookup first
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
        document.getElementById('roomIdDisplay').textContent = '-';
        document.getElementById('participantsCount').textContent = '0';
        this.updateUI();
    }

    async startVideo() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
            
            this.updateControlButtons();
            this.updateVideoOverlays();
            
            // ДОБАВЛЯЕМ: треки во все существующие соединения
            this.addTracksToExistingConnections();
            
            // ЕСЛИ есть активные соединения, запускаем renegotiation
            if (this.remoteUsers.size > 0) {
                this.remoteUsers.forEach((peerConnection, userId) => {
                    this.createOffer(userId);
                });
            }
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            if (error.name === 'NotAllowedError') {
                this.showNotification('Camera/microphone access was denied. You can enable them later.', 'warning');
            } else if (error.name === 'NotFoundError') {
                this.showNotification('No camera or microphone found. You can still join the call.', 'warning');
            } else {
                this.showNotification('Could not access camera/microphone: ' + error.message, 'error');
            }
            throw error;
        }
    }

    // НОВЫЙ МЕТОД: добавление треков в существующие соединения
    addTracksToExistingConnections() {
        if (!this.localStream) return;
        
        this.remoteUsers.forEach((peerConnection, userId) => {
            const existingSenders = peerConnection.getSenders();
            const hasVideoSender = existingSenders.some(sender => 
                sender.track && sender.track.kind === 'video'
            );
            const hasAudioSender = existingSenders.some(sender => 
                sender.track && sender.track.kind === 'audio'
            );
            
            if (!hasVideoSender) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    peerConnection.addTrack(videoTrack, this.localStream);
                }
            }
            
            if (!hasAudioSender) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    peerConnection.addTrack(audioTrack, this.localStream);
                }
            }
        });
    }

    updateControlButtons() {
        const audioBtn = document.getElementById('toggleAudio');
        const videoBtn = document.getElementById('toggleVideo');
        
        if (this.localStream) {
            const audioEnabled = this.localStream.getAudioTracks()[0]?.enabled;
            const videoEnabled = this.localStream.getVideoTracks()[0]?.enabled;
            
            if (audioBtn) {
                audioBtn.classList.toggle('active', audioEnabled);
                audioBtn.classList.toggle('muted', !audioEnabled);
            }
            
            if (videoBtn) {
                videoBtn.classList.toggle('active', videoEnabled);
                videoBtn.classList.toggle('muted', !videoEnabled);
            }
            this.updateBadges();
        } else {
            if (audioBtn) {
                audioBtn.classList.remove('active');
                audioBtn.classList.add('muted');
            }
            if (videoBtn) {
                videoBtn.classList.remove('active');
                videoBtn.classList.add('muted');
            }
            this.updateBadges();
        }
    }

    updateBadges() {
        const audioBadge = document.getElementById('badge-local-audio');
        const videoBadge = document.getElementById('badge-local-video');
        if (!audioBadge || !videoBadge) return;

        if (this.localStream) {
            const a = this.localStream.getAudioTracks()[0];
            const v = this.localStream.getVideoTracks()[0];
            audioBadge.classList.toggle('on', !!a && a.enabled);
            audioBadge.classList.toggle('off', !(!!a && a.enabled));
            videoBadge.classList.toggle('on', !!v && v.enabled);
            videoBadge.classList.toggle('off', !(!!v && v.enabled));
        } else {
            audioBadge.classList.remove('on');
            audioBadge.classList.add('off');
            videoBadge.classList.remove('on');
            videoBadge.classList.add('off');
        }
    }

    handleRoomInfo(data) {
        console.log('Room info received:', data);
        this.isInCall = true;
        
        document.getElementById('roomIdDisplay').textContent = this.roomId;
        document.getElementById('participantsCount').textContent = data.participants.length;
        
        data.participants.forEach(participant => {
            if (participant.socket_id !== this.socketId) {
                this.setupPeerConnection(participant.socket_id);
            }
        });
        
        this.updateUI();
    }

    handleUserJoined(data) {
        console.log('User joined:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        this.showNotification(`${data.user_name || 'User'} joined the room`, 'info');
        
        if (data.user_id !== this.socketId) {
            this.setupPeerConnection(data.user_id);
            this.createOffer(data.user_id);
        }
    }

    handleUserLeft(data) {
        console.log('User left:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        this.showNotification(`${data.user_name || 'User'} left the room`, 'info');
        
        if (this.remoteUsers.has(data.user_id)) {
            this.remoteUsers.get(data.user_id).close();
            this.remoteUsers.delete(data.user_id);
        }
        
        // УДАЛЯЕМ видео элемент и поток этого пользователя
        if (this.remoteStreams.has(data.user_id)) {
            this.remoteStreams.delete(data.user_id);
        }
        
        const videoElement = document.getElementById(`remoteVideo-${data.user_id}`);
        if (videoElement) {
            videoElement.parentElement.remove();
        }
        
        this.updateVideoOverlays();
    }

	setupPeerConnection(targetUserId) {
    	// Проверяем, нет ли уже соединения с этим пользователем
    	if (this.remoteUsers.has(targetUserId)) {
        	console.log('Peer connection already exists for:', targetUserId);
        	return;
    	}

    	try {
        	console.log('Setting up peer connection for:', targetUserId);
        
        	// Конфигурация ICE-серверов с STUN и TURN
        	const configuration = {
            	iceServers: [
                	// STUN-серверы Google
                	{ urls: 'stun:stun.l.google.com:19302' },
                	{ urls: 'stun:stun1.l.google.com:19302' },
                	{ urls: 'stun:stun2.l.google.com:19302' },
                	{ urls: 'stun:stun3.l.google.com:19302' },
                	{ urls: 'stun:stun4.l.google.com:19302' },
                
                	// TURN-серверы для обхода сложных NAT и фаерволов
                	{
                    	urls: 'turn:openrelay.metered.ca:80',
                    	username: 'openrelayproject',
                    	credential: 'openrelayproject'
                	},
                	{
                    	urls: 'turn:openrelay.metered.ca:443',
                    	username: 'openrelayproject', 
                    	credential: 'openrelayproject'
                	},
                	{
                    	urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                    	username: 'openrelayproject',
                    	credential: 'openrelayproject'
                	},
                	// Резервные TURN-серверы
                	{
                    	urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                    	username: 'webrtc',
                    	credential: 'webrtc'
                	}
            	],
            	iceTransportPolicy: 'all', // Используем и relay и host кандидаты
            	iceCandidatePoolSize: 10   // Увеличиваем пул ICE-кандидатов
        	};

        	// Создаем новый peer connection
        	const peerConnection = new RTCPeerConnection(configuration);
        
        	// Добавляем локальные треки, если они есть
        	if (this.localStream) {
            	this.localStream.getTracks().forEach(track => {
                	peerConnection.addTrack(track, this.localStream);
            	});
        	}
        
        	// Обработчик ICE-кандидатов
        	peerConnection.onicecandidate = (event) => {
            	if (event.candidate) {
                	console.log('New ICE candidate for', targetUserId, ':', {
                    	type: event.candidate.type,
                    	protocol: event.candidate.protocol,
                    	address: event.candidate.address,
                    	port: event.candidate.port
                	});
                
                	// Отправляем кандидат через signaling-сервер
                	this.socket.emit('ice_candidate', {
                    	target_user_id: targetUserId,
                    	candidate: event.candidate
                	});
            	} else {
                	console.log('✅ ICE gathering complete for:', targetUserId);
                	console.log('Local SDP description:', peerConnection.localDescription?.sdp);
            	}
        	};
        
        // Обработчик получения удаленных треков
        	peerConnection.ontrack = (event) => {
            	console.log('Remote track received from:', targetUserId, 
                        	'Track kind:', event.track.kind, 
                        	'Track readyState:', event.track.readyState,
              	        	'Streams count:', event.streams.length);
            
            	// Создаем или получаем удаленный поток для этого пользователя
            	if (!this.remoteStreams.has(targetUserId)) {
                	const remoteStream = new MediaStream();
                	this.remoteStreams.set(targetUserId, remoteStream);
                	this.createRemoteVideoElement(targetUserId, remoteStream);
            	}
            
            	// Добавляем полученный трек в поток
            	const remoteStream = this.remoteStreams.get(targetUserId);
            	event.streams[0].getTracks().forEach(track => {
                	if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                    	remoteStream.addTrack(track);
                    	console.log('Added track to remote stream:', track.kind);
                	}
            	});
            
            	this.updateVideoOverlays();
        	};
        
        	// Обработчик изменения состояния соединения
        	peerConnection.onconnectionstatechange = () => {
            	const state = peerConnection.connectionState;
            	console.log('Connection state with', targetUserId, ':', state);
            
            	if (state === 'connected') {
                	this.showNotification('Call connected', 'success');
                	console.log('✅ WebRTC connection established!');
            	} else if (state === 'disconnected') {
                	this.showNotification('Call disconnected', 'warning');
            	} else if (state === 'failed') {
                	console.error('❌ Connection failed - attempting ICE restart...');
                	this.showNotification('Connection issues detected', 'warning');
                
                	// Пытаемся перезапустить ICE через 3 секунды
                	setTimeout(() => {
                    	if (this.remoteUsers.has(targetUserId) && 
                        	peerConnection.connectionState === 'failed') {
                        	console.log('🔄 Attempting ICE restart for', targetUserId);
                        	this.createOffer(targetUserId);
                    	}
                	}, 3000);
            	}
        	};
        
        	// Обработчик изменения состояния ICE-соединения
        	peerConnection.oniceconnectionstatechange = () => {
            	const iceState = peerConnection.iceConnectionState;
            	console.log('ICE connection state with', targetUserId, ':', iceState);
            
            	if (iceState === 'connected' || iceState === 'completed') {
                	console.log('✅ ICE connection successful!');
            	} else if (iceState === 'disconnected') {
                	console.warn('⚠️ ICE connection disconnected');
            	} else if (iceState === 'failed') {
                	console.error('❌ ICE connection failed - will trigger renegotiation');
                	// Автоматический перезапуск через connectionstatechange
            	}
        	};
        
        // Обработчик необходимости переговоров (renegotiation)
        	peerConnection.onnegotiationneeded = () => {
            	console.log('Negotiation needed for:', targetUserId);
        	};
        
        // Обработчик изменения состояния ICE gathering
        	peerConnection.onicegatheringstatechange = () => {
            	console.log('ICE gathering state for', targetUserId, ':', 
                	        peerConnection.iceGatheringState);
        	};
        
        // Сохраняем соединение в Map
        	this.remoteUsers.set(targetUserId, peerConnection);
        
        	console.log('✅ Peer connection setup completed for:', targetUserId);
        
    	} catch (error) {
        	console.error('❌ Error setting up peer connection:', error);
        	this.showNotification('Failed to setup connection: ' + error.message, 'error');
    	}
	}





    // НОВЫЙ МЕТОД: создание видео элемента для удаленного пользователя
    createRemoteVideoElement(userId, stream) {
        const videoContainer = document.querySelector('.video-container');
        
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper remote';
        videoWrapper.id = `remoteWrapper-${userId}`;
        
        videoWrapper.innerHTML = `
            <video id="remoteVideo-${userId}" autoplay playsinline></video>
            <div class="video-label">User ${userId.substring(0, 8)}
                <span class="badge-group">
                    <span class="badge badge-audio on" title="Микрофон включен">🎤</span>
                    <span class="badge badge-video on" title="Камера включена">📹</span>
                </span>
            </div>
            <div class="video-overlay">
                <div class="overlay-icon">👤</div>
                <p>Waiting for video...</p>
            </div>
        `;
        
        videoContainer.appendChild(videoWrapper);
        
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        videoElement.srcObject = stream;
    }

	async createOffer(targetUserId) {
    		if (!this.remoteUsers.has(targetUserId)) {
        		console.error('No peer connection for:', targetUserId);
        	return;
    	}
    
    	try {
        	const peerConnection = this.remoteUsers.get(targetUserId);
        
        	// ОСТОРОЖНО: Используем стандартные опции без переопределения
        	const offer = await peerConnection.createOffer();
        
        	await peerConnection.setLocalDescription(offer);
        
        	console.log('📤 Sending offer to:', targetUserId);
        	console.log('SDP offer direction check:');
        	peerConnection.getTransceivers().forEach((transceiver, index) => {
            	console.log(`Transceiver ${index}:`, {
                	direction: transceiver.direction,
                	currentDirection: transceiver.currentDirection,
                	kind: transceiver.receiver.track?.kind || 'no track'
            	});
        	});
        
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
    
        // Если соединение с этим пользователем еще не создано, создаем его
        if (!this.remoteUsers.has(data.sender_id)) {
            this.setupPeerConnection(data.sender_id);
        }
    
        const peerConnection = this.remoteUsers.get(data.sender_id);
        
        // Устанавливаем полученное предложение (offer) как удаленное описание
        await peerConnection.setRemoteDescription(data.offer);
    
        // Создаем ответ (answer)
        const answer = await peerConnection.createAnswer();
        
        // Устанавливаем созданный ответ как локальное описание
        await peerConnection.setLocalDescription(answer);
    
        console.log('Sending answer to:', data.sender_id);
        
        // Отправляем ответ обратно инициатору через signaling-сервер
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
           console.log('📥 Received ANSWER from:', data.sender_id);  // ✅
           console.log('Answer SDP:', data.answer.sdp.substring(0, 100) + '...');  // ✅
        
           if (!this.remoteUsers.has(data.sender_id)) {
               console.error('No peer connection for:', data.sender_id);
               return;
           }
        
           const peerConnection = this.remoteUsers.get(data.sender_id);
           await peerConnection.setRemoteDescription(data.answer);  // ✅ используем data.answer
           console.log('✅ Remote description set successfully');
        
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

    async toggleAudio() {
        if (!this.localStream) {
            try {
                await this.startVideo();
            } catch (error) {
                this.showNotification('Cannot enable microphone without media access', 'error');
                return;
            }
        }
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const enabled = !audioTracks[0].enabled;
            audioTracks[0].enabled = enabled;
            
            this.updateControlButtons();
            this.showNotification(enabled ? 'Microphone on' : 'Microphone off', 'info');
        }
    }

    async toggleVideo() {
        if (!this.localStream) {
            try {
                await this.startVideo();
            } catch (error) {
                this.showNotification('Cannot enable camera without media access', 'error');
                return;
            }
        }
        
        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            const enabled = !videoTracks[0].enabled;
            videoTracks[0].enabled = enabled;
            
            this.updateControlButtons();
            this.updateVideoOverlays();
            this.showNotification(enabled ? 'Camera on' : 'Camera off', 'info');
        }
    }

    async shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'window'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            
            const videoTrack = screenStream.getVideoTracks()[0];
            
            if (this.localStream) {
                const oldVideoTrack = this.localStream.getVideoTracks()[0];
                
                this.localStream.removeTrack(oldVideoTrack);
                this.localStream.addTrack(videoTrack);
                
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                }
                
                for (const [userId, peerConnection] of this.remoteUsers) {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    
                    if (sender) {
                        await sender.replaceTrack(videoTrack);
                    }
                    
                    // ДОБАВЛЯЕМ: повторное согласование после замены трека
                    await this.createOffer(userId);
                }
                
                this.showNotification('Screen sharing started', 'success');
                
                videoTrack.onended = () => {
                    this.showNotification('Screen sharing ended', 'info');
                    this.toggleVideo();
                };
            }
            
        } catch (error) {
            console.error('Error sharing screen:', error);
            if (error.name !== 'NotAllowedError') {
                this.showNotification('Failed to share screen: ' + error.message, 'error');
            }
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type} fade-in`;
        notification.innerHTML = `
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        `;
        
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    color: white;
                    z-index: 1000;
                    max-width: 300px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                }
                .notification-info { background: var(--primary-blue); }
                .notification-success { background: var(--success); }
                .notification-error { background: var(--error); }
                .notification-warning { background: var(--warning); }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .user-name-modal, .media-prompt-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(5px);
                }
                .modal-content {
                    position: relative;
                    background: var(--surface);
                    padding: 24px;
                    border-radius: 16px;
                    box-shadow: var(--shadow-lg);
                    max-width: 400px;
                    width: 90%;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .modal-content h3 {
                    margin: 0 0 8px 0;
                    color: var(--text-primary);
                    font-size: 1.25rem;
                }
                .modal-content p {
                    margin: 0 0 20px 0;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                #userNameInput {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    background: var(--surface-light);
                    color: var(--text-primary);
                    font-size: 1rem;
                    margin-bottom: 20px;
                }
                #userNameInput:focus {
                    outline: none;
                    border-color: var(--primary-blue);
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
                }
                .modal-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .btn-secondary {
                    background: var(--surface-light);
                    color: var(--text-primary);
                }
                .btn-secondary:hover {
                    background: var(--surface-light);
                    opacity: 0.8;
                }
                .media-options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin: 20px 0;
                }
                .media-options .btn {
                    justify-content: center;
                    padding: 16px;
                }
                .note {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    text-align: center;
                    margin: 10px 0 0 0;
                }
            `;
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
        
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.videoCallManager = new VideoCallManager();
});
