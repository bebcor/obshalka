// Модуль для управления UI
class UIManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        // Debounce для updateVideoOverlays
        this._updateVideoOverlaysTimeout = null;
        // Скрытые audio элементы для воспроизведения аудио без карточек
        this._hiddenAudioElements = new Map();
    }

    getRandomAnimalName() {
        // Используем систему уникальности из videoCallManager
        if (this.videoCallManager && this.videoCallManager.getUniqueAnimalName) {
            return this.videoCallManager.getUniqueAnimalName();
        }
        const animals = ['жираф', 'бегемот', 'бульдог', 'собака', 'кот', 'носорог', 'сова', 'тигр', 'лев', 'рыбка', 
                        'медведь', 'волк', 'лиса', 'заяц', 'олень', 'панда', 'коала', 'обезьяна', 'слон', 'кенгуру'];
        return animals[Math.floor(Math.random() * animals.length)];
    }

    showMainScreen() {
        const welcomeScreen = document.getElementById('welcomeScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (mainContainer) mainContainer.style.display = 'flex';
    }

    showWelcomeScreen() {
        // Если мы на странице отключения, не показываем welcomeScreen
        if (this.videoCallManager.isDisconnected) {
            console.log('⚠️ На странице отключения, не показываем welcomeScreen');
            return;
        }
        
        const welcomeScreen = document.getElementById('welcomeScreen');
        const mainContainer = document.getElementById('mainContainer');
        
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (mainContainer) mainContainer.style.display = 'none';
    }

    updateUI() {
        // Update connection status
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = this.videoCallManager.isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = this.videoCallManager.isConnected ? 'status-connected' : 'status-disconnected';
        }
        
        // Show/hide call controls based on state
        const endCallBtn = document.getElementById('endCall');
        const roomControls = document.querySelector('.room-controls');
        
        if (this.videoCallManager.isInCall) {
            if (endCallBtn) endCallBtn.style.display = 'flex';
            if (roomControls) {
                roomControls.style.opacity = '0.5';
                roomControls.style.pointerEvents = 'none';
            }
        } else {
            if (endCallBtn) endCallBtn.style.display = 'none';
            if (roomControls) {
                roomControls.style.opacity = '1';
                roomControls.style.pointerEvents = 'auto';
            }
        }
        
        // Update video overlays
        this.updateVideoOverlays();
        this.updateBadges();
    }

    updateVideoOverlays() {
        // DEBOUNCE: отменяем предыдущий вызов если он еще не выполнился
        if (this._updateVideoOverlaysTimeout) {
            clearTimeout(this._updateVideoOverlaysTimeout);
        }
        
        // ЗАЩИТА ОТ РЕКУРСИИ: если уже выполняется обновление, пропускаем
        if (this._updatingVideoOverlays) {
            // Планируем повторный вызов после завершения текущего
            this._updateVideoOverlaysTimeout = setTimeout(() => {
                this.updateVideoOverlays();
            }, 100);
            return;
        }
        
        // DEBOUNCE: выполняем обновление с небольшой задержкой
        this._updateVideoOverlaysTimeout = setTimeout(() => {
            this._updateVideoOverlaysInternal();
        }, 50);
    }
    
    _updateVideoOverlaysInternal() {
        // ЗАЩИТА ОТ РЕКУРСИИ: если уже выполняется обновление, пропускаем
        if (this._updatingVideoOverlays) {
            return;
        }
        this._updatingVideoOverlays = true;
        
        try {
            const localVideo = document.getElementById('localVideo');
        const localOverlay = document.getElementById('localVideoOverlay');
        const localParticipantCard = document.getElementById('localParticipantCard');
        
        // Local video overlay
        // ВАЖНО: карточка показывается ТОЛЬКО если есть активное видео (камера или демонстрация экрана)
        // Звук может идти независимо от карточки
        if (localVideo && localOverlay && localParticipantCard) {
            const videoTrack = this.videoCallManager.localStream?.getVideoTracks()[0];
            
            // Проверяем также демонстрацию экрана
            const isSharingScreen = this.videoCallManager.isSharingScreen || false;
            
            // Карточка показывается ТОЛЬКО если есть активное видео
            const hasActiveVideo = (videoTrack && videoTrack.enabled && videoTrack.readyState === 'live' && !videoTrack.muted) || isSharingScreen;
            
            // Логирование для отладки
            if (videoTrack && !hasActiveVideo) {
                console.log('🔍 Локальная карточка: видео трек есть, но неактивен:', {
                    enabled: videoTrack.enabled,
                    readyState: videoTrack.readyState,
                    muted: videoTrack.muted,
                    isSharingScreen: isSharingScreen
                });
            }
            
            if (hasActiveVideo) {
                // Если есть активное видео - показываем карточку с видео
                localOverlay.style.setProperty('display', 'none', 'important');
                localVideo.style.setProperty('display', 'block', 'important');
                localParticipantCard.style.setProperty('display', 'block', 'important');
                localParticipantCard.style.removeProperty('visibility');
                localParticipantCard.style.removeProperty('opacity');
                localParticipantCard.style.removeProperty('width');
                localParticipantCard.style.removeProperty('height');
                localParticipantCard.style.removeProperty('overflow');
                localParticipantCard.style.removeProperty('pointer-events');
                
                // ВАЖНО: Убеждаемся что srcObject установлен для локального видео
                if (localVideo && this.videoCallManager.localStream) {
                    if (localVideo.srcObject !== this.videoCallManager.localStream) {
                        console.log('🔄 Устанавливаем srcObject для локального видео');
                        localVideo.srcObject = this.videoCallManager.localStream;
                    }
                    // Пробуем воспроизвести видео
                    localVideo.play().catch(err => {
                        console.warn('⚠️ Ошибка play для локального видео:', err);
                    });
                }
                
                console.log('✅ Локальная карточка: ПОКАЗЫВАЕМ (есть активное видео)');
            } else {
                // Если нет активного видео - полностью скрываем карточку
                // Звук продолжит работать через скрытый элемент или другим способом
                localParticipantCard.style.setProperty('display', 'none', 'important');
                localParticipantCard.style.setProperty('visibility', 'hidden', 'important');
                localParticipantCard.style.setProperty('opacity', '0', 'important');
                localParticipantCard.style.setProperty('width', '0', 'important');
                localParticipantCard.style.setProperty('height', '0', 'important');
                localParticipantCard.style.setProperty('overflow', 'hidden', 'important');
                localParticipantCard.style.setProperty('pointer-events', 'none', 'important');
                localVideo.style.setProperty('display', 'none', 'important');
                localOverlay.style.setProperty('display', 'none', 'important');
                // ВАЖНО: Очищаем srcObject для локального видео когда нет активного видео
                // Это предотвращает показ черного экрана
                // КРИТИЧНО: muted не влияет на активность - это временное состояние браузера
                if (localVideo && localVideo.srcObject) {
                    const currentStream = localVideo.srcObject;
                    const hasVideoTracks = currentStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
                    if (!hasVideoTracks) {
                        console.log('🔄 Очищаем srcObject для локального видео (нет активного видео)');
                        localVideo.srcObject = null;
                        localVideo.pause();
                    }
                }
                const computedDisplay = window.getComputedStyle(localParticipantCard).display;
                console.log('❌ Локальная карточка: СКРЫВАЕМ (нет активного видео), inline display:', localParticipantCard.style.display, 'computed:', computedDisplay);
            }
        }
        
        // ДЛЯ УДАЛЕННЫХ УЧАСТНИКОВ
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            const videoElement = document.getElementById(`remoteVideo-${userId}`);
            let participantCard = document.getElementById(`participant-${userId}`);
            const overlay = participantCard?.querySelector('.video-overlay');
            
            // ПРОВЕРКА: Есть ли активные видео треки (readyState === 'live' И enabled === true)
            const videoTracks = stream.getVideoTracks();
            const hasActiveVideo = videoTracks.length > 0 && 
                                   videoTracks[0].readyState === 'live' && 
                                   videoTracks[0].enabled;
            
            // ОБРАБОТКА АУДИО: создаем скрытый audio элемент если есть аудио треки
            const audioTracks = stream.getAudioTracks();
            const hasAudio = audioTracks.length > 0 && audioTracks[0].readyState === 'live' && audioTracks[0].enabled;
            
            if (hasAudio) {
                // Есть активное аудио - создаем/обновляем скрытый audio элемент
                let hiddenAudio = this._hiddenAudioElements.get(userId);
                if (!hiddenAudio) {
                    console.log(`🔊 [updateVideoOverlays] Создаем скрытый audio элемент для ${userId}`);
                    hiddenAudio = document.createElement('audio');
                    hiddenAudio.autoplay = true;
                    hiddenAudio.playsInline = true;
                    hiddenAudio.style.display = 'none';
                    hiddenAudio.setAttribute('muted', 'false');
                    document.body.appendChild(hiddenAudio);
                    this._hiddenAudioElements.set(userId, hiddenAudio);
                    console.log(`✅ [updateVideoOverlays] Скрытый audio элемент создан для ${userId}`);
                }
                if (hiddenAudio.srcObject !== stream) {
                    console.log(`🔄 [updateVideoOverlays] Устанавливаем srcObject для скрытого audio ${userId}`);
                    hiddenAudio.srcObject = stream;
                    hiddenAudio.play().then(() => {
                        console.log(`✅ [updateVideoOverlays] Скрытый audio воспроизводится для ${userId}`);
                    }).catch(error => {
                        if (error.name !== 'AbortError') {
                            console.warn(`⚠️ [updateVideoOverlays] Ошибка play для скрытого audio ${userId}:`, error);
                        }
                    });
                } else {
                    // Убеждаемся что audio воспроизводится
                    if (hiddenAudio.paused) {
                        console.log(`🔄 [updateVideoOverlays] Возобновляем воспроизведение скрытого audio ${userId}`);
                        hiddenAudio.play().catch(error => {
                            if (error.name !== 'AbortError') {
                                console.warn(`⚠️ [updateVideoOverlays] Ошибка возобновления play для ${userId}:`, error);
                            }
                        });
                    }
                }
            } else {
                // Нет активного аудио - удаляем скрытый audio элемент
                const hiddenAudio = this._hiddenAudioElements.get(userId);
                if (hiddenAudio) {
                    console.log(`🗑️ [updateVideoOverlays] Удаляем скрытый audio элемент для ${userId}`);
                    hiddenAudio.pause();
                    hiddenAudio.srcObject = null;
                    hiddenAudio.remove();
                    this._hiddenAudioElements.delete(userId);
                }
            }
            
            if (hasActiveVideo) {
                // ЕСТЬ АКТИВНОЕ ВИДЕО - создаем карточку если нет, показываем видео
                if (!participantCard) {
                    this.createRemoteVideoElement(userId, stream);
                    participantCard = document.getElementById(`participant-${userId}`);
                }
                
                if (participantCard && overlay && videoElement) {
                    // Показываем карточку
                    participantCard.style.setProperty('display', 'block', 'important');
                    participantCard.style.removeProperty('visibility');
                    participantCard.style.removeProperty('opacity');
                    participantCard.style.removeProperty('width');
                    participantCard.style.removeProperty('height');
                    participantCard.style.removeProperty('overflow');
                    participantCard.style.removeProperty('pointer-events');
                    
                    // Устанавливаем поток если нужно
                    if (videoElement.srcObject !== stream) {
                        videoElement.srcObject = stream;
                    }
                    
                    // Видео включено - показываем видео
                    overlay.style.display = 'none';
                    videoElement.style.setProperty('display', 'block', 'important');
                    videoElement.setAttribute('playsinline', 'true');
                    videoElement.play().catch(error => {
                        if (error.name !== 'AbortError') {
                            console.warn(`⚠️ Ошибка play для ${userId}:`, error);
                        }
                    });
                }
            } else {
                // НЕТ АКТИВНОГО ВИДЕО - удаляем карточку полностью
                // КРИТИЧНО: Очищаем srcObject ДО удаления карточки, чтобы не было черной плашки
                console.log(`🗑️ [updateVideoOverlays] НЕТ АКТИВНОГО ВИДЕО для ${userId}, удаляем карточку`);
                console.log(`   - videoTracks.length: ${videoTracks.length}`);
                if (videoTracks.length > 0) {
                    console.log(`   - videoTracks[0].enabled: ${videoTracks[0].enabled}`);
                    console.log(`   - videoTracks[0].readyState: ${videoTracks[0].readyState}`);
                }
                
                if (videoElement) {
                    console.log(`🗑️ [updateVideoOverlays] Очищаем видео элемент для ${userId}`);
                    // Останавливаем воспроизведение
                    videoElement.pause();
                    // Очищаем поток
                    videoElement.srcObject = null;
                    // Полная очистка видео элемента
                    videoElement.load();
                    // Скрываем элемент
                    videoElement.style.setProperty('display', 'none', 'important');
                    // Дополнительная очистка - убираем все атрибуты
                    videoElement.removeAttribute('src');
                    videoElement.removeAttribute('srcObject');
                    // Убеждаемся что элемент не виден
                    videoElement.style.setProperty('visibility', 'hidden', 'important');
                    videoElement.style.setProperty('opacity', '0', 'important');
                    videoElement.style.setProperty('width', '0', 'important');
                    videoElement.style.setProperty('height', '0', 'important');
                }
                
                if (participantCard && participantCard.parentNode) {
                    console.log(`🗑️ [updateVideoOverlays] Удаляем карточку ${userId} из DOM`);
                    // Убеждаемся что srcObject очищен перед удалением
                    if (videoElement) {
                        if (videoElement.srcObject) {
                            console.log(`⚠️ [updateVideoOverlays] srcObject все еще установлен для ${userId}, очищаем`);
                            videoElement.srcObject = null;
                            videoElement.load();
                        }
                        // Дополнительная проверка - если элемент все еще в DOM, удаляем его
                        if (videoElement.parentNode) {
                            console.log(`🗑️ [updateVideoOverlays] Удаляем videoElement из DOM для ${userId}`);
                            videoElement.remove();
                        }
                    }
                    participantCard.remove();
                    console.log(`✅ [updateVideoOverlays] Карточка ${userId} удалена из DOM`);
                } else if (participantCard) {
                    console.log(`⚠️ [updateVideoOverlays] Карточка ${userId} не имеет parentNode, но существует`);
                }
            }
        });
        } finally {
            // Сбрасываем флаг после завершения обновления
            this._updatingVideoOverlays = false;
        }
    }

    updateControlButtons() {
        const audioBtn = document.getElementById('toggleAudio');
        const videoBtn = document.getElementById('toggleVideo');
        
        if (this.videoCallManager.localStream) {
            const audioTracks = this.videoCallManager.localStream.getAudioTracks();
            const videoTracks = this.videoCallManager.localStream.getVideoTracks();
            const audioEnabled = audioTracks.length > 0 && audioTracks[0].enabled;
            const videoEnabled = videoTracks.length > 0 && videoTracks[0].enabled;
            const videoReady = videoTracks.length > 0 && videoTracks[0].readyState === 'live';
            
            // Обновление кнопки камеры
            if (videoBtn) {
                videoBtn.classList.remove('video-active', 'video-inactive', 'video-disabled');
                if (!videoTracks.length) {
                    // Камера не включена в систему - красный
                    videoBtn.classList.add('video-disabled');
                    videoBtn.style.background = 'var(--error)';
                } else if (videoEnabled && videoReady) {
                    // Камера включена и активна - зеленый
                    videoBtn.classList.add('video-active');
                    videoBtn.style.background = 'var(--success)';
                } else {
                    // Камера не активна - серый
                    videoBtn.classList.add('video-inactive');
                    videoBtn.style.background = 'var(--surface-light)';
                }
            }
            
            // Кнопка микрофона управляется через AudioAnalyzer
            // Здесь только базовые классы для совместимости
            if (audioBtn) {
                audioBtn.classList.toggle('active', audioEnabled);
                audioBtn.classList.toggle('muted', !audioEnabled);
            }
            
            this.updateBadges();
        } else {
            // Нет локального потока
            if (audioBtn) {
                audioBtn.classList.remove('active', 'mic-idle', 'mic-speaking');
                audioBtn.classList.add('mic-muted');
                audioBtn.style.background = 'var(--error)';
            }
            if (videoBtn) {
                videoBtn.classList.remove('video-active', 'video-inactive');
                videoBtn.classList.add('video-disabled');
                videoBtn.style.background = 'var(--error)';
            }
            this.updateBadges();
        }
    }

    updateBadges() {
        const audioBadge = document.getElementById('badge-local-audio');
        const videoBadge = document.getElementById('badge-local-video');
        if (!audioBadge || !videoBadge) return;

        if (this.videoCallManager.localStream) {
            const a = this.videoCallManager.localStream.getAudioTracks()[0];
            const v = this.videoCallManager.localStream.getVideoTracks()[0];
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
        
        // Используем имя из userNames, если его нет - берем из usersManager, иначе генерируем
        let userName = this.videoCallManager.userNames.get(userId);
        if (!userName && this.videoCallManager.usersManager) {
            const participant = this.videoCallManager.usersManager.participants.get(userId);
            if (participant) {
                userName = participant.name;
                // Сохраняем в userNames для консистентности
                this.videoCallManager.userNames.set(userId, userName);
            }
        }
        if (!userName) {
            userName = this.getRandomAnimalName();
            this.videoCallManager.userNames.set(userId, userName);
        }
        
        participantCard.innerHTML = `
            <video id="remoteVideo-${userId}" autoplay playsinline></video>
            <div class="participant-info">
                <span class="participant-name">${this.escapeHtml(userName)}</span>
                <div class="participant-status">
                    <span class="status-audio" title="Микрофон"><img src="/static/images/microphone.png" alt="Микрофон"></span>
                    <span class="status-video" title="Камера"><img src="/static/images/camera.png" alt="Камера"></span>
                </div>
            </div>
            <div class="video-overlay">
                <div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div>
                <p>Ожидание видео...</p>
            </div>
        `;
        
        // Скрываем карточку по умолчанию - она появится только если есть активное видео
        // ВАЖНО: Используем setProperty с important чтобы гарантировать скрытие
        participantCard.style.setProperty('display', 'none', 'important');
        participantCard.style.setProperty('visibility', 'hidden', 'important');
        participantCard.style.setProperty('opacity', '0', 'important');
        participantCard.style.setProperty('width', '0', 'important');
        participantCard.style.setProperty('height', '0', 'important');
        participantCard.style.setProperty('overflow', 'hidden', 'important');
        participantCard.style.setProperty('pointer-events', 'none', 'important');
        
        participantsGrid.appendChild(participantCard);
        
        // ВАЖНО: Проверяем, что карточка действительно добавлена в DOM
        const isInDOM = participantsGrid.contains(participantCard);
        console.log(`🔍 Карточка ${userId} добавлена в DOM: ${isInDOM}, parent: ${participantCard.parentElement?.id || 'null'}`);
        
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        if (videoElement) {
            // КРИТИЧНО: НЕ устанавливаем srcObject здесь!
            // Карточка скрыта, и установка srcObject создаст черную плашку
            // srcObject будет установлен в updateVideoOverlays когда карточка покажется
            
            // ДОБАВЛЯЕМ ОБРАБОТЧИКИ ДЛЯ СЛЕДЕНИЯ ЗА СОСТОЯНИЕМ ТРЕКОВ
            stream.getTracks().forEach(track => {
                // Удаляем старые обработчики если есть
                track.onended = null;
                track.onmute = null;
                track.onunmute = null;
                
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
                
                // КРИТИЧНО: Отслеживаем изменение enabled через периодическую проверку
                // потому что событие изменения enabled может не сработать
                if (track.kind === 'video') {
                    const checkEnabled = () => {
                        const participantCard = document.getElementById(`participant-${userId}`);
                        if (!participantCard || !participantCard.parentNode) {
                            // Карточка уже удалена, прекращаем проверку
                            return;
                        }
                        
                        const videoTracks = stream.getVideoTracks();
                        const hasActiveVideo = videoTracks.length > 0 && 
                                               videoTracks[0].readyState === 'live' && 
                                               videoTracks[0].enabled;
                        
                        if (!hasActiveVideo) {
                            // Видео выключено - обновляем UI
                            console.log(`🔄 [checkEnabled] Видео выключено для ${userId}, обновляем UI`);
                            this.updateVideoOverlays();
                        }
                    };
                    
                    // Проверяем каждые 500ms
                    const enabledCheckInterval = setInterval(() => {
                        if (!stream.getTracks().includes(track) || track.readyState === 'ended') {
                            clearInterval(enabledCheckInterval);
                            return;
                        }
                        checkEnabled();
                    }, 500);
                    
                    // Очищаем интервал когда трек заканчивается
                    track.onended = () => {
                        clearInterval(enabledCheckInterval);
                        console.log(`Трек ${track.kind} завершился для пользователя ${userId}`);
                        this.updateVideoOverlays();
                    };
                }
            });
            
            // ВАЖНО: Обновляем состояние после создания видео элемента
            setTimeout(() => {
                if (this.videoCallManager.checkEmptyState) {
                    this.videoCallManager.checkEmptyState();
                }
            }, 100);
        } else {
            console.error('❌ Video element not found after creation for:', userId);
        }
    }

    updateParticipantName(userId, userName) {
        const participantCard = document.getElementById(`participant-${userId}`);
        if (participantCard) {
            const nameElement = participantCard.querySelector('.participant-name');
            if (nameElement) {
                nameElement.textContent = this.escapeHtml(userName);
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showAudioActivationButton(videoElement, userId) {
        const participantCard = document.getElementById(`participant-${userId}`);
        if (!participantCard || !videoElement) return;
    
        // Удаляем старую кнопку если есть
        const oldBtn = participantCard.querySelector('.audio-activation-btn');
        if (oldBtn) oldBtn.remove();
    
        const activateBtn = document.createElement('button');
        activateBtn.className = 'audio-activation-btn';
        activateBtn.innerHTML = '<img src="/static/images/sound_off.png" alt="Звук" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;"> Нажми для звука';
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
            } catch (error) {
                console.error('Ошибка активации звука:', error);
            }
        });
    
        participantCard.appendChild(activateBtn);
    }
    
    updateGridLayout() {
        // НЕ изменяем grid стили - они управляются CSS через .participants-grid
        // CSS уже настроен правильно: grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))
        // Просто убеждаемся что participantsGrid существует
        const participantsGrid = document.getElementById('participantsGrid');
        if (!participantsGrid) {
            console.warn('participantsGrid не найден при обновлении grid layout');
            return;
        }
        
        // CSS автоматически адаптирует сетку в зависимости от количества элементов
        // Дополнительные стили не нужны - CSS делает все сам
        console.log('Grid layout обновлен (управляется CSS)');
    }
}


