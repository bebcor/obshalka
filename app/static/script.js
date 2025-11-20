class VideoCallManager {
    constructor() {
        this.localStream = null;
        this.remoteStreams = new Map();
        this.peerConnection = null;
        this.roomId = null;
        this.socket = null;
        this.socketId = null;
        this.remoteUsers = new Map();
        this.isConnected = false;
        this.isInCall = false;
        this.userNames = new Map();
        this.availableMicrophones = [];
        this.selectedMicrophoneId = null;
        this.availableCameras = [];
        this.selectedCameraId = null; 
        this.isSharingScreen = false;
        this.screenStream = null;
        this.cameraStream = null;
        this.hasVideoTrack = false;
        this.audioVisualizer = null;
        this.chatManager = null;
        this.participantsManager = null;
        this.mediaDevicesManager = new MediaDevicesManager();
        
        // Используем конфигурацию из модуля
        this.configuration = WEBRTC_CONFIG;
              
        this.initialize();
    }

    initialize() {
        this.setupWelcomeScreen();
        this.setupEventListeners();
        this.setupSocketConnection();
        this.updateUI();
        this.bootstrapFromURL();
        this.checkMediaDevices();

        const localParticipantCard = document.getElementById('localParticipantCard');
        if (localParticipantCard) {
            localParticipantCard.style.display = 'none';
        }
        setTimeout(() => {
            this.checkEmptyState();
            this.removeOldWaitingMessage();
        }, 500);
    }

    setupWelcomeScreen() {
        // Проверяем, есть ли room_id в URL
        const path = window.location.pathname;
        const roomMatch = path.match(/^\/r\/([A-Za-z0-9_-]{3,20})$/);
        
        if (roomMatch) {
            // Если есть room_id в URL, сразу показываем основную страницу
            this.showMainScreen();
            return;
        }

        // Иначе показываем начальную страницу
        const welcomeScreen = document.getElementById('welcomeScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';

        // Обработчики для начальной страницы
        const welcomeCreateBtn = document.getElementById('welcomeCreateRoom');
        const welcomeJoinBtn = document.getElementById('welcomeJoinRoom');
        const welcomeJoinConfirm = document.getElementById('welcomeJoinConfirm');
        const welcomeJoinCancel = document.getElementById('welcomeJoinCancel');
        const joinRoomForm = document.getElementById('joinRoomForm');
        const welcomeRoomInput = document.getElementById('welcomeRoomInput');

        if (welcomeCreateBtn) {
            welcomeCreateBtn.addEventListener('click', () => {
                this.createRoomFromWelcome();
            });
        }

        if (welcomeJoinBtn) {
            welcomeJoinBtn.addEventListener('click', () => {
                if (joinRoomForm) {
                    joinRoomForm.style.display = 'flex';
                    if (welcomeRoomInput) welcomeRoomInput.focus();
                }
            });
        }

        if (welcomeJoinConfirm) {
            welcomeJoinConfirm.addEventListener('click', () => {
                const roomId = welcomeRoomInput?.value.trim();
                if (roomId && validateRoomId(roomId)) {
                    this.joinRoomFromWelcome(roomId);
                } else {
                    showNotification('Введите корректный ID комнаты', 'warning');
                }
            });
        }

        if (welcomeJoinCancel) {
            welcomeJoinCancel.addEventListener('click', () => {
                if (joinRoomForm) joinRoomForm.style.display = 'none';
                if (welcomeRoomInput) welcomeRoomInput.value = '';
            });
        }

        if (welcomeRoomInput) {
            welcomeRoomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const roomId = welcomeRoomInput.value.trim();
                    if (roomId && validateRoomId(roomId)) {
                        this.joinRoomFromWelcome(roomId);
                    }
                }
            });
        }
    }

    showMainScreen() {
        const welcomeScreen = document.getElementById('welcomeScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'flex';
    }

    async createRoomFromWelcome() {
        try {
            showNotification('Создание комнаты...', 'info');
            const response = await fetch('/api/create_room', { 
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            const data = await response.json();
            
            if (data.error) throw new Error(data.error);
            
            this.roomId = data.room_id;
            // Меняем URL
            window.history.pushState({}, '', `/r/${this.roomId}`);
            this.showMainScreen();
            await this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error creating room:', error);
            showNotification('Не удалось создать комнату: ' + error.message, 'error');
        }
    }

    async joinRoomFromWelcome(roomId) {
        try {
            if (!validateRoomId(roomId)) {
                showNotification('Неверный ID комнаты', 'error');
                return;
            }

            showNotification('Проверка комнаты...', 'info');
            const response = await fetch(`/api/check_room/${roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                showNotification('Комната не найдена', 'error');
                return;
            }
            
            this.roomId = roomId;
            // Меняем URL
            window.history.pushState({}, '', `/r/${this.roomId}`);
            this.showMainScreen();
            await this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room:', error);
            showNotification('Не удалось подключиться: ' + error.message, 'error');
        }
    }
    

    setupSocketConnection() {
        try {
            this.socket = io(SOCKET_CONFIG);
            
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
    		showNotification('Connection lost', 'error');
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
                showNotification('Error: ' + data.message, 'error');
            });

            // Инициализация менеджеров чата и участников после подключения
            this.socket.on('connect', () => {
                if (this.roomId) {
                    this.chatManager = new ChatManager(this.socket, this.roomId);
                    this.participantsManager = new ParticipantsManager(this.socket, this.roomId);
                    this.chatManager.setupUI();
                    this.participantsManager.setupUI();
                }
            });
            
        } catch (error) {
            console.error('Error setting up socket connection:', error);
        }
    }


// Используем методы из media-devices.js
async getMicrophones() {
        await this.mediaDevicesManager.getMicrophones();
        this.availableMicrophones = this.mediaDevicesManager.availableMicrophones;
        return this.availableMicrophones;
    }

    async showMicrophoneSelection() {
        await this.mediaDevicesManager.getMicrophones();
        this.mediaDevicesManager.showMicrophoneSelection((deviceId) => {
            this.selectedMicrophoneId = deviceId;
            if (this.localStream) {
                this.restartAudioWithSelectedMicrophone();
            }
        });
    }


// Используем методы из media-devices.js
async getCameras() {
        await this.mediaDevicesManager.getCameras();
        this.availableCameras = this.mediaDevicesManager.availableCameras;
        return this.availableCameras;
    }

    async showCameraSelection() {
        await this.mediaDevicesManager.getCameras();
        this.mediaDevicesManager.showCameraSelection((deviceId) => {
            this.selectedCameraId = deviceId;
            if (this.localStream && this.localStream.getVideoTracks().length > 0) {
                this.restartVideoWithSelectedCamera();
            }
        });
    }


// ДОБАВЛЯЕМ НОВЫЙ МЕТОД для перезапуска видео с выбранной камерой
async restartVideoWithSelectedCamera() {
    if (!this.localStream) {
        console.log('❌ Локальный поток не активен');
        showNotification('Сначала включите камеру', 'warning');
        return;
    }
    
    try {
        console.log('🔄 Переключаем камеру на:', this.selectedCameraId);
        
        // СОХРАНЯЕМ текущее состояние видео
        const wasVideoEnabled = this.localStream.getVideoTracks()[0]?.enabled || false;
        
        const videoConstraints = this.selectedCameraId ? {
            deviceId: { exact: this.selectedCameraId },
            width: { ideal: 1280 }, 
            height: { ideal: 720 }, 
            frameRate: { ideal: 30 }
        } : {
            width: { ideal: 1280 }, 
            height: { ideal: 720 }, 
            frameRate: { ideal: 30 }
        };
        
        console.log('📷 Создаем новый видеопоток с constraints:', videoConstraints);
        
        // СОЗДАЕМ новый видео поток
        const newVideoStream = await navigator.mediaDevices.getUserMedia({ 
            video: videoConstraints 
        });
        
        const newVideoTrack = newVideoStream.getVideoTracks()[0];
        
        // ВОССТАНАВЛИВАЕМ предыдущее состояние
        newVideoTrack.enabled = wasVideoEnabled;
        
        // ЗАМЕНА видео-трека в существующем потоке
        const oldVideoTracks = this.localStream.getVideoTracks();
        
        // УДАЛЯЕМ старые видео-треки
        oldVideoTracks.forEach(track => {
            this.localStream.removeTrack(track);
            track.stop();
        });
        
        // ДОБАВЛЯЕМ новый видео-трек
        this.localStream.addTrack(newVideoTrack);
        
        // ОБНОВЛЯЕМ UI
        this.updateControlButtons();
        
        // ОБНОВЛЯЕМ видео элемент
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = this.localStream;
        }
        
        // ОБНОВЛЯЕМ соединения
        await this.updateVideoTracksInConnections(newVideoTrack);
        
        showNotification('Камера переключена', 'success');
        console.log('✅ Камера успешно переключена');
        
    } catch (error) {
        console.error('❌ Ошибка переключения камеры:', error);
        
        if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
            showNotification('Выбранная камера недоступна', 'error');
            this.selectedCameraId = null;
        } else {
            showNotification('Ошибка переключения камеры: ' + error.message, 'error');
        }
    }
}





// ДОБАВЛЯЕМ НОВЫЙ МЕТОД для показа настроек
showSettingsModal() {
    const modal = document.createElement('div');
    modal.className = 'settings-modal';
    modal.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>⚙️ Настройки</h3>
                <div class="settings-options">
                    <button id="selectMicrophoneSettings" class="btn btn-settings">
                        🎤 Выбор микрофона
                    </button>
                    <button id="selectCameraSettings" class="btn btn-settings">
                        📷 Выбор камеры
                    </button>
                </div>
                <div class="modal-buttons">
                    <button id="closeSettings" class="btn btn-secondary">Закрыть</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    document.getElementById('selectMicrophoneSettings').addEventListener('click', () => {
        document.body.removeChild(modal);
        this.showMicrophoneSelection();
    });

    document.getElementById('selectCameraSettings').addEventListener('click', () => {
        document.body.removeChild(modal);
        this.showCameraSelection();
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}



checkEmptyState() {
    // УБЕЖДАЕМСЯ, что emptyStateOverlay существует
    let emptyState = document.getElementById('emptyStateOverlay');
    
    if (!emptyState) {
        console.warn("⚠️ emptyStateOverlay не найден, создаем...");
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) {
            emptyState = document.createElement('div');
            emptyState.id = 'emptyStateOverlay';
            emptyState.className = 'empty-state-overlay';
            emptyState.innerHTML = `
                <div class="brand-logo">
                    <div class="logo-icon">📹</div>
                    <h1 class="brand-name">obshalka</h1>
                    <p class="brand-tagline">видео-конференции</p>
                </div>
            `;
            videoContainer.appendChild(emptyState);
            console.log("✅ emptyStateOverlay создан");
            
            // УДАЛЯЕМ СТАРУЮ НАДПИСЬ "Waiting for participant to join..."
            this.removeOldWaitingMessage();
        } else {
            console.error("❌ Не удалось создать emptyStateOverlay: video-container не найден");
            return;
        }
    }

    const participantsGrid = document.getElementById('participantsGrid');
    if (!participantsGrid) {
        console.log('❌ participantsGrid не найден, показываем emptyState');
        emptyState.style.display = 'flex';
        return;
    }

    // Считаем ТОЛЬКО удаленных участников (не локального)
    const remoteParticipants = participantsGrid.querySelectorAll('.remote-participant');
    const hasRemoteParticipants = remoteParticipants.length > 0;
    
    console.log('🔍 Проверка состояния emptyState:', {
        remoteParticipantsCount: remoteParticipants.length,
        hasRemoteParticipants: hasRemoteParticipants,
        isInCall: this.isInCall
    });

    // Показываем emptyState ТОЛЬКО когда в звонке И нет удаленных участников
    if (this.isInCall && !hasRemoteParticipants) {
        emptyState.style.display = 'flex';
        console.log('🔄 Показываем emptyState - в звонке, но нет удаленных участников');
    } else {
        emptyState.style.display = 'none';
        console.log('✅ Скрываем emptyState - есть удаленные участники или не в звонке');
    }
}

removeOldWaitingMessage() {
    // Удаляем ТОЛЬКО конкретные элементы старой системы
    const oldWaitingElements = document.querySelectorAll('.waiting-message, .waiting-text, .empty-state-text');
    oldWaitingElements.forEach(element => {
        if (!element.closest('#emptyStateOverlay')) {
            element.remove();
            console.log('🗑️ Удален старый элемент ожидания');
        }
    });
    
    // Удаляем ТОЛЬКО текстовые элементы с конкретным содержанием
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
        if (element.children.length === 0) {
            const text = element.textContent;
            if (text.includes('Waiting for participant to join') ||
                text.includes('Ожидание участников') ||
                text.includes('Ожидание видео...')) {
                if (!element.closest('#emptyStateOverlay')) {
                    element.remove();
                    console.log('🗑️ Удалена старая текстовая надпись');
                }
            }
        }
    });
}

async stopScreenShare() {
    if (!this.isSharingScreen) return;

    console.log('🖥️ Останавливаем демонстрацию экрана...');
    
    // ОСТАНАВЛИВАЕМ поток экрана
    if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
            track.stop();
        });
        this.screenStream = null;
    }
    
    // ВОССТАНАВЛИВАЕМ предыдущий поток
    if (this.previousStream) {
        this.localStream = this.previousStream;
        this.previousStream = null;
        
        // ПРОВЕРЯЕМ ЕСТЬ ЛИ ВИДЕОТРЕК В ВОССТАНОВЛЕННОМ ПОТОКЕ
        const videoTrack = this.localStream.getVideoTracks()[0];
        this.hasVideoTrack = !!(videoTrack && videoTrack.enabled);
    } else {
        this.localStream = null;
        this.hasVideoTrack = false;
    }
    
    // ОБНОВЛЯЕМ видео элемент
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = this.localStream;
    }

    // ОБНОВЛЯЕМ ОВЕРЛЕИ
    this.updateVideoOverlays();
    
    // ОБНОВЛЯЕМ соединения - либо с камерой, либо без видео
    const videoTrack = this.localStream ? this.localStream.getVideoTracks()[0] : null;
    await this.updateVideoTracksInConnections(videoTrack);
    
    this.isSharingScreen = false;
    this.updateControlButtons();
    
    showNotification('Демонстрация экрана завершена', 'info');
    console.log('✅ Демонстрация экрана остановлена');
}











// НОВЫЙ МЕТОД - ПРОСТОЙ И НАДЕЖНЫЙ ПЕРЕЗАПУСК СОЕДИНЕНИЙ
async restartAllConnections() {
    console.log('🔄 ПЕРЕЗАПУСКАЕМ ВСЕ СОЕДИНЕНИЯ...');
    
    // Сохраняем список текущих участников
    const currentParticipants = Array.from(this.remoteUsers.keys());
    
    // Закрываем все старые соединения
    this.remoteUsers.forEach((connection, userId) => {
        try {
            connection.close();
            console.log(`✅ Закрыто соединение с ${userId}`);
        } catch (error) {
            console.error(`❌ Ошибка закрытия соединения: ${error}`);
        }
    });
    
    // Очищаем карты
    this.remoteUsers.clear();
    this.remoteStreams.clear();
    
    // Удаляем все карточки удаленных участников
    const remoteCards = document.querySelectorAll('.remote-participant');
    remoteCards.forEach(card => card.remove());
    
    // Создаем новые соединения для всех участников
    currentParticipants.forEach(userId => {
        this.setupPeerConnection(userId);
        this.createOffer(userId);
        console.log(`✅ Создано новое соединение с ${userId}`);
    });
    
    console.log('✅ ВСЕ СОЕДИНЕНИЯ ПЕРЕЗАПУЩЕНЫ');
}






async updateVideoTracksInConnections(newVideoTrack = null) {
    console.log('🔄 Обновляем видеотреки в соединениях...');
    
    const videoTrack = newVideoTrack || (this.localStream ? this.localStream.getVideoTracks()[0] : null);
    
    const updatePromises = [];
    
    this.remoteUsers.forEach((peerConnection, userId) => {
        const videoSender = peerConnection.getSenders().find(s => 
            s.track && s.track.kind === 'video'
        );
        
        if (videoSender) {
            console.log(`🔄 Обновляем видео-трек для пользователя: ${userId}`);
            updatePromises.push(videoSender.replaceTrack(videoTrack));
        } else if (videoTrack) {
            // ЕСЛИ отправителя нет, но есть трек - добавляем
            console.log(`🎯 Добавляем видео-трек для пользователя: ${userId}`);
            peerConnection.addTrack(videoTrack, this.localStream);
        } else {
            // ЕСЛИ трека нет - удаляем видео-отправитель если есть
            console.log(`🗑️ Удаляем видео-трек для пользователя: ${userId}`);
            if (videoSender) {
                updatePromises.push(videoSender.replaceTrack(null));
            }
        }
    });
    
    try {
        await Promise.all(updatePromises);
        console.log('✅ Все видеотреки обновлены');
    } catch (error) {
        console.error('❌ Ошибка обновления видеотреков:', error);
    }
}







async checkMediaDevices() {
        const result = await this.mediaDevicesManager.checkMediaDevices();
        this.availableMicrophones = result.microphones;
        this.availableCameras = result.cameras;
        return result;
    }




async restartAudioWithSelectedMicrophone() {
    if (!this.localStream) {
        console.log('❌ Локальный поток не активен');
        showNotification('Сначала включите микрофон', 'warning');
        return;
    }
    
    try {
        console.log('🔄 Переключаем микрофон на:', this.selectedMicrophoneId);
        
        // СОХРАНЯЕМ текущее состояние аудио
        const wasAudioEnabled = this.localStream.getAudioTracks()[0]?.enabled || false;
        
        const audioConstraints = this.selectedMicrophoneId ? {
            deviceId: { exact: this.selectedMicrophoneId }, // Используем exact вместо ideal
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };
        
        console.log('🎤 Создаем новый аудиопоток с constraints:', audioConstraints);
        
        // СОЗДАЕМ новый аудио поток
        const newAudioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: audioConstraints 
        });
        
        const newAudioTrack = newAudioStream.getAudioTracks()[0];
        
        // ВОССТАНАВЛИВАЕМ предыдущее состояние
        newAudioTrack.enabled = wasAudioEnabled;
        
        // ЗАМЕНА аудио-трека в существующем потоке
        const oldAudioTracks = this.localStream.getAudioTracks();
        
        // УДАЛЯЕМ старые аудио-треки
        oldAudioTracks.forEach(track => {
            this.localStream.removeTrack(track);
            track.stop();
        });
        
        // ДОБАВЛЯЕМ новый аудио-трек
        this.localStream.addTrack(newAudioTrack);
        
        // ОБНОВЛЯЕМ UI
        this.updateControlButtons();
        
        // ОБНОВЛЯЕМ соединения
        await this.updateAudioTracksInConnections();
        
        // ВАЖНО: Пересоздаем офферы для всех соединений
        if (this.remoteUsers.size > 0) {
            console.log('🔄 Пересоздаем офферы после смены микрофона');
            this.remoteUsers.forEach((peerConnection, userId) => {
                this.createOffer(userId);
            });
        }
        
        showNotification('Микрофон переключен', 'success');
        console.log('✅ Микрофон успешно переключен');
        
    } catch (error) {
        console.error('❌ Ошибка переключения микрофона:', error);
        
        if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
            showNotification('Выбранный микрофон недоступен', 'error');
            this.selectedMicrophoneId = null;
        } else {
            showNotification('Ошибка переключения микрофона: ' + error.message, 'error');
        }
    }
}






async updateAudioTracksInConnections() {
    const audioTrack = this.localStream?.getAudioTracks()[0];
    if (!audioTrack) {
        console.log('❌ Нет аудиотрека для обновления');
        return;
    }
    
    console.log('🔄 Обновляем аудиотреки в соединениях...');
    
    const updatePromises = [];
    
    this.remoteUsers.forEach((peerConnection, userId) => {
        let sender = peerConnection.getSenders().find(s => 
            s.track && s.track.kind === 'audio'
        );
        
        if (sender) {
            console.log(`🔄 Обновляем аудиотрек для пользователя: ${userId}`);
            updatePromises.push(sender.replaceTrack(audioTrack));
        } else {
            // ЕСЛИ отправителя нет - создаем новый
            console.log(`🎯 Создаем новый аудио-отправитель для пользователя: ${userId}`);
            try {
                sender = peerConnection.addTrack(audioTrack, this.localStream);
                console.log(`✅ Аудио-отправитель создан для: ${userId}`);
            } catch (error) {
                console.error(`❌ Ошибка создания аудио-отправителя: ${error}`);
            }
        }
    });
    
    try {
        await Promise.all(updatePromises);
        console.log('✅ Все аудиотреки обновлены');
    } catch (error) {
        console.error('❌ Ошибка обновления аудиотреков:', error);
    }
}




    bootstrapFromURL() {
        const path = window.location.pathname;
        const deeplinkMatch = path.match(/^\/r\/([A-Za-z0-9_-]{3,20})$/);
        if (deeplinkMatch) {
            const roomId = deeplinkMatch[1];
            if (validateRoomId(roomId)) {
                this.roomId = roomId;
                const input = document.getElementById('roomInput');
                if (input) input.value = roomId;
                this.showMainScreen();
                setTimeout(() => this.joinRoom(), 0);
            }
        }
    }

setupEventListeners() {
    // Room controls
    const createRoomBtn = document.getElementById('createRoom');
    const joinRoomBtn = document.getElementById('joinRoom');
    const endCallBtn = document.getElementById('endCall');
    const roomInput = document.getElementById('roomInput');

    if (createRoomBtn) createRoomBtn.addEventListener('click', () => this.createRoom());
    if (joinRoomBtn) joinRoomBtn.addEventListener('click', () => this.joinRoom());
    if (endCallBtn) endCallBtn.addEventListener('click', () => this.leaveRoom());

    // Media controls
    const toggleAudioBtn = document.getElementById('toggleAudio');
    const toggleVideoBtn = document.getElementById('toggleVideo');
    const shareScreenBtn = document.getElementById('shareScreen');
    const toggleFullscreenBtn = document.getElementById('toggleFullscreen');

    if (toggleAudioBtn) toggleAudioBtn.addEventListener('click', () => this.toggleAudio());
    if (toggleVideoBtn) toggleVideoBtn.addEventListener('click', () => this.toggleVideo());
    if (shareScreenBtn) shareScreenBtn.addEventListener('click', () => this.shareScreen());
    if (toggleFullscreenBtn) toggleFullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    // Room input enter key
    if (roomInput) {
        roomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });
    }

    // Copy link button
    const copyBtn = document.getElementById('copyLink');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (!this.roomId) {
                showNotification('Сначала создайте или введите комнату', 'warning');
                return;
            }
            const shareUrl = `${window.location.origin}/r/${this.roomId}`;
            this.copyShareLink(shareUrl);
        });
    }


    // НОВАЯ КНОПКА: Настройки (шестеренка)
    const settingsBtn = document.createElement('button');
    settingsBtn.innerHTML = '⚙️ Настройки';
    settingsBtn.id = 'settingsBtn';
    settingsBtn.style.cssText = `
        position: fixed;
        bottom: 150px;
        right: 20px;
        background: var(--surface-light);
        color: var(--text-primary);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 10px 15px;
        border-radius: 8px;
        cursor: pointer;
        z-index: 1000;
        font-size: 14px;
    `;
    document.body.appendChild(settingsBtn);

    settingsBtn.addEventListener('click', () => {
        this.showSettingsModal();
    });

    // УДАЛЯЕМ старые отдельные кнопки выбора микрофона и камеры
    const oldSelectMicBtn = document.getElementById('selectMicrophone');
    if (oldSelectMicBtn) {
        oldSelectMicBtn.remove();
    }

    // Добавляем стили для модальных окон
    if (!document.querySelector('#settings-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'settings-styles';
        styleElement.textContent = `
            .settings-modal .modal-overlay,
            .camera-selection-modal .modal-overlay,
            .microphone-selection-modal .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(5px);
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .settings-modal .modal-content,
            .camera-selection-modal .modal-content,
            .microphone-selection-modal .modal-content {
                background: var(--surface);
                padding: 24px;
                border-radius: 16px;
                box-shadow: var(--shadow-lg);
                max-width: 400px;
                width: 90%;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .settings-modal h3,
            .camera-selection-modal h3,
            .microphone-selection-modal h3 {
                margin: 0 0 16px 0;
                color: var(--text-primary);
                text-align: center;
            }

            .settings-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin: 20px 0;
            }

            .btn-settings {
                background: var(--surface-light);
                color: var(--text-primary);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 12px 16px;
                border-radius: 8px;
                cursor: pointer;
                text-align: left;
                font-size: 14px;
                transition: all 0.2s;
            }

            .btn-settings:hover {
                background: var(--surface-hover);
                border-color: var(--primary-blue);
            }

            .camera-list,
            .microphone-list {
                margin: 20px 0;
                max-height: 300px;
                overflow-y: auto;
            }

            .camera-item,
            .microphone-item {
                padding: 12px;
                margin: 8px 0;
                background: var(--surface-light);
                border-radius: 8px;
                cursor: pointer;
                border: 1px solid transparent;
            }

            .camera-item:hover,
            .microphone-item:hover {
                background: var(--surface-hover);
                border-color: var(--primary-blue);
            }

            .camera-item input[type="radio"],
            .microphone-item input[type="radio"] {
                margin-right: 10px;
            }

            .camera-item label,
            .microphone-item label {
                cursor: pointer;
                color: var(--text-primary);
                display: flex;
                align-items: center;
            }

            .modal-buttons {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                margin-top: 20px;
            }
        `;
        document.head.appendChild(styleElement);
    }
}


    updateUI() {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = this.isConnected ? 'status-connected' : 'status-disconnected';
        }
        
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
        
        this.updateVideoOverlays();
    }

updateVideoOverlays() {
    // ДЛЯ ЛОКАЛЬНОГО УЧАСТНИКА
    const localVideo = document.getElementById('localVideo');
    const localOverlay = document.getElementById('localVideoOverlay');
    const localParticipantCard = document.getElementById('localParticipantCard');
    
    if (localVideo && localOverlay && localParticipantCard) {
        const videoTrack = this.localStream?.getVideoTracks()[0];
        
        // ПОКАЗЫВАЕМ КАРТОЧКУ только если есть аудио или видео
        if (this.localStream && (this.localStream.getAudioTracks().length > 0 || videoTrack)) {
            localParticipantCard.style.display = 'block';
        } else {
            localParticipantCard.style.display = 'none';
        }
        
        // УПРАВЛЯЕМ ВИДЕО И ПЛАШКОЙ
        if (videoTrack && videoTrack.enabled && !this.isSharingScreen) {
            // ЕСТЬ ВКЛЮЧЕННАЯ КАМЕРА
            localOverlay.style.display = 'none';
            localVideo.style.display = 'block';
        } else if (this.isSharingScreen) {
            // ДЕМОНСТРАЦИЯ ЭКРАНА
            localOverlay.style.display = 'none';
            localVideo.style.display = 'block';
        } else {
            // НЕТ ВИДЕО ИЛИ КАМЕРА ВЫКЛЮЧЕНА
            localOverlay.style.display = 'flex';
            localVideo.style.display = 'none';
        }
    }
    
    // ДЛЯ УДАЛЕННЫХ УЧАСТНИКОВ
    this.remoteStreams.forEach((stream, userId) => {
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        const participantCard = document.getElementById(`participant-${userId}`);
        const overlay = participantCard?.querySelector('.video-overlay');
        
        if (videoElement && overlay && participantCard) {
            const videoTracks = stream.getVideoTracks();
            const hasVideo = videoTracks.length > 0 && videoTracks[0].readyState === 'live';
            
            if (hasVideo) {
                overlay.style.display = 'none';
                videoElement.style.display = 'block';
                participantCard.style.display = 'block';
            } else {
                overlay.style.display = 'flex';
                videoElement.style.display = 'none';
                // НЕ СКРЫВАЕМ карточку если есть аудио
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length === 0) {
                    participantCard.style.display = 'none';
                }
            }
        }
    });
    
    this.checkEmptyState();
}


    async createRoom() {
        try {
            console.log('Creating room...');
            showNotification('Creating room...', 'info');
            
            const response = await fetch('/api/create_room', { 
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            const data = await response.json();
            
            if (data.error) throw new Error(data.error);
            
            this.roomId = data.room_id;
            // Меняем URL
            window.history.pushState({}, '', `/r/${this.roomId}`);
            console.log('Room created with ID:', this.roomId);
            const shareUrl = `${window.location.origin}/r/${this.roomId}`;
            showNotification(`Комната создана: ${this.roomId}`, 'success');
            this.copyShareLink(shareUrl);
            
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error creating room:', error);
            showNotification('Failed to create room: ' + error.message, 'error');
        }
    }

    async copyShareLink(url) {
        const success = await copyToClipboard(url);
        if (success) {
            showNotification('Ссылка скопирована', 'info');
        } else {
            showNotification('Не удалось скопировать ссылку: ' + url, 'warning');
        }
    }

    async joinRoom() {
        try {
            this.roomId = document.getElementById('roomInput')?.value.trim();
            
            if (!this.roomId || !validateRoomId(this.roomId)) {
                showNotification('Введите корректный ID комнаты', 'warning');
                return;
            }
            
            console.log('Checking room existence:', this.roomId);
            showNotification('Проверка комнаты...', 'info');
            
            const response = await fetch(`/api/check_room/${this.roomId}`);
            const data = await response.json();
            
            if (!data.exists) {
                showNotification('Комната не найдена', 'error');
                return;
            }
            
            // Меняем URL
            window.history.pushState({}, '', `/r/${this.roomId}`);
            this.joinRoomAfterCreation();
            
        } catch (error) {
            console.error('Error joining room:', error);
            showNotification('Не удалось подключиться: ' + error.message, 'error');
        }
    }


joinRoomAfterCreation() {
        if (!this.socket || !this.socket.connected) {
            showNotification('Не подключено к серверу', 'error');
            return;
        }
        
        if (!this.roomId || !validateRoomId(this.roomId)) {
            showNotification('Неверный ID комнаты', 'error');
            return;
        }
        
        console.log('Joining room:', this.roomId);
        
        // Инициализируем менеджеры чата и участников
        if (!this.chatManager) {
            this.chatManager = new ChatManager(this.socket, this.roomId);
            this.chatManager.setupUI();
        }
        if (!this.participantsManager) {
            this.participantsManager = new ParticipantsManager(this.socket, this.roomId);
            this.participantsManager.setupUI();
        }
        
        this.showUserNameModal();
        
        // ВАЖНО: Обновляем состояние при создании/входе в комнату
        setTimeout(() => {
            this.checkEmptyState();
        }, 100);
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
            showNotification('Join cancelled', 'info');
        });
        
        userNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleUserJoinConfirmation(modal);
        });
    }

    handleUserJoinConfirmation(modal) {
        const userNameInput = document.getElementById('userNameInput');
        const userName = userNameInput.value.trim();
        
        if (!userName) {
            userNameInput.style.borderColor = 'var(--error)';
            userNameInput.focus();
            return;
        }
        
        document.body.removeChild(modal);
        
        this.socket.emit('join_room', {
            room_id: this.roomId,
            user_name: userName
        });
        
        this.isInCall = true;
        this.updateUI();
        showNotification(`Joined room ${this.roomId} as ${userName}`, 'success');
        
        this.showMediaPrompt();
    }


showMediaPrompt() {
    const mediaPrompt = document.createElement('div');
    mediaPrompt.className = 'media-prompt-modal';
    mediaPrompt.innerHTML = `
        <div class="modal-overlay">
            <div class="modal-content">
                <h3>Включение медиа-устройств</h3>
                <p>Выберите какие устройства включить</p>
                <div class="media-options">
                    <button id="enableBoth" class="btn btn-primary">Камера и микрофон</button>
                    <button id="enableAudioOnly" class="btn btn-secondary">Только микрофон</button>
                    <button id="joinWithoutMedia" class="btn btn-tertiary">Без медиа-устройств</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(mediaPrompt);
    
    document.getElementById('enableBoth').addEventListener('click', async () => {
        document.body.removeChild(mediaPrompt);
        try {
            await this.startVideo();
            showNotification('Камера и микрофон включены', 'success');
        } catch (error) {
            console.error('Ошибка включения устройств:', error);
            try {
                await this.startAudioOnly();
                showNotification('Микрофон включен (камера недоступна)', 'warning');
            } catch (audioError) {
                showNotification('Не удалось включить медиа-устройства', 'error');
            }
        }
    });
    
    document.getElementById('enableAudioOnly').addEventListener('click', async () => {
        document.body.removeChild(mediaPrompt);
        try {
            await this.startAudioOnly();
            showNotification('Микрофон включен', 'success');
        } catch (error) {
            showNotification('Не удалось включить микрофон', 'warning');
        }
    });
    
    document.getElementById('joinWithoutMedia').addEventListener('click', () => {
        document.body.removeChild(mediaPrompt);
        // СКРЫВАЕМ ПЛАШКУ ЕСЛИ НЕТ МЕДИА
        const localOverlay = document.getElementById('localVideoOverlay');
        if (localOverlay) {
            localOverlay.style.display = 'none';
        }
        this.hasVideoTrack = false;
        showNotification('Вы вошли без медиа-устройств', 'info');
        this.updateControlButtons();
        this.updateVideoOverlays(); // ОБНОВЛЯЕМ ОВЕРЛЕИ
    });
}

    leaveRoom() {
        console.log('🚪 Выход из комнаты...');
        
        if (this.socket && this.socket.connected && this.roomId) {
            this.socket.emit('leave_room', { room_id: this.roomId });
            // Очищаем чат на сервере
            this.socket.emit('clear_chat', { room_id: this.roomId });
            console.log('✅ Отправлен запрос на выход из комнаты');
        }
        
        this.cleanupCall();
        showNotification('Вы вышли из комнаты', 'info');
        
        // Сбрасываем roomId и возвращаемся на начальную страницу
        this.roomId = null;
        window.history.pushState({}, '', '/');
        this.setupWelcomeScreen();
        
        // Сбрасываем отображение комнаты
        const roomIdDisplay = document.getElementById('roomIdDisplay');
        if (roomIdDisplay) {
            roomIdDisplay.textContent = '-';
        }
        
        // Обновляем UI
        this.updateUI();
    }

    cleanupCall() {
        console.log('🔄 Очистка звонка...');
        
        // Останавливаем визуализатор
        this.stopAudioVisualizer();
        
        // Очищаем чат при выходе
        if (this.chatManager) {
            this.chatManager.clearMessages();
        }
        
        if (this.isSharingScreen) {
            this.stopScreenShare();
        }
    
    // ОСТАНАВЛИВАЕМ все потоки отдельно
    if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(track => {
            track.stop();
            console.log('✅ Остановлен трек камеры:', track.kind);
        });
        this.cameraStream = null;
    }
    
    if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
            track.stop();
            console.log('✅ Остановлен трек экрана:', track.kind);
        });
        this.screenStream = null;
    }
    
    if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
            track.stop();
            console.log('✅ Остановлен локальный трек:', track.kind);
        });
        this.localStream = null;
    }
    
    // Закрываем ВСЕ peer соединения
    this.remoteUsers.forEach((peerConnection, userId) => {
        try {
            peerConnection.close();
            console.log('✅ Закрыто peer соединение для:', userId);
        } catch (error) {
            console.error('❌ Ошибка закрытия peer соединения:', error);
        }
    });
    this.remoteUsers.clear();
    
    // Очищаем remote streams
    this.remoteStreams.clear();
    
    // Удаляем ВСЕ карточки удаленных участников
    const remoteParticipants = document.querySelectorAll('.remote-participant');
    remoteParticipants.forEach(participant => {
        participant.remove();
        console.log('✅ Удалена карточка участника');
    });
    
    // ОБНОВЛЯЕМ СЧЕТЧИК УЧАСТНИКОВ
    const participantsCountElement = document.getElementById('participantsCount');
    if (participantsCountElement) {
        participantsCountElement.textContent = '0';
    }
    
    // ПОЛНОСТЬЮ ОЧИЩАЕМ ЛОКАЛЬНОЕ ВИДЕО
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = null;
        localVideo.style.display = 'none';
    }
    
    const localOverlay = document.getElementById('localVideoOverlay');
    if (localOverlay) {
        localOverlay.style.display = 'flex';
    }
    
    // Скрываем карточку локального участника
    const localParticipantCard = document.getElementById('localParticipantCard');
    if (localParticipantCard) {
        localParticipantCard.style.display = 'none';
    }
    
    this.isInCall = false;
    this.isSharingScreen = false;
    
    console.log('✅ Очистка звонка завершена');
    
    // Обновляем состояние после очистки
    setTimeout(() => {
        this.checkEmptyState();
    }, 100);
}


