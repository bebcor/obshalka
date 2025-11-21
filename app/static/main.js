// Главный класс VideoCallManager, объединяющий все модули
class VideoCallManager {
    constructor() {
        this.localStream = null;
        this.remoteStreams = new Map();
        this.peerConnection = null;
        this.roomId = null;
        this.remoteUsers = new Map();
        this.socket = null;
        this.socketId = null;
        this.isConnected = false;
        this.isInCall = false;
        this.userName = null;
        this.userNames = new Map();
        this.availableMicrophones = [];
        this.selectedMicrophoneId = null;
        this.availableCameras = [];
        this.selectedCameraId = null;
        this.isSharingScreen = false;
        this.screenStream = null;
        this.cameraStream = null;
        this.previousStream = null; // Для восстановления после демонстрации экрана
        this.hasVideoTrack = false;
        
        // Конфигурация ICE серверов - ИСПОЛЬЗУЕМ ДОМЕННОЕ ИМЯ вместо IP
        this.configuration = {
            iceServers: [
                // Ваш собственный STUN сервер (доменное имя)
                {
                    urls: 'stun:obshalka.online:3478'
                },
                // Ваш собственный TURN сервер (UDP) - доменное имя
                {
                    urls: 'turn:obshalka.online:3478',
                    username: 'webrtc',
                    credential: 'webrtcpassword'
                },
                // Ваш собственный TURN сервер (TCP) - доменное имя
                {
                    urls: 'turn:obshalka.online:3478?transport=tcp',
                    username: 'webrtc',
                    credential: 'webrtcpassword'
                },
                // Ваш собственный TURN сервер (TLS) - доменное имя
                {
                    urls: 'turns:obshalka.online:5349',
                    username: 'webrtc',
                    credential: 'webrtcpassword'
                },
                // Резервные публичные серверы (на случай проблем с вашим)
                {
                    urls: 'stun:stun.l.google.com:19302'
                },
                {
                    urls: 'stun:global.stun.twilio.com:3478'
                }
            ],
            iceTransportPolicy: 'all',
            iceCandidatePoolSize: 10
        };
        
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
        this.mediaDevicesManager = new MediaDevicesManager();
        
        this.initialize();
    }

