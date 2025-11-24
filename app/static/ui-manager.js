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
        console.log(`\n🟡 ========== НАЧАЛО updateVideoOverlays ==========`);
        console.log(`🔄 ОБНОВЛЕНИЕ ВИДЕО - ТОЛЬКО АКТИВНЫЕ КАМЕРЫ`);
        
        // ЗАЩИТА ОТ РЕКУРСИИ: если уже выполняется обновление, пропускаем
        if (this._updatingVideoOverlays) {
            console.log(`⚠️ [updateVideoOverlays] Уже выполняется, пропускаем (защита от рекурсии)`);
            return;
        }
        this._updatingVideoOverlays = true;
        
        try {
            // 1. СБРОСИТЬ ВСЕ КАРТОЧКИ
            this.hideAllParticipantCards();
            
            // 2. СОБРАТЬ ВСЕ АКТИВНЫЕ КАМЕРЫ (включая локальную)
            const activeCameras = this.getAllActiveCameras();
            
            // 3. ОТОБРАЗИТЬ ТОЛЬКО АКТИВНЫЕ КАМЕРЫ
            this.displayOnlyActiveCameras(activeCameras);
            
            // 4. ОБНОВИТЬ ЛАЙАУТ
            this.updateGridLayout(activeCameras.size);
            
            // 5. ОБРАБОТКА АУДИО (независимо от видео)
            this.handleAudioTracks();
            
            console.log(`\n🟡 ========== КОНЕЦ updateVideoOverlays ==========\n`);
            console.log(`📅 Время завершения: ${new Date().toISOString()}\n`);
        } finally {
            // Сбрасываем флаг после завершения обновления
            this._updatingVideoOverlays = false;
            console.log(`✅ [updateVideoOverlays] Флаг _updatingVideoOverlays сброшен`);
        }
    }
    
    // ========== НОВАЯ ЛОГИКА: ТОЛЬКО АКТИВНЫЕ КАМЕРЫ ==========
    
    hideAllParticipantCards() {
        console.log(`🔄 Скрываем все карточки`);
        
        // Скрыть локальную карточку
        const localCard = document.getElementById('localParticipantCard');
        if (localCard) {
            console.log(`   🚫 Скрываем локальную карточку`);
            localCard.style.setProperty('display', 'none', 'important');
            localCard.style.setProperty('visibility', 'hidden', 'important');
            localCard.style.setProperty('opacity', '0', 'important');
        }
        
        // Скрыть все удаленные карточки
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            const remoteCard = document.getElementById(`participant-${userId}`);
            if (remoteCard) {
                console.log(`   🚫 Скрываем удаленную карточку ${userId}`);
                remoteCard.style.setProperty('display', 'none', 'important');
                remoteCard.style.setProperty('visibility', 'hidden', 'important');
                remoteCard.style.setProperty('opacity', '0', 'important');
                
                // КРИТИЧНО: Сбрасываем srcObject чтобы не было черной плашки
                const videoElement = document.getElementById(`remoteVideo-${userId}`);
                if (videoElement && videoElement.srcObject) {
                    console.log(`   🗑️ Сбрасываем srcObject для ${userId} (карточка скрыта)`);
                    videoElement.srcObject = null;
                }
            }
        });
        
        console.log(`✅ Все карточки скрыты`);
    }
    
    getAllActiveCameras() {
        const activeCameras = new Map();
        
        // Локальная камера
        if (this.hasActiveCamera(this.videoCallManager.localStream)) {
            activeCameras.set('local', this.videoCallManager.localStream);
            console.log(`✅ Локальная камера активна`);
        } else {
            console.log(`❌ Локальная камера неактивна`);
        }
        
        // Удаленные камеры
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            console.log(`\n🔍 Проверка удаленного потока ${userId}:`);
            
            if (!stream) {
                console.log(`   ❌ Поток отсутствует`);
                return;
            }
            
            // Информация о треках в потоке (может быть устаревшей)
            const videoTracks = stream.getVideoTracks();
            console.log(`   📹 Количество видео треков в потоке: ${videoTracks.length}`);
            
            // КРИТИЧНО: Проверяем треки из receivers (актуальное состояние)
            const peerConnection = this.videoCallManager.remoteUsers.get(userId);
            if (peerConnection) {
                const receivers = peerConnection.getReceivers();
                const videoReceivers = receivers.filter(r => r.track && r.track.kind === 'video');
                console.log(`   📹 Количество видео receivers: ${videoReceivers.length}`);
                
                // Детальная информация о каждом треке из receivers
                videoReceivers.forEach((receiver, index) => {
                    const track = receiver.track;
                    console.log(`   📹 Receiver #${index} (id: ${track.id}):`);
                    console.log(`      - readyState: ${track.readyState}`);
                    console.log(`      - enabled: ${track.enabled}`);
                    console.log(`      - muted: ${track.muted}`);
                    
                    const isActive = track.readyState === 'live' && track.enabled;
                    console.log(`      - активен: ${isActive ? '✅' : '❌'} (проверяем только readyState и enabled)`);
                });
            } else {
                console.log(`   ⚠️ Нет peerConnection, проверяем треки из потока (fallback)`);
                videoTracks.forEach((track, index) => {
                    console.log(`   📹 Трек #${index} (id: ${track.id}):`);
                    console.log(`      - readyState: ${track.readyState}`);
                    console.log(`      - enabled: ${track.enabled}`);
                    console.log(`      - muted: ${track.muted}`);
                });
            }
            
            // КРИТИЧНО: Передаем userId для проверки треков из receivers
            const isActive = this.hasActiveCamera(stream, userId);
            console.log(`   🎯 Итоговый результат для ${userId}: ${isActive ? '✅ АКТИВЕН' : '❌ НЕАКТИВЕН'}`);
            
            if (isActive) {
                activeCameras.set(userId, stream);
            }
        });
        
        console.log(`\n📹 Активные камеры: ${activeCameras.size} (локальная: ${activeCameras.has('local')})`);
        return activeCameras;
    }
    
    hasActiveCamera(stream, userId = null) {
        if (!stream) {
            console.log(`   [hasActiveCamera] Поток отсутствует - возвращаем false`);
            return false;
        }
        
        const isLocalStream = stream === this.videoCallManager.localStream;
        
        // Для локального потока проверяем треки из потока
        if (isLocalStream) {
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length === 0) {
                console.log(`   [hasActiveCamera] Локальный поток: нет видео треков - возвращаем false`);
                return false;
            }
            
            // Проверяем все треки
            const hasActiveTrack = videoTracks.some(track => {
                const isActive = track.readyState === 'live' && 
                                track.enabled && 
                                !track.muted;
                return isActive;
            });
            
            // Если есть активный трек, возвращаем true
            if (hasActiveTrack) {
                console.log(`   [hasActiveCamera] Локальный поток: найден активный трек - возвращаем true`);
                return true;
            }
            
            // Проверяем демонстрацию экрана
            const isSharingScreen = this.videoCallManager.isSharingScreen || false;
            console.log(`   [hasActiveCamera] Локальный поток, isSharingScreen: ${isSharingScreen}`);
            if (isSharingScreen) {
                const hasLiveTrack = videoTracks.some(track => track.readyState === 'live');
                console.log(`   [hasActiveCamera] Демонстрация экрана, есть live трек: ${hasLiveTrack}`);
                return hasLiveTrack;
            }
            
            console.log(`   [hasActiveCamera] Локальный поток: нет активных треков - возвращаем false`);
            return false;
        }
        
        // КРИТИЧНО: Для удаленных потоков проверяем треки из RECEIVERS, а не из потока!
        // Треки в потоке могут быть устаревшими, актуальное состояние в receivers
        if (!userId) {
            // Находим userId по потоку
            for (const [id, remoteStream] of this.videoCallManager.remoteStreams.entries()) {
                if (remoteStream === stream) {
                    userId = id;
                    break;
                }
            }
        }
        
        if (!userId) {
            console.log(`   [hasActiveCamera] Удаленный поток: userId не найден - возвращаем false`);
            return false;
        }
        
        // Получаем peerConnection для проверки receivers
        const peerConnection = this.videoCallManager.remoteUsers.get(userId);
        if (!peerConnection) {
            console.log(`   [hasActiveCamera] Удаленный поток ${userId}: нет peerConnection - проверяем треки из потока`);
            // Fallback: проверяем треки из потока если нет peerConnection
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length === 0) {
                console.log(`   [hasActiveCamera] Удаленный поток ${userId}: нет видео треков - возвращаем false`);
                return false;
            }
            const hasActiveTrack = videoTracks.some(track => {
                const isActive = track.readyState === 'live' && 
                                track.enabled && 
                                !track.muted;
                return isActive;
            });
            console.log(`   [hasActiveCamera] Удаленный поток ${userId} (fallback): ${hasActiveTrack ? 'активен' : 'неактивен'}`);
            return hasActiveTrack;
        }
        
        // КРИТИЧНО: Проверяем треки из receivers - это актуальное состояние
        const receivers = peerConnection.getReceivers();
        const videoReceivers = receivers.filter(r => r.track && r.track.kind === 'video');
        
        console.log(`   [hasActiveCamera] Удаленный поток ${userId}: проверяем ${videoReceivers.length} видео receivers`);
        
        if (videoReceivers.length === 0) {
            console.log(`   [hasActiveCamera] Удаленный поток ${userId}: нет видео receivers - возвращаем false`);
            return false;
        }
        
        // Проверяем все видео треки из receivers
        const hasActiveTrack = videoReceivers.some(receiver => {
            const track = receiver.track;
            if (!track) return false;
            
            // КРИТИЧНО: Проверяем readyState === 'live' И enabled === true
            // muted не проверяем для удаленных треков - это временное состояние браузера
            const isActive = track.readyState === 'live' && track.enabled;
            
            console.log(`   [hasActiveCamera] Удаленный поток ${userId}, трек ${track.id}: readyState=${track.readyState}, enabled=${track.enabled}, muted=${track.muted}, активен=${isActive}`);
            
            return isActive;
        });
        
        console.log(`   [hasActiveCamera] Удаленный поток ${userId}: ${hasActiveTrack ? '✅ АКТИВЕН' : '❌ НЕАКТИВЕН'}`);
        return hasActiveTrack;
    }
    
    displayOnlyActiveCameras(activeCameras) {
        console.log(`🔄 [displayOnlyActiveCameras] Отображаем ${activeCameras.size} активных камер`);
        
        // Локальная камера
        if (activeCameras.has('local')) {
            console.log(`   ✅ [displayOnlyActiveCameras] Показываем локальную камеру`);
            this.showLocalCamera(activeCameras.get('local'));
        } else {
            console.log(`   ❌ [displayOnlyActiveCameras] Локальная камера неактивна, не показываем`);
        }
        
        // Удаленные камеры
        activeCameras.forEach((stream, userId) => {
            if (userId !== 'local') {
                console.log(`   ✅ [displayOnlyActiveCameras] Показываем удаленную камеру ${userId}`);
                this.showRemoteCamera(userId, stream);
            }
        });
        
        // ВАЖНО: Убеждаемся, что все НЕактивные карточки скрыты и srcObject сброшен
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            if (!activeCameras.has(userId)) {
                const remoteCard = document.getElementById(`participant-${userId}`);
                if (remoteCard) {
                    const computedStyle = window.getComputedStyle(remoteCard);
                    if (computedStyle.display !== 'none') {
                        console.log(`   ⚠️ [displayOnlyActiveCameras] Карточка ${userId} неактивна, но все еще видима! Принудительно скрываем`);
                        remoteCard.style.setProperty('display', 'none', 'important');
                        remoteCard.style.setProperty('visibility', 'hidden', 'important');
                        remoteCard.style.setProperty('opacity', '0', 'important');
                        
                        const videoElement = document.getElementById(`remoteVideo-${userId}`);
                        if (videoElement && videoElement.srcObject) {
                            console.log(`   🗑️ [displayOnlyActiveCameras] Сбрасываем srcObject для неактивной карточки ${userId}`);
                            videoElement.srcObject = null;
                        }
                    }
                }
            }
        });
        
        console.log(`✅ [displayOnlyActiveCameras] Отображение камер завершено`);
    }
    
    showLocalCamera(stream) {
        console.log(`🔄 Показываем локальную камеру`);
        
        const localCard = document.getElementById('localParticipantCard');
        const localVideo = document.getElementById('localVideo');
        const localOverlay = document.getElementById('localVideoOverlay');
        
        if (localCard && localVideo) {
            localCard.style.setProperty('display', 'block', 'important');
            localCard.style.removeProperty('visibility');
            localCard.style.removeProperty('opacity');
            localCard.style.removeProperty('width');
            localCard.style.removeProperty('height');
            
            if (localVideo.srcObject !== stream) {
                localVideo.srcObject = stream;
            }
            localVideo.style.setProperty('display', 'block', 'important');
            
            // Скрыть оверлей ожидания
            if (localOverlay) {
                localOverlay.style.setProperty('display', 'none', 'important');
            }
            
            // Пробуем воспроизвести видео
            localVideo.play().catch(err => {
                console.warn('⚠️ Ошибка play для локального видео:', err);
            });
            
            console.log(`✅ Локальная камера показана`);
        }
    }
    
    showRemoteCamera(userId, stream) {
        console.log(`🔄 [showRemoteCamera] Показываем удаленную камеру ${userId}`);
        
        let card = document.getElementById(`participant-${userId}`);
        
        // Создать карточку если не существует
        if (!card) {
            console.log(`   🆕 [showRemoteCamera] Карточка ${userId} не существует, создаем`);
            this.createRemoteVideoElement(userId, stream);
            card = document.getElementById(`participant-${userId}`);
        }
        
        if (card) {
            const videoElement = document.getElementById(`remoteVideo-${userId}`);
            const overlay = card.querySelector('.video-overlay');
            
            console.log(`   ✅ [showRemoteCamera] Показываем карточку ${userId} (display: block)`);
            card.style.setProperty('display', 'block', 'important');
            card.style.removeProperty('visibility');
            card.style.removeProperty('opacity');
            card.style.removeProperty('width');
            card.style.removeProperty('height');
            
            if (videoElement) {
                if (videoElement.srcObject !== stream) {
                    console.log(`   📹 [showRemoteCamera] Устанавливаем srcObject для ${userId}`);
                    videoElement.srcObject = stream;
                } else {
                    console.log(`   ✅ [showRemoteCamera] srcObject уже установлен для ${userId}`);
                }
                videoElement.style.setProperty('display', 'block', 'important');
                
                // Пробуем воспроизвести видео
                videoElement.play().catch(err => {
                    console.warn(`⚠️ Ошибка play для удаленного видео ${userId}:`, err);
                });
            } else {
                console.warn(`   ⚠️ [showRemoteCamera] Видео элемент не найден для ${userId}`);
            }
            
            if (overlay) {
                overlay.style.setProperty('display', 'none', 'important');
            }
            
            console.log(`✅ [showRemoteCamera] Удаленная камера ${userId} показана`);
        } else {
            console.error(`   ❌ [showRemoteCamera] Не удалось найти или создать карточку для ${userId}`);
        }
    }
    
    handleAudioTracks() {
        // Обработка аудио для всех участников (независимо от видео)
        // Локальное аудио обрабатывается автоматически через localVideo
        
        // Удаленные аудио треки
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            const audioTracks = stream.getAudioTracks();
            
            if (audioTracks.length > 0) {
                const audioTrack = audioTracks[0];
                
                // Проверяем трек из receiver для получения актуального состояния
                const peerConnection = this.videoCallManager.webrtcManager?.peerConnections?.get(userId);
                let audioTrackFromReceiver = audioTrack;
                
                if (peerConnection) {
                    const receivers = peerConnection.getReceivers();
                    const audioReceiver = receivers.find(r => r.track && r.track.kind === 'audio' && r.track.id === audioTrack.id);
                    if (audioReceiver && audioReceiver.track) {
                        audioTrackFromReceiver = audioReceiver.track;
                    }
                }
                
                const hasAudio = audioTrackFromReceiver.readyState === 'live' && 
                                audioTrackFromReceiver.enabled && 
                                !audioTrackFromReceiver.muted;
                
                if (hasAudio) {
                    // Есть активное аудио - создаем/обновляем скрытый audio элемент
                    let hiddenAudio = this._hiddenAudioElements.get(userId);
                    if (!hiddenAudio) {
                        hiddenAudio = document.createElement('audio');
                        hiddenAudio.autoplay = true;
                        hiddenAudio.playsInline = true;
                        hiddenAudio.style.display = 'none';
                        hiddenAudio.muted = false;
                        document.body.appendChild(hiddenAudio);
                        this._hiddenAudioElements.set(userId, hiddenAudio);
                    }
                    
                    if (hiddenAudio.srcObject !== stream) {
                        hiddenAudio.srcObject = stream;
                        hiddenAudio.muted = false;
                    }
                    
                    if (hiddenAudio.paused) {
                        hiddenAudio.play().catch(err => {
                            console.warn(`⚠️ Ошибка play для скрытого audio ${userId}:`, err);
                        });
                    }
                } else {
                    // Нет активного аудио - удаляем скрытый audio элемент
                    const hiddenAudio = this._hiddenAudioElements.get(userId);
                    if (hiddenAudio) {
                        hiddenAudio.pause();
                        hiddenAudio.srcObject = null;
                        hiddenAudio.remove();
                        this._hiddenAudioElements.delete(userId);
                    }
                }
            } else {
                // Нет аудио треков - удаляем скрытый audio элемент
                const hiddenAudio = this._hiddenAudioElements.get(userId);
                if (hiddenAudio) {
                    hiddenAudio.pause();
                    hiddenAudio.srcObject = null;
                    hiddenAudio.remove();
                    this._hiddenAudioElements.delete(userId);
                }
            }
        });
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
        console.log(`🆕 СОЗДАНИЕ КАРТОЧКИ ДЛЯ ${userId}`);
        
        // Убеждаемся что participantsGrid существует
        let participantsGrid = document.getElementById('participantsGrid');
        if (!participantsGrid) {
            const videoContainer = document.querySelector('.video-container');
            if (videoContainer) {
                participantsGrid = document.createElement('div');
                participantsGrid.id = 'participantsGrid';
                participantsGrid.className = 'participants-grid';
                videoContainer.appendChild(participantsGrid);
            } else {
                console.error(`❌ Не удалось создать participantsGrid: video-container не найден`);
                return;
            }
        }

        const existingCard = document.getElementById(`participant-${userId}`);
        if (existingCard) {
            console.log(`⚠️ Карточка ${userId} уже существует`);
            return;
        }
        
        const participantCard = document.createElement('div');
        participantCard.className = 'participant-card remote-participant';
        participantCard.id = `participant-${userId}`;
        participantCard.style.display = 'none'; // По умолчанию скрыта
        
        // Имя пользователя
        let userName = this.videoCallManager.userNames.get(userId);
        if (!userName && this.videoCallManager.usersManager) {
            const participant = this.videoCallManager.usersManager.participants.get(userId);
            if (participant) {
                userName = participant.name;
                this.videoCallManager.userNames.set(userId, userName);
            }
        }
        if (!userName) {
            userName = this.getRandomAnimalName();
            this.videoCallManager.userNames.set(userId, userName);
        }
        
        participantCard.innerHTML = `
            <video id="remoteVideo-${userId}" autoplay playsinline style="display: none;"></video>
            <div class="video-overlay" style="display: flex;">
                <div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div>
                <p>Ожидание видео...</p>
            </div>
            <div class="participant-info">
                <span class="participant-name">${this.escapeHtml(userName)}</span>
            </div>
        `;
        
        participantsGrid.appendChild(participantCard);
        
        // Настройка обработчиков треков
        this.setupTrackHandlers(userId, stream);
        
        console.log(`✅ Карточка ${userId} создана`);
    }
    
    setupTrackHandlers(userId, stream) {
        stream.getTracks().forEach(track => {
            if (track.kind === 'video') {
                // Простые обработчики - просто обновляем отображение
                track.onmute = () => {
                    console.log(`🔇 Камера ${userId} отключена`);
                    this.updateVideoOverlays();
                };
                
                track.onunmute = () => {
                    console.log(`🎥 Камера ${userId} включена`);
                    this.updateVideoOverlays();
                };
                
                track.onended = () => {
                    console.log(`❌ Камера ${userId} завершена`);
                    this.updateVideoOverlays();
                };
            }
        });
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
    
    updateGridLayout(activeCameraCount) {
        console.log(`🎛️ Обновляем лайаут для ${activeCameraCount} камер`);
        
        const participantsGrid = document.getElementById('participantsGrid');
        if (!participantsGrid) {
            console.warn('participantsGrid не найден при обновлении grid layout');
            return;
        }
        
        // Убрать все специальные классы
        participantsGrid.classList.remove('single-camera', 'two-cameras', 'multiple-cameras');
        
        // Добавить класс в зависимости от количества камер
        if (activeCameraCount === 1) {
            participantsGrid.classList.add('single-camera');
        } else if (activeCameraCount === 2) {
            participantsGrid.classList.add('two-cameras');
        } else if (activeCameraCount > 2) {
            participantsGrid.classList.add('multiple-cameras');
        }
        
        console.log(`✅ Лайаут обновлен для ${activeCameraCount} камер`);
    }
}