async startVideo() {
    try {
        // ПРОВЕРЯЕМ доступность камер ДО запроса
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        
        console.log('📹 Доступность камеры:', hasCamera);
        
        if (!hasCamera) {
            console.log('🎯 Камера не найдена, запрашиваем только микрофон');
            
            // СКРЫВАЕМ ВИДЕО-ПЛАШКУ ЕСЛИ КАМЕРЫ НЕТ
            const localOverlay = document.getElementById('localVideoOverlay');
            if (localOverlay) {
                localOverlay.style.display = 'none';
            }
            
            const audioConstraints = this.selectedMicrophoneId ? {
                deviceId: { ideal: this.selectedMicrophoneId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints 
            });
            
            this.hasVideoTrack = false; // НЕТ ВИДЕОТРЕКА
            
        } else {
            // ЕСЛИ камера есть - запрашиваем оба с ВЫБРАННОЙ КАМЕРОЙ
            const constraints = {
                video: this.selectedCameraId ? {
                    deviceId: { exact: this.selectedCameraId },
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 }, 
                    frameRate: { ideal: 30 }
                } : {
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 }, 
                    frameRate: { ideal: 30 }
                },
                audio: this.selectedMicrophoneId ? {
                    deviceId: { ideal: this.selectedMicrophoneId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            console.log('🎥 Запрашиваем медиа с constraints:', constraints);
            
            try {
                // СОЗДАЕМ ОТДЕЛЬНЫЙ поток для камеры
                this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                // ЕСЛИ уже есть локальный поток (от экрана), добавляем в него камеру
                if (this.localStream) {
                    // Удаляем старые видео треки перед добавлением камеры
                    const oldVideoTracks = this.localStream.getVideoTracks();
                    oldVideoTracks.forEach(track => {
                        this.localStream.removeTrack(track);
                        if (!track.label.includes('screen') && !track.label.includes('window') && !track.label.includes('display')) {
                            track.stop();
                        }
                    });
                    
                    // Добавляем треки камеры
                    this.cameraStream.getTracks().forEach(track => {
                        this.localStream.addTrack(track);
                    });
                } else {
                    // ЕСЛИ нет локального потока - создаем из камеры
                    this.localStream = this.cameraStream;
                }
                
                const localVideo = document.getElementById('localVideo');
                const localParticipantCard = document.getElementById('localParticipantCard');
                
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                    localVideo.style.display = 'block';
                }
                
                // ПОКАЗЫВАЕМ карточку локального участника
                if (localParticipantCard) {
                    localParticipantCard.style.display = 'block';
                }
                
                this.hasVideoTrack = true; // ЕСТЬ ВИДЕОТРЕК
                
            } catch (cameraError) {
                console.error('❌ Ошибка доступа к камере, пробуем только микрофон:', cameraError);
                // Если камера недоступна, пробуем только микрофон
                await this.startAudioOnly();
                return;
            }
        }
        
        // ОБНОВЛЯЕМ UI и соединения
        this.updateControlButtons();
        this.updateVideoOverlays();
        this.addTracksToExistingConnections();
        
        if (this.remoteUsers.size > 0) {
            this.remoteUsers.forEach((peerConnection, userId) => {
                this.createOffer(userId);
            });
        }
        
        console.log('✅ Камера успешно запущена');
        
    } catch (error) {
        console.error('❌ Критическая ошибка доступа к камере:', error);
        this.hasVideoTrack = false;
        showNotification('Не удалось получить доступ к камере', 'error');
        throw error;
    }
}

    addTracksToExistingConnections() {
        if (!this.localStream) return;
        
        this.remoteUsers.forEach((peerConnection, userId) => {
            const existingSenders = peerConnection.getSenders();
            const hasVideoSender = existingSenders.some(sender => sender.track && sender.track.kind === 'video');
            const hasAudioSender = existingSenders.some(sender => sender.track && sender.track.kind === 'audio');
            
            if (!hasVideoSender) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) peerConnection.addTrack(videoTrack, this.localStream);
            }
            
            if (!hasAudioSender) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) peerConnection.addTrack(audioTrack, this.localStream);
            }
        });
    }