    initialize() {
        this.setupEventListeners();
        this.setupSocketConnection();
        this.uiManager.updateUI();
        this.roomManager.bootstrapFromURL();
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
                // Сохраняем socket в window для отладки
                window.socket = this.socket;
                this.uiManager.updateUI();
            });
            
            this.socket.on('disconnect', () => {
                this.isConnected = false;
                this.isInCall = false;
                console.log('Disconnected from server');
                this.cleanupCall();
                this.uiManager.updateUI();
                this.notificationManager.show('Connection lost', 'error');
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
            
            this.socket.on('chat_message', (data) => {
                this.handleChatMessage(data);
            });
            
            this.socket.on('error', (data) => {
                console.error('Server error:', data.message);
                this.notificationManager.show('Error: ' + data.message, 'error');
            });
            
        } catch (error) {
            console.error('Error setting up socket connection:', error);
        }
    }
    
    async checkMediaDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const microphones = devices.filter(device => device.kind === 'audioinput');
            const cameras = devices.filter(device => device.kind === 'videoinput');
            
            console.log('🎯 Доступные устройства:');
            console.log('   Микрофоны:', microphones.map(m => ({id: m.deviceId, label: m.label})));
            console.log('   Камеры:', cameras.map(c => ({id: c.deviceId, label: c.label})));
            
            // Сохраняем списки устройств
            this.availableMicrophones = microphones;
            this.availableCameras = cameras;
            
            return { microphones, cameras };
        } catch (error) {
            console.error('❌ Ошибка проверки устройств:', error);
            return { microphones: [], cameras: [] };
        }
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
                        <div class="logo-icon-large">📹</div>
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

    setupWelcomeScreen() {
        // Проверяем, есть ли room_id в URL
        const path = window.location.pathname;
        const roomMatch = path.match(/^\/r\/([A-Za-z0-9_-]{3,50})$/);
        
        if (roomMatch) {
            // Если есть room_id в URL, сразу показываем основную страницу
            this.uiManager.showMainScreen();
            return;
        }

        // Иначе показываем стартовое окно
        const welcomeScreen = document.getElementById('welcomeScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';

        // Обработчики для стартового окна
        const welcomeCreateBtn = document.getElementById('welcomeCreateRoom');
        const welcomeJoinBtn = document.getElementById('welcomeJoinRoom');
        const welcomeJoinConfirm = document.getElementById('welcomeJoinConfirm');
        const welcomeJoinCancel = document.getElementById('welcomeJoinCancel');
        const joinRoomForm = document.getElementById('joinRoomForm');
        const welcomeRoomInput = document.getElementById('welcomeRoomInput');

        if (welcomeCreateBtn) {
            welcomeCreateBtn.addEventListener('click', () => {
                this.roomManager.createRoomFromWelcome();
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
                if (roomId && /^[A-Za-z0-9_-]{3,50}$/.test(roomId)) {
                    this.roomManager.joinRoomFromWelcome(roomId);
                } else {
                    this.notificationManager.show('Введите корректный ID комнаты', 'warning');
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
                    if (roomId && /^[A-Za-z0-9_-]{3,50}$/.test(roomId)) {
                        this.roomManager.joinRoomFromWelcome(roomId);
                    }
                }
            });
        }

        // Проверяем дублирование окна (если уже открыта вкладка с комнатой)
        this.checkDuplicateWindow();
    }

    checkDuplicateWindow() {
        // Проверяем есть ли уже открытая вкладка с этой же комнатой
        const path = window.location.pathname;
        const roomMatch = path.match(/^\/r\/([A-Za-z0-9_-]{3,50})$/);
        
        if (!roomMatch) return;
        
        const roomId = roomMatch[1];
        // Используем BroadcastChannel для проверки дублирования
        const channel = new BroadcastChannel('obshalka_rooms');
        let duplicateFound = false;
        let checkTimeout;
        
        // Слушаем сообщения от других вкладок
        channel.onmessage = (event) => {
            if (event.data.type === 'room_opened' && event.data.roomId === roomId && !duplicateFound) {
                duplicateFound = true;
                clearTimeout(checkTimeout);
                // Показываем модальное окно подтверждения
                this.showDuplicateWindowModal(roomId);
            }
            
            if (event.data.type === 'check_room' && event.data.roomId === roomId) {
                // Отвечаем что комната уже открыта
                channel.postMessage({ type: 'room_exists', roomId: roomId });
            }
        };
        
        // Отправляем запрос на проверку
        channel.postMessage({ type: 'check_room', roomId: roomId });
        
        // Ждем ответа 500мс, если нет ответа - продолжаем
        checkTimeout = setTimeout(() => {
            if (!duplicateFound) {
                // Отправляем сообщение о том что мы открыли эту комнату
                channel.postMessage({ type: 'room_opened', roomId: roomId });
            }
        }, 500);
    }

    showDuplicateWindowModal(roomId) {
        // Скрываем стартовое окно пока показываем модальное
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay duplicate-window-modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>⚠️ Подключение к встрече</h3>
                <p>Вы уже подключены к этой встрече в другой вкладке.</p>
                <p>Вы хотите подключиться к встрече <strong>${roomId}</strong> в этой вкладке?</p>
                <div class="modal-buttons">
                    <button id="confirmDuplicateJoin" class="btn btn-primary">
                        <span class="icon">✓</span>
                        <span class="btn-text">Подключиться</span>
                    </button>
                    <button id="cancelDuplicateJoin" class="btn btn-secondary">
                        <span class="btn-text">Отмена</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        document.getElementById('confirmDuplicateJoin').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.uiManager.showMainScreen();
            this.roomManager.joinRoomFromWelcome(roomId);
        });

        document.getElementById('cancelDuplicateJoin').addEventListener('click', () => {
            document.body.removeChild(modal);
            window.location.href = '/';
        });
    }

    setupEventListeners() {
        // End call button
        const endCallBtn = document.getElementById('endCall');

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

        // Кнопка настроек
        this.setupSettingsButton();
    }

    setupSettingsButton() {
        // Проверяем, не создана ли уже кнопка
        if (document.getElementById('settingsBtn')) {
            return;
        }

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

        document.getElementById('selectMicrophoneSettings').addEventListener('click', async () => {
            document.body.removeChild(modal);
            await this.showMicrophoneSelection();
        });

        document.getElementById('selectCameraSettings').addEventListener('click', async () => {
            document.body.removeChild(modal);
            await this.showCameraSelection();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    async showMicrophoneSelection() {
        // Обновляем список микрофонов
        await this.mediaDevicesManager.getMicrophones();
        const microphones = this.mediaDevicesManager.availableMicrophones;
        
        if (microphones.length <= 1) {
            this.notificationManager.show('Доступен только один микрофон', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'microphone-selection-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>🎤 Выберите микрофон</h3>
                    <div class="microphone-list">
                        ${microphones.map((mic, index) => `
                            <div class="microphone-item" data-device-id="${mic.deviceId}">
                                <input type="radio" id="mic-${index}" name="microphone" 
                                       ${this.selectedMicrophoneId === mic.deviceId ? 'checked' : ''}>
                                <label for="mic-${index}">
                                    ${escapeHtml(mic.label || `Микрофон ${index + 1}`)}
                                    ${this.selectedMicrophoneId === mic.deviceId ? ' ✅' : ''}
                                </label>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-buttons">
                        <button id="cancelMicSelect" class="btn btn-secondary">Отмена</button>
                        <button id="confirmMicSelect" class="btn btn-primary">Выбрать</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        document.getElementById('confirmMicSelect').addEventListener('click', async () => {
            const selected = modal.querySelector('input[name="microphone"]:checked');
            if (!selected) {
                this.notificationManager.show('Выберите микрофон', 'warning');
                return;
            }

            const selectedItem = selected.closest('.microphone-item');
            const deviceId = selectedItem.dataset.deviceId;
            const selectedLabel = selectedItem.querySelector('label').textContent;
            
            this.selectedMicrophoneId = deviceId;
            this.mediaDevicesManager.selectedMicrophoneId = deviceId;
            document.body.removeChild(modal);
            
            this.notificationManager.show(`Выбран микрофон: ${selectedLabel}`, 'success');
            console.log('🎤 Выбран микрофон:', deviceId, selectedLabel);

            if (this.localStream) {
                await this.mediaController.restartAudioWithSelectedMicrophone();
            }
        });

        document.getElementById('cancelMicSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    async showCameraSelection() {
        // Обновляем список камер
        await this.mediaDevicesManager.getCameras();
        const cameras = this.mediaDevicesManager.availableCameras;
        
        if (cameras.length <= 1) {
            this.notificationManager.show('Доступна только одна камера', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'camera-selection-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>📷 Выберите камеру</h3>
                    <div class="camera-list">
                        ${cameras.map((camera, index) => `
                            <div class="camera-item" data-device-id="${camera.deviceId}">
                                <input type="radio" id="camera-${index}" name="camera" 
                                       ${this.selectedCameraId === camera.deviceId ? 'checked' : ''}>
                                <label for="camera-${index}">
                                    ${escapeHtml(camera.label || `Камера ${index + 1}`)}
                                    ${this.selectedCameraId === camera.deviceId ? ' ✅' : ''}
                                </label>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-buttons">
                        <button id="cancelCameraSelect" class="btn btn-secondary">Отмена</button>
                        <button id="confirmCameraSelect" class="btn btn-primary">Выбрать</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        document.getElementById('confirmCameraSelect').addEventListener('click', async () => {
            const selected = modal.querySelector('input[name="camera"]:checked');
            if (!selected) {
                this.notificationManager.show('Выберите камеру', 'warning');
                return;
            }

            const selectedItem = selected.closest('.camera-item');
            const deviceId = selectedItem.dataset.deviceId;
            const selectedLabel = selectedItem.querySelector('label').textContent;
            
            this.selectedCameraId = deviceId;
            this.mediaDevicesManager.selectedCameraId = deviceId;
            document.body.removeChild(modal);
            
            this.notificationManager.show(`Выбрана камера: ${selectedLabel}`, 'success');
            console.log('📷 Выбрана камера:', deviceId, selectedLabel);

            if (this.localStream && this.localStream.getVideoTracks().length > 0) {
                await this.mediaController.restartVideoWithSelectedCamera();
            }
        });

        document.getElementById('cancelCameraSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    handleRoomInfo(data) {
        console.log('Room info received:', data);
        // УСТАНАВЛИВАЕМ isInCall ТОЛЬКО ПОСЛЕ ПОДТВЕРЖДЕНИЯ ОТ СЕРВЕРА
        this.isInCall = true;
        
        document.getElementById('roomIdDisplay').textContent = this.roomId;
        document.getElementById('participantsCount').textContent = data.participants.length;
        
        // Обновляем список пользователей (включая текущего пользователя)
        this.usersManager.updateParticipants(data.participants);
        
        // Добавляем текущего пользователя в список, если его там нет
        const hasCurrentUser = data.participants.some(p => p.socket_id === this.socketId);
        if (!hasCurrentUser && this.userName) {
            this.usersManager.addParticipant(this.socketId, this.userName);
        }
        
        // СОЗДАЕМ peer connections для всех участников
        // НО если локального потока еще нет - создадим соединения позже, когда поток появится
        data.participants.forEach(participant => {
            if (participant.socket_id !== this.socketId) {
                // Создаем соединение даже без локального потока - треки добавим позже
                this.webrtcManager.setupPeerConnection(participant.socket_id);
            }
        });
        
        this.uiManager.updateUI();
        
        // ПОКАЗЫВАЕМ уведомление о присоединении
        this.notificationManager.show(`Присоединились к комнате ${this.roomId} как ${this.userName}`, 'success');
        
        // ПОКАЗЫВАЕМ медиа-промпт ПОСЛЕ присоединения к комнате
        this.roomManager.showMediaPrompt();
    }

    handleUserJoined(data) {
        console.log('User joined:', data);
        document.getElementById('participantsCount').textContent = data.participants_count;
        
        this.notificationManager.show(`${data.user_name || 'User'} joined the room`, 'info');
        
        // Обновляем список пользователей (не добавляем себя)
        if (data.user_id !== this.socketId) {
            this.usersManager.addParticipant(data.user_id, data.user_name);
        }
        
        if (data.user_id !== this.socketId) {
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
        
        const participantCard = document.getElementById(`participant-${data.user_id}`);
        if (participantCard) {
            participantCard.remove();
            console.log('✅ Удалена карточка участника:', data.user_id);
        }
        
        // Обновляем grid layout
        this.uiManager.updateGridLayout();
        
        this.uiManager.updateVideoOverlays();
        
        // Обновляем состояние после удаления пользователя
        setTimeout(() => {
            this.checkEmptyState();
        }, 100);
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
        const isOwn = data.user_id === this.socketId;
        this.chatManager.addMessage(data.user_name, data.message, isOwn, data.timestamp);
    }

    cleanupCall() {
        console.log('🔄 Очистка звонка...');
        
        // Останавливаем анализ аудио
        if (this.audioAnalyzer) {
            this.audioAnalyzer.cleanup();
        }
        
        // Останавливаем демонстрацию экрана если активна
        if (this.isSharingScreen) {
            if (this.mediaController) {
                this.mediaController.stopScreenShare();
            }
        }
        
        // ОСТАНАВЛИВАЕМ все потоки отдельно (как в оригинале)
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
        
        // Удаляем ВСЕ карточки удаленных участников
        const remoteParticipants = document.querySelectorAll('.remote-participant');
        remoteParticipants.forEach(participant => {
            participant.remove();
            console.log('✅ Удалена карточка участника');
        });
        
        // Очищаем remote streams
        this.remoteStreams.clear();
        
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
        
        // Очищаем чат
        if (this.chatManager) {
            this.chatManager.clearChat();
            this.chatManager.closeChatModal();
        }
        
        // Очищаем список участников
        if (this.usersManager) {
            this.usersManager.participants.clear();
        }
        
        // Обновляем grid layout
        this.uiManager.updateGridLayout();
        
        this.isInCall = false;
        this.isSharingScreen = false;
        this.previousStream = null;
        this.hasVideoTrack = false;
        
        console.log('✅ Очистка звонка завершена');
        
        // Обновляем состояние после очистки
        setTimeout(() => {
            this.checkEmptyState();
        }, 100);
        
        // Update UI
        const roomIdDisplay = document.getElementById('roomIdDisplay');
        if (roomIdDisplay) roomIdDisplay.textContent = '-';
        if (participantsCountElement) participantsCountElement.textContent = '0';
        this.uiManager.updateUI();
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.videoCallManager = new VideoCallManager();
    // Сохраняем для отладки
    window.VideoCallManager = VideoCallManager;
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