updateControlButtons() {
        const audioBtn = document.getElementById('toggleAudio');
        const videoBtn = document.getElementById('toggleVideo');
        
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            const videoTrack = this.localStream.getVideoTracks()[0];
            
            // ОБРАБОТКА АУДИО КНОПКИ - УМНАЯ КНОПКА
            if (audioBtn) {
                // Удаляем все классы уровней
                audioBtn.classList.remove('audio-level-0', 'audio-level-1', 'audio-level-2', 'audio-level-3', 'audio-level-4', 'audio-muted');
                
                if (audioTrack) {
                    audioBtn.style.display = 'flex';
                    if (audioTrack.enabled) {
                        // Микрофон включен - визуализатор сам установит уровень
                        // Если визуализатор не работает, устанавливаем базовый уровень
                        if (!this.audioVisualizer || !this.audioVisualizer.isRunning) {
                            audioBtn.classList.add('audio-level-0');
                        }
                    } else {
                        // Микрофон выключен - красный
                        audioBtn.classList.add('audio-muted');
                    }
                } else {
                    // Если аудио-трека нет - серый (не включен в систему)
                    audioBtn.style.display = 'flex';
                    audioBtn.classList.add('audio-level-0');
                }
            }
            
            // ОБРАБОТКА ВИДЕО КНОПКИ - УМНАЯ КНОПКА
            if (videoBtn) {
                // Удаляем все классы состояний
                videoBtn.classList.remove('video-active', 'video-inactive', 'video-disabled');
                
                if (videoTrack) {
                    videoBtn.style.display = 'flex';
                    if (videoTrack.enabled && videoTrack.readyState === 'live') {
                        // Камера включена и активна - зеленый
                        videoBtn.classList.add('video-active');
                    } else if (videoTrack.readyState === 'live') {
                        // Камера не активна - серый
                        videoBtn.classList.add('video-inactive');
                    } else {
                        // Камера выключена - красный
                        videoBtn.classList.add('video-disabled');
                    }
                } else {
                    // Если видео-трека нет - проверяем доступность камеры
                    this.mediaDevicesManager.getCameras().then(cameras => {
                        if (cameras.length > 0) {
                            // Камера есть, но не включена - серый
                            videoBtn.style.display = 'flex';
                            videoBtn.classList.add('video-inactive');
                        } else {
                            // Камеры нет в системе - красный
                            videoBtn.style.display = 'flex';
                            videoBtn.classList.add('video-disabled');
                        }
                    });
                }
            }
        } else {
            // ЕСЛИ ПОТОКА НЕТ
            if (audioBtn) {
                audioBtn.style.display = 'flex';
                audioBtn.classList.remove('audio-level-0', 'audio-level-1', 'audio-level-2', 'audio-level-3', 'audio-level-4', 'audio-muted');
                audioBtn.classList.add('audio-level-0'); // Серый
            }
            if (videoBtn) {
                // Проверяем доступность камеры
                this.mediaDevicesManager.getCameras().then(cameras => {
                    if (cameras.length > 0) {
                        videoBtn.style.display = 'flex';
                        videoBtn.classList.remove('video-active', 'video-inactive', 'video-disabled');
                        videoBtn.classList.add('video-inactive'); // Серый
                    } else {
                        videoBtn.style.display = 'flex';
                        videoBtn.classList.remove('video-active', 'video-inactive', 'video-disabled');
                        videoBtn.classList.add('video-disabled'); // Красный
                    }
                });
            }
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
    
    // ВАЖНО: Обновляем состояние после получения информации о комнате
    setTimeout(() => {
        this.checkEmptyState();
    }, 100);
}




handleUserJoined(data) {
    console.log('User joined:', data);
    document.getElementById('participantsCount').textContent = data.participants_count;
    
    showNotification(`${data.user_name || 'User'} joined the room`, 'info');
    
    if (data.user_id !== this.socketId) {
        this.userNames.set(data.user_id, data.user_name);
        this.setupPeerConnection(data.user_id);
        this.createOffer(data.user_id);
    }
    
    setTimeout(() => {
        this.checkEmptyState();
    }, 100);
}


handleUserLeft(data) {
    console.log('User left:', data);
    document.getElementById('participantsCount').textContent = data.participants_count;
    
    showNotification(`${data.user_name || 'User'} left the room`, 'info');
    
    if (this.remoteUsers.has(data.user_id)) {
        try {
            this.remoteUsers.get(data.user_id).close();
            console.log('✅ Закрыто peer соединение для:', data.user_id);
        } catch (error) {
            console.error('❌ Ошибка закрытия peer соединения:', error);
        }
        this.remoteUsers.delete(data.user_id);
    }
    
    if (this.remoteStreams.has(data.user_id)) {
        this.remoteStreams.delete(data.user_id);
    }
    
    const participantCard = document.getElementById(`participant-${data.user_id}`);
    if (participantCard) {
        participantCard.remove();
        console.log('✅ Удалена карточка участника:', data.user_id);
    }
    
    // Обновляем состояние после удаления пользователя
    setTimeout(() => {
        this.checkEmptyState();
    }, 100);
}




setupPeerConnection(targetUserId) {
    if (this.remoteUsers.has(targetUserId)) {
        console.log('Peer connection already exists for:', targetUserId);
        return;
    }

    try {
        console.log('Setting up peer connection for:', targetUserId);
        
        const peerConnection = new RTCPeerConnection(this.configuration);
        
        // ДОБАВЛЯЕМ ТОЛЬКО АКТИВНЫЕ ТРЕКИ из текущего локального потока
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                // ДОБАВЛЯЕМ только если трек включен ИЛИ это аудио (аудио всегда добавляем)
                if (track.kind === 'audio' || (track.kind === 'video' && track.enabled && !this.isSharingScreen)) {
                    console.log(`Adding ${track.kind} track to connection for ${targetUserId}`);
                    try {
                        peerConnection.addTrack(track, this.localStream);
                        console.log(`✅ ${track.kind} track added successfully`);
                    } catch (error) {
                        console.error(`❌ Error adding ${track.kind} track:`, error);
                    }
                }
            });
        } else {
            console.log('⚠️ No local stream available for peer connection');
        }
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('New ICE candidate for', targetUserId);
                this.socket.emit('ice_candidate', {
                    target_user_id: targetUserId,
                    candidate: event.candidate
                });
            }
        };
        
        peerConnection.ontrack = (event) => {
            console.log('Remote track received from:', targetUserId, 'Track kind:', event.track.kind);
            
            const remoteStream = event.streams[0];
            if (!remoteStream) {
                console.error('No stream in track event');
                return;
            }
            
            this.remoteStreams.set(targetUserId, remoteStream);
            this.createRemoteVideoElement(targetUserId, remoteStream);
            
            this.updateVideoOverlays();
        };
        
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log('Connection state with', targetUserId, ':', state);
            
            if (state === 'connected') {
                showNotification('Call connected', 'success');
            } else if (state === 'disconnected' || state === 'failed') {
                console.log('Connection lost, attempting to reconnect...');
                // Автоматическое восстановление соединения
                setTimeout(() => {
                    if (this.remoteUsers.has(targetUserId)) {
                        this.createOffer(targetUserId);
                    }
                }, 2000);
            }
        };
        
        // Обработчик удаления треков
        peerConnection.onremovetrack = (event) => {
            console.log('Track removed from:', targetUserId, 'Track kind:', event.track.kind);
            this.updateVideoOverlays();
        };
        
        this.remoteUsers.set(targetUserId, peerConnection);
        console.log('Peer connection setup completed for:', targetUserId);
        
    } catch (error) {
        console.error('Error setting up peer connection:', error);
        showNotification('Failed to setup connection', 'error');
    }
}

createRemoteVideoElement(userId, stream) {
    // УБЕЖДАЕМСЯ, что participantsGrid существует
    let participantsGrid = document.getElementById('participantsGrid');
    
    if (!participantsGrid) {
        console.warn("⚠️ participantsGrid не найден, создаем...");
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) {
            participantsGrid = document.createElement('div');
            participantsGrid.id = 'participantsGrid';
            participantsGrid.className = 'participants-grid';
            videoContainer.appendChild(participantsGrid);
            console.log("✅ participantsGrid создан");
        } else {
            console.error("❌ Не удалось создать participantsGrid: video-container не найден");
            return;
        }
    }

    if (document.getElementById(`participant-${userId}`)) {
        console.log('Participant card already exists for:', userId);
        return;
    }
    
    const participantCard = document.createElement('div');
    participantCard.className = 'participant-card remote-participant';
    participantCard.id = `participant-${userId}`;
    
    const userName = this.userNames.get(userId) || `User ${userId.substring(0, 8)}`;
    
    participantCard.innerHTML = `
        <video id="remoteVideo-${userId}" autoplay playsinline></video>
        <div class="participant-info">
            <span class="participant-name">${userName}</span>
            <div class="participant-status">
                <span class="status-audio" title="Микрофон">🎤</span>
                <span class="status-video" title="Камера">📹</span>
            </div>
        </div>
        <div class="video-overlay">
            <div class="overlay-icon">👤</div>
            <p>Ожидание видео...</p>
        </div>
    `;
    
    participantsGrid.appendChild(participantCard);
    
    const videoElement = document.getElementById(`remoteVideo-${userId}`);
    if (videoElement) {
        videoElement.srcObject = stream;

        // ДОБАВЛЯЕМ ОБРАБОТЧИКИ ДЛЯ СЛЕДЕНИЯ ЗА СОСТОЯНИЕМ ТРЕКОВ
        stream.getTracks().forEach(track => {
            track.onended = () => {
                console.log(`Трек ${track.kind} завершился для пользователя ${userId}`);
                this.updateVideoOverlays();
            };
            
            track.onmute = () => {
                console.log(`Трек ${track.kind} заглушен для пользователя ${userId}`);
                this.updateVideoOverlays();
            };
            
            track.onunmute = () => {
                console.log(`Трек ${track.kind} включен для пользователя ${userId}`);
                this.updateVideoOverlays();
            };
        });
        
        videoElement.play().catch(error => {
            console.log('Автовоспроизведение звука заблокировано:', error);
            this.showAudioActivationButton(videoElement, userId);
        });
        
        // ВАЖНО: Обновляем состояние после создания видео элемента
        setTimeout(() => {
            this.checkEmptyState();
        }, 100);
    } else {
        console.error('❌ Video element not found after creation for:', userId);
    }
}




	showAudioActivationButton(videoElement, userId) {
    	const participantCard = document.getElementById(`participant-${userId}`);
    	if (!participantCard) return;
    
    	// Удаляем старую кнопку если есть
   	const oldBtn = participantCard.querySelector('.audio-activation-btn');
    	if (oldBtn) oldBtn.remove();
    
    	const activateBtn = document.createElement('button');
    	activateBtn.className = 'audio-activation-btn';
    	activateBtn.innerHTML = '🔇 Нажми для звука';
    	activateBtn.style.cssText = `
        	position: absolute;
        	top: 10px;
       		right: 10px;
        	background: rgba(0,0,0,0.7);
        	color: white;
        	border: none;
        	padding: 8px 12px;
        	border-radius: 20px;
        	font-size: 12px;
        	cursor: pointer;
    	    	z-index: 10;
   	
	 `;
    
   	 activateBtn.addEventListener('click', async () => {
        	try {
            		await videoElement.play();
            		activateBtn.remove();
            		console.log('✅ Звук активирован для:', userId);
        	} catch (error) {
            		console.error('Ошибка активации звука:', error);
        		}
    		});
    
    		participantCard.appendChild(activateBtn);
	}


	activateAllAudio() {
    		this.remoteStreams.forEach((stream, userId) => {
        	const videoElement = document.getElementById(`remoteVideo-${userId}`);
        	if (videoElement) {
            		videoElement.play().catch(error => {
                	console.log('Не удалось воспроизвести звук для:', userId, error);
            	});
        	}
    	});
    	console.log('✅ Попытка активации звука для всех участников');
	}




    async createOffer(targetUserId) {
        if (!this.remoteUsers.has(targetUserId)) {
            console.error('No peer connection for:', targetUserId);
            return;
        }
        
        try {
            const peerConnection = this.remoteUsers.get(targetUserId);
            const offer = await peerConnection.createOffer();
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
            console.log('Received ANSWER from:', data.sender_id);
            
            if (!this.remoteUsers.has(data.sender_id)) {
                console.error('No peer connection for:', data.sender_id);
                return;
            }
            
            const peerConnection = this.remoteUsers.get(data.sender_id);
            await peerConnection.setRemoteDescription(data.answer);
            console.log('Remote description set successfully');
            
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
        
        // Проверяем, не закрыто ли уже соединение
        if (peerConnection.connectionState === 'closed' || 
            peerConnection.connectionState === 'disconnected' ||
            peerConnection.connectionState === 'failed') {
            console.log('⚠️ Peer connection is closed, ignoring ICE candidate');
            return;
        }
        
        await peerConnection.addIceCandidate(data.candidate);
        console.log('✅ ICE candidate added successfully');
        
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
        // Не показываем ошибку пользователю - это нормально при установке соединения
    }
}




async toggleAudio() {
        // Если локального потока нет - создаем его
        if (!this.localStream) {
            try {
                await this.startAudioOnly();
                showNotification('Микрофон включен', 'success');
            } catch (error) {
                showNotification('Не удалось включить микрофон', 'error');
                return;
            }
        } else {
            // Если поток есть - переключаем состояние аудио
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                const enabled = !audioTracks[0].enabled;
                audioTracks[0].enabled = enabled;
                
                // Управляем визуализатором
                if (enabled) {
                    this.startAudioVisualizer(audioTracks[0]);
                } else {
                    this.stopAudioVisualizer();
                }
                
                this.updateControlButtons();
                showNotification(enabled ? 'Микрофон включен' : 'Микрофон выключен', 'info');
                
                // Обновляем соединения только если трек включен
                if (enabled) {
                    await this.updateAudioTracksInConnections();
                }
            } else {
                // Если аудио-треков нет, но поток есть - добавляем аудио
                await this.startAudioOnly();
            }
        }
    }

    startAudioVisualizer(audioTrack) {
        if (!audioTrack || !audioTrack.enabled) return;
        
        const audioBtn = document.getElementById('toggleAudio');
        if (!audioBtn) return;
        
        // Останавливаем предыдущий визуализатор
        this.stopAudioVisualizer();
        
        // Создаем новый визуализатор
        this.audioVisualizer = new AudioVisualizer(audioTrack, audioBtn);
        this.audioVisualizer.start();
    }

    stopAudioVisualizer() {
        if (this.audioVisualizer) {
            this.audioVisualizer.stop();
            this.audioVisualizer = null;
        }
    }



async startAudioOnly() {
    try {
        const audioConstraints = this.selectedMicrophoneId ? {
            deviceId: { exact: this.selectedMicrophoneId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        } : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        console.log('🎤 Запрашиваем аудио с constraints:', audioConstraints);
        const audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: audioConstraints 
        });

        // ВСЕГДА СОЗДАЕМ НОВЫЙ ПОТОК ДЛЯ АУДИО
        if (this.localStream) {
            // Удаляем старые аудиотреки если есть
            const oldAudioTracks = this.localStream.getAudioTracks();
            oldAudioTracks.forEach(track => {
                this.localStream.removeTrack(track);
                track.stop();
            });
            
            // Добавляем новые аудиотреки
            audioStream.getAudioTracks().forEach(track => {
                this.localStream.addTrack(track);
            });
        } else {
            // Если потока нет - создаем новый
            this.localStream = audioStream;
        }

        // СКРЫВАЕМ ВИДЕО-ПЛАШКУ ПРИ ТОЛЬКО АУДИО
        const localOverlay = document.getElementById('localVideoOverlay');
        if (localOverlay) {
            localOverlay.style.display = 'none';
        }

        // ПОКАЗЫВАЕМ карточку локального участника (даже если только аудио)
        const localParticipantCard = document.getElementById('localParticipantCard');
        if (localParticipantCard) {
            localParticipantCard.style.display = 'block';
        }

        // СКРЫВАЕМ видео элемент если нет видео-треков
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.style.display = 'none';
        }

        this.hasVideoTrack = false; // НЕТ ВИДЕОТРЕКА

        // ОБНОВЛЯЕМ соединения - добавляем только аудио
        await this.updateAudioTracksInConnections();
        
        // ВАЖНО: Пересоздаем офферы для всех соединений
        if (this.remoteUsers.size > 0) {
            console.log('🔄 Пересоздаем офферы для всех соединений после обновления аудио');
            this.remoteUsers.forEach((peerConnection, userId) => {
                this.createOffer(userId);
            });
        }

        // Запускаем визуализатор аудио
        const newAudioTrack = this.localStream.getAudioTracks()[0];
        if (newAudioTrack && newAudioTrack.enabled) {
            this.startAudioVisualizer(newAudioTrack);
        }

        this.updateControlButtons();
        this.updateVideoOverlays();

        return true;
    } catch (error) {
        console.error('❌ Ошибка включения аудио:', error);
        this.hasVideoTrack = false;
        
        // ЕСЛИ ВЫБРАННЫЙ МИКРОФОН НЕДОСТУПЕН - ПРОБУЕМ ПО УМОЛЧАНИЮ
        if ((error.name === 'OverconstrainedError' || error.name === 'NotFoundError') && this.selectedMicrophoneId) {
            console.log('🔄 Выбранный микрофон недоступен, пробуем с настройками по умолчанию...');
            this.selectedMicrophoneId = null;
            return await this.startAudioOnly();
        }
        
        throw error;
    }
}



async toggleVideo() {
    // ЕСЛИ демонстрируем экран - не выключаем видео, а переключаем между камерой и экраном
    if (this.isSharingScreen) {
        showNotification('Остановите демонстрацию экрана чтобы выключить камеру', 'warning');
        return;
    }

    if (!this.localStream) {
        try {
            await this.startVideo();
        } catch (error) {
            showNotification('Cannot enable camera without media access', 'error');
        }
        return;
    }
    
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        const enabled = !videoTracks[0].enabled;
        videoTracks[0].enabled = enabled;
        
        // ОБНОВЛЯЕМ ФЛАГ
        this.hasVideoTrack = enabled;
        
        // ЕСЛИ выключаем камеру - удаляем видео-трек из соединений
        if (!enabled) {
            await this.updateVideoTracksInConnections(null);
        } else {
            // ЕСЛИ включаем камеру - добавляем видео-трек в соединения
            await this.updateVideoTracksInConnections(videoTracks[0]);
        }
        
        this.updateControlButtons();
        this.updateVideoOverlays();
        showNotification(enabled ? 'Камера включена' : 'Камера выключена', 'info');
    }
}











async shareScreen() {
    // ЕСЛИ уже демонстрируем экран - останавливаем
    if (this.isSharingScreen) {
        await this.stopScreenShare();
        return;
    }

    try {
        console.log('🖥️ Начинаем демонстрацию экрана...');
        
        // ПРОСТО получаем поток экрана
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                cursor: 'always', 
                displaySurface: 'window',
                frameRate: { ideal: 30 }
            },
            audio: false
        });

        const screenVideoTrack = screenStream.getVideoTracks()[0];
        
        if (!screenVideoTrack) {
            throw new Error('Не удалось получить видео с экрана');
        }

        // СОХРАНЯЕМ предыдущий поток для восстановления
        this.previousStream = this.localStream;
        
        // СОЗДАЕМ НОВЫЙ поток только с экраном
        const newStream = new MediaStream();
        newStream.addTrack(screenVideoTrack);
        
        // ДОБАВЛЯЕМ аудио из предыдущего потока если есть
        if (this.previousStream) {
            const audioTracks = this.previousStream.getAudioTracks();
            audioTracks.forEach(track => {
                newStream.addTrack(track);
            });
        }

        // ОБНОВЛЯЕМ локальный поток
        this.localStream = newStream;
        this.screenStream = screenStream;
        this.hasVideoTrack = true; // ЕСТЬ ВИДЕО (ЭКРАН)

        // ОБНОВЛЯЕМ видео элемент
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = this.localStream;
        }

        // ОБНОВЛЯЕМ ОВЕРЛЕИ - показываем видео
        this.updateVideoOverlays();
        
        // ОБНОВЛЯЕМ соединения с новым видео-треком
        await this.updateVideoTracksInConnections(screenVideoTrack);
        
        this.isSharingScreen = true;
        this.updateControlButtons();
        
        showNotification('Демонстрация экрана начата', 'success');
        console.log('✅ Демонстрация экрана активна');

        // Обработчик завершения демонстрации пользователем
        screenVideoTrack.onended = () => {
            console.log('Демонстрация экрана завершена пользователем');
            this.stopScreenShare();
        };

    } catch (error) {
        console.error('❌ Ошибка демонстрации экрана:', error);
        if (error.name === 'NotAllowedError') {
            showNotification('Демонстрация экрана отменена', 'info');
        } else {
            showNotification('Ошибка демонстрации экрана: ' + error.message, 'error');
        }
    }
}






// ДОБАВЛЯЕМ метод для обновления всех треков в соединениях
async updateAllTracksInConnections() {
    if (!this.localStream) {
        console.log('❌ Нет локального потока для обновления');
        return;
    }
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    const audioTrack = this.localStream.getAudioTracks()[0];
    
    console.log('🔄 Обновляем все треки в соединениях...');
    
    const updatePromises = [];
    
    this.remoteUsers.forEach((peerConnection, userId) => {
        // ОБНОВЛЯЕМ видео-трек
        const videoSender = peerConnection.getSenders().find(s => 
            s.track && s.track.kind === 'video'
        );
        if (videoSender && videoTrack) {
            console.log(`🔄 Обновляем видео-трек для пользователя: ${userId}`);
            updatePromises.push(videoSender.replaceTrack(videoTrack));
        } else if (!videoSender && videoTrack) {
            // ЕСЛИ отправителя нет - добавляем новый
            console.log(`🎯 Добавляем видео-трек для пользователя: ${userId}`);
            peerConnection.addTrack(videoTrack, this.localStream);
        }
        
        // ОБНОВЛЯЕМ аудио-трек
        const audioSender = peerConnection.getSenders().find(s => 
            s.track && s.track.kind === 'audio'
        );
        if (audioSender && audioTrack) {
            console.log(`🔄 Обновляем аудио-трек для пользователя: ${userId}`);
            updatePromises.push(audioSender.replaceTrack(audioTrack));
        } else if (!audioSender && audioTrack) {
            // ЕСЛИ отправителя нет - добавляем новый
            console.log(`🎯 Добавляем аудио-трек для пользователя: ${userId}`);
            peerConnection.addTrack(audioTrack, this.localStream);
        }
    });
    
    try {
        await Promise.all(updatePromises);
        console.log('✅ Все треки обновлены');
        
        // ЗАПУСКАЕМ переговоры для всех соединений
        this.remoteUsers.forEach((peerConnection, userId) => {
            this.createOffer(userId);
        });
        
    } catch (error) {
        console.error('❌ Ошибка обновления треков:', error);
    }
}

// ДОБАВЛЯЕМ метод для удаления всех треков из соединений
async removeAllTracksFromConnections() {
    console.log('🔄 Удаляем все треки из соединений...');
    
    this.remoteUsers.forEach((peerConnection, userId) => {
        const senders = peerConnection.getSenders();
        senders.forEach(sender => {
            if (sender.track) {
                sender.replaceTrack(null);
            }
        });
    });
    
    console.log('✅ Все треки удалены из соединений');
}




    toggleFullscreen() {
        const container = document.querySelector('.container');
        
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) container.requestFullscreen();
            container.classList.add('fullscreen-mode');
            showNotification('Fullscreen mode enabled', 'info');
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            container.classList.remove('fullscreen-mode');
            showNotification('Fullscreen mode disabled', 'info');
        }
    }

    // Используем функцию из utils.js вместо собственной
    showNotification(message, type = 'info') {
        showNotification(message, type);
    }

}
document.addEventListener('DOMContentLoaded', () => {
    window.videoCallManager = new VideoCallManager();
});
