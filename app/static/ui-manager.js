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
        console.log(`📊 [updateVideoOverlays] Вызов функции`);
        
        // ЗАЩИТА ОТ РЕКУРСИИ: если уже выполняется обновление, пропускаем
        if (this._updatingVideoOverlays) {
            console.log(`⚠️ [updateVideoOverlays] Уже выполняется, пропускаем (защита от рекурсии)`);
            return;
        }
        this._updatingVideoOverlays = true;
        console.log(`✅ [updateVideoOverlays] Флаг _updatingVideoOverlays установлен`);
        
        console.log(`📊 [updateVideoOverlays] Количество remoteStreams: ${this.videoCallManager.remoteStreams.size}`);
        
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
            console.log(`\n🔵 ========== ОБРАБОТКА УЧАСТНИКА ${userId} ==========`);
            
            let videoElement = document.getElementById(`remoteVideo-${userId}`);
            let participantCard = document.getElementById(`participant-${userId}`);
            let overlay = participantCard?.querySelector('.video-overlay');
            
            console.log(`📊 [${userId}] Состояние DOM элементов:`);
            console.log(`   - videoElement exists: ${!!videoElement}`);
            console.log(`   - participantCard exists: ${!!participantCard}`);
            console.log(`   - overlay exists: ${!!overlay}`);
            if (videoElement) {
                console.log(`   - videoElement.srcObject: ${videoElement.srcObject ? 'SET' : 'NULL'}`);
                console.log(`   - videoElement.style.display: ${videoElement.style.display || 'not set'}`);
                console.log(`   - videoElement.paused: ${videoElement.paused}`);
            }
            if (participantCard) {
                const computedStyle = window.getComputedStyle(participantCard);
                console.log(`   - participantCard.style.display: ${participantCard.style.display || 'not set'}`);
                console.log(`   - participantCard.computed.display: ${computedStyle.display}`);
                console.log(`   - participantCard.parentNode: ${participantCard.parentNode ? participantCard.parentNode.id || 'exists' : 'NULL'}`);
            }
            
            // ПРОВЕРКА: Есть ли активные видео треки (readyState === 'live' И enabled === true И НЕ muted)
            // КРИТИЧНО: Проверяем трек напрямую из receiver, а не из потока, чтобы получить актуальное muted состояние
            const peerConnection = this.videoCallManager.remoteUsers.get(userId);
            let hasActiveVideo = false;
            let trackFromStream = null;
            let trackFromReceiver = null;
            
            const videoTracks = stream.getVideoTracks();
            console.log(`📹 [${userId}] Проверка видео треков:`);
            console.log(`   - videoTracks.length: ${videoTracks.length}`);
            
            if (videoTracks.length > 0) {
                trackFromStream = videoTracks[0];
                console.log(`   - track.id: ${trackFromStream.id}`);
                console.log(`   - track.enabled: ${trackFromStream.enabled}`);
                console.log(`   - track.readyState: ${trackFromStream.readyState}`);
                console.log(`   - track.muted (из потока): ${trackFromStream.muted}`);
                console.log(`   - track.label: ${trackFromStream.label}`);
                
                // КРИТИЧНО: Проверяем трек напрямую из receiver для получения актуального muted состояния
                if (peerConnection) {
                    const receivers = peerConnection.getReceivers();
                    const videoReceiver = receivers.find(r => r.track && r.track.kind === 'video' && r.track.id === trackFromStream.id);
                    if (videoReceiver && videoReceiver.track) {
                        trackFromReceiver = videoReceiver.track;
                        console.log(`   - track.muted (из receiver): ${trackFromReceiver.muted}`);
                        console.log(`   - track.enabled (из receiver): ${trackFromReceiver.enabled}`);
                        console.log(`   - track.readyState (из receiver): ${trackFromReceiver.readyState}`);
                        
                        // Используем состояние из receiver - оно более актуальное
                        hasActiveVideo = trackFromReceiver.readyState === 'live' && 
                                        trackFromReceiver.enabled && 
                                        !trackFromReceiver.muted;
                        console.log(`   - hasActiveVideo (из receiver): ${hasActiveVideo}`);
                    } else {
                        console.log(`   ⚠️ Receiver для видео трека не найден, используем состояние из потока`);
                        hasActiveVideo = trackFromStream.readyState === 'live' && 
                                       trackFromStream.enabled && 
                                       !trackFromStream.muted;
                    }
                } else {
                    console.log(`   ⚠️ PeerConnection не найден, используем состояние из потока`);
                    hasActiveVideo = trackFromStream.readyState === 'live' && 
                                   trackFromStream.enabled && 
                                   !trackFromStream.muted;
                }
                
                console.log(`   - hasActiveVideo: ${hasActiveVideo} (readyState='live': ${trackFromReceiver ? trackFromReceiver.readyState === 'live' : trackFromStream.readyState === 'live'}, enabled: ${trackFromReceiver ? trackFromReceiver.enabled : trackFromStream.enabled}, !muted: ${trackFromReceiver ? !trackFromReceiver.muted : !trackFromStream.muted})`);
            } else {
                console.log(`   - НЕТ видео треков`);
            }
            
            // ОБРАБОТКА АУДИО: создаем скрытый audio элемент если есть аудио треки
            const audioTracks = stream.getAudioTracks();
            console.log(`🔊 [${userId}] Проверка аудио треков:`);
            console.log(`   - audioTracks.length: ${audioTracks.length}`);
            
            if (audioTracks.length > 0) {
                const audioTrack = audioTracks[0];
                console.log(`   - track.id: ${audioTrack.id}`);
                console.log(`   - track.enabled: ${audioTrack.enabled}`);
                console.log(`   - track.readyState: ${audioTrack.readyState}`);
                console.log(`   - track.muted: ${audioTrack.muted}`);
                
                // КРИТИЧНО: Проверяем трек из receiver для получения актуального состояния
                let audioTrackFromReceiver = audioTrack;
                if (peerConnection) {
                    const receivers = peerConnection.getReceivers();
                    const audioReceiver = receivers.find(r => r.track && r.track.kind === 'audio' && r.track.id === audioTrack.id);
                    if (audioReceiver && audioReceiver.track) {
                        audioTrackFromReceiver = audioReceiver.track;
                        console.log(`   - track.enabled (из receiver): ${audioTrackFromReceiver.enabled}`);
                        console.log(`   - track.readyState (из receiver): ${audioTrackFromReceiver.readyState}`);
                        console.log(`   - track.muted (из receiver): ${audioTrackFromReceiver.muted}`);
                    }
                }
                
                const hasAudio = audioTrackFromReceiver.readyState === 'live' && 
                                audioTrackFromReceiver.enabled && 
                                !audioTrackFromReceiver.muted;
                console.log(`   - hasAudio: ${hasAudio} (readyState='live': ${audioTrackFromReceiver.readyState === 'live'}, enabled: ${audioTrackFromReceiver.enabled}, !muted: ${!audioTrackFromReceiver.muted})`);
                
                if (hasAudio) {
                    // Есть активное аудио - создаем/обновляем скрытый audio элемент
                    let hiddenAudio = this._hiddenAudioElements.get(userId);
                    if (!hiddenAudio) {
                        console.log(`🔊 [updateVideoOverlays] Создаем скрытый audio элемент для ${userId}`);
                        hiddenAudio = document.createElement('audio');
                        hiddenAudio.autoplay = true;
                        hiddenAudio.playsInline = true;
                        hiddenAudio.style.display = 'none';
                        // КРИТИЧНО: НЕ устанавливаем muted атрибут - он блокирует звук!
                        // hiddenAudio.setAttribute('muted', 'false'); // УДАЛЕНО - это блокирует звук
                        hiddenAudio.muted = false; // Используем свойство, а не атрибут
                        document.body.appendChild(hiddenAudio);
                        this._hiddenAudioElements.set(userId, hiddenAudio);
                        console.log(`✅ [updateVideoOverlays] Скрытый audio элемент создан для ${userId}`);
                        console.log(`   - hiddenAudio.muted: ${hiddenAudio.muted}`);
                        console.log(`   - hiddenAudio.autoplay: ${hiddenAudio.autoplay}`);
                    }
                    
                    // КРИТИЧНО: Всегда обновляем srcObject если поток изменился
                    // Также проверяем что srcObject содержит правильные аудио треки
                    const needsUpdate = hiddenAudio.srcObject !== stream || 
                                       !hiddenAudio.srcObject || 
                                       (hiddenAudio.srcObject && hiddenAudio.srcObject.getAudioTracks().length === 0);
                    
                    if (needsUpdate) {
                        console.log(`🔄 [updateVideoOverlays] Устанавливаем srcObject для скрытого audio ${userId}`);
                        console.log(`   - Старый srcObject: ${hiddenAudio.srcObject ? 'SET' : 'NULL'}`);
                        if (hiddenAudio.srcObject) {
                            const oldTracks = hiddenAudio.srcObject.getAudioTracks();
                            console.log(`   - Старый srcObject audioTracks.length: ${oldTracks.length}`);
                        }
                        console.log(`   - Новый stream audioTracks.length: ${stream.getAudioTracks().length}`);
                        
                        hiddenAudio.srcObject = stream;
                        console.log(`   - Новый srcObject: ${hiddenAudio.srcObject ? 'SET' : 'NULL'}`);
                        console.log(`   - hiddenAudio.muted: ${hiddenAudio.muted}`);
                        
                        // Проверяем что srcObject содержит аудио треки
                        if (hiddenAudio.srcObject) {
                            const newTracks = hiddenAudio.srcObject.getAudioTracks();
                            console.log(`   - Новый srcObject audioTracks.length: ${newTracks.length}`);
                            if (newTracks.length > 0) {
                                const newTrack = newTracks[0];
                                console.log(`   - Новый audioTrack.enabled: ${newTrack.enabled}`);
                                console.log(`   - Новый audioTrack.readyState: ${newTrack.readyState}`);
                                console.log(`   - Новый audioTrack.muted: ${newTrack.muted}`);
                            }
                        }
                        
                        // КРИТИЧНО: Убеждаемся что muted = false
                        hiddenAudio.muted = false;
                        
                        // Пытаемся воспроизвести
                        hiddenAudio.play().then(() => {
                            console.log(`✅ [updateVideoOverlays] Скрытый audio воспроизводится для ${userId}`);
                            console.log(`   - hiddenAudio.paused: ${hiddenAudio.paused}`);
                            console.log(`   - hiddenAudio.readyState: ${hiddenAudio.readyState}`);
                            console.log(`   - hiddenAudio.muted: ${hiddenAudio.muted}`);
                            console.log(`   - hiddenAudio.volume: ${hiddenAudio.volume}`);
                        }).catch(error => {
                            console.error(`❌ [updateVideoOverlays] Ошибка play для скрытого audio ${userId}:`, error);
                            console.error(`   - error.name: ${error.name}`);
                            console.error(`   - error.message: ${error.message}`);
                            // Пробуем еще раз через небольшую задержку
                            setTimeout(() => {
                                console.log(`🔄 [updateVideoOverlays] Повторная попытка play() для ${userId}`);
                                hiddenAudio.play().then(() => {
                                    console.log(`✅ [updateVideoOverlays] Скрытый audio воспроизводится после повтора для ${userId}`);
                                }).catch(err => {
                                    console.error(`❌ [updateVideoOverlays] Ошибка повторного play для ${userId}:`, err);
                                });
                            }, 100);
                        });
                    } else {
                        // Убеждаемся что audio воспроизводится и не muted
                        console.log(`ℹ️ [updateVideoOverlays] srcObject уже установлен для ${userId}, проверяем состояние`);
                        console.log(`   - hiddenAudio.paused: ${hiddenAudio.paused}`);
                        console.log(`   - hiddenAudio.muted: ${hiddenAudio.muted}`);
                        console.log(`   - hiddenAudio.readyState: ${hiddenAudio.readyState}`);
                        console.log(`   - hiddenAudio.srcObject: ${hiddenAudio.srcObject ? 'SET' : 'NULL'}`);
                        
                        // Проверяем что srcObject содержит аудио треки
                        if (hiddenAudio.srcObject) {
                            const srcAudioTracks = hiddenAudio.srcObject.getAudioTracks();
                            console.log(`   - srcObject audioTracks.length: ${srcAudioTracks.length}`);
                            if (srcAudioTracks.length > 0) {
                                const srcAudioTrack = srcAudioTracks[0];
                                console.log(`   - srcObject audioTrack.enabled: ${srcAudioTrack.enabled}`);
                                console.log(`   - srcObject audioTrack.readyState: ${srcAudioTrack.readyState}`);
                                console.log(`   - srcObject audioTrack.muted: ${srcAudioTrack.muted}`);
                            }
                        }
                        
                        // КРИТИЧНО: Убеждаемся что muted = false
                        if (hiddenAudio.muted) {
                            console.log(`⚠️ [updateVideoOverlays] hiddenAudio.muted = true, устанавливаем false`);
                            hiddenAudio.muted = false;
                        }
                        
                        // КРИТИЧНО: Всегда вызываем play() чтобы убедиться что звук воспроизводится
                        // readyState: 4 не гарантирует что звук реально воспроизводится
                        console.log(`🔄 [updateVideoOverlays] Принудительно вызываем play() для скрытого audio ${userId}`);
                        hiddenAudio.play().then(() => {
                            console.log(`✅ [updateVideoOverlays] Скрытый audio воспроизводится для ${userId}`);
                            console.log(`   - hiddenAudio.paused: ${hiddenAudio.paused}`);
                            console.log(`   - hiddenAudio.readyState: ${hiddenAudio.readyState}`);
                            console.log(`   - hiddenAudio.muted: ${hiddenAudio.muted}`);
                            console.log(`   - hiddenAudio.volume: ${hiddenAudio.volume}`);
                        }).catch(error => {
                            console.error(`❌ [updateVideoOverlays] Ошибка play для скрытого audio ${userId}:`, error);
                            console.error(`   - error.name: ${error.name}`);
                            console.error(`   - error.message: ${error.message}`);
                            // Пробуем еще раз через небольшую задержку
                            setTimeout(() => {
                                console.log(`🔄 [updateVideoOverlays] Повторная попытка play() для ${userId}`);
                                hiddenAudio.play().then(() => {
                                    console.log(`✅ [updateVideoOverlays] Скрытый audio воспроизводится после повтора для ${userId}`);
                                }).catch(err => {
                                    console.error(`❌ [updateVideoOverlays] Ошибка повторного play для ${userId}:`, err);
                                });
                            }, 100);
                        });
                    }
                } else {
                    // Нет активного аудио - удаляем скрытый audio элемент
                    console.log(`🔇 [updateVideoOverlays] Нет активного аудио для ${userId}, удаляем скрытый audio элемент`);
                    const hiddenAudio = this._hiddenAudioElements.get(userId);
                    if (hiddenAudio) {
                        console.log(`🗑️ [updateVideoOverlays] Удаляем скрытый audio элемент для ${userId}`);
                        hiddenAudio.pause();
                        hiddenAudio.srcObject = null;
                        hiddenAudio.remove();
                        this._hiddenAudioElements.delete(userId);
                    }
                }
            } else {
                console.log(`🔇 [${userId}] Нет аудио треков в потоке`);
                // Нет аудио треков - удаляем скрытый audio элемент
                const hiddenAudio = this._hiddenAudioElements.get(userId);
                if (hiddenAudio) {
                    console.log(`🗑️ [updateVideoOverlays] Удаляем скрытый audio элемент для ${userId} (нет треков)`);
                    hiddenAudio.pause();
                    hiddenAudio.srcObject = null;
                    hiddenAudio.remove();
                    this._hiddenAudioElements.delete(userId);
                }
            }
            
            // КРИТИЧНО: Дополнительная проверка - если трек muted, но карточка существует, удаляем ее
            if (trackFromReceiver && trackFromReceiver.muted && participantCard) {
                console.log(`\n⚠️⚠️⚠️ [${userId}] ОБНАРУЖЕН MUTED ТРЕК ПРИ СУЩЕСТВУЮЩЕЙ КАРТОЧКЕ - ПРИНУДИТЕЛЬНОЕ УДАЛЕНИЕ ⚠️⚠️⚠️`);
                console.log(`   - track.muted (из receiver): ${trackFromReceiver.muted}`);
                console.log(`   - participantCard exists: ${!!participantCard}`);
                
                // Немедленно очищаем srcObject и удаляем карточку
                if (videoElement && videoElement.srcObject) {
                    console.log(`   🔄 Очищаем srcObject...`);
                    videoElement.pause();
                    videoElement.srcObject = null;
                    videoElement.load();
                }
                
                if (participantCard && participantCard.parentNode) {
                    console.log(`   🔄 Удаляем карточку...`);
                    participantCard.remove();
                    console.log(`   ✅ Карточка удалена`);
                }
                
                // Удаляем трек из потока
                if (stream.getTracks().includes(trackFromStream || trackFromReceiver)) {
                    stream.removeTrack(trackFromStream || trackFromReceiver);
                }
                
                console.log(`⚠️⚠️⚠️ [${userId}] ПРИНУДИТЕЛЬНОЕ УДАЛЕНИЕ ЗАВЕРШЕНО ⚠️⚠️⚠️\n`);
                return; // Прерываем обработку этого участника
            }
            
            // КРИТИЧНО: Проверяем состояние трека ЕЩЕ РАЗ перед показом карточки
            // Трек мог стать muted между проверкой hasActiveVideo и показом карточки
            // ВСЕГДА используем трек из receiver если он есть - он более актуален
            const trackToCheck = trackFromReceiver || trackFromStream;
            console.log(`🔍 [${userId}] Выбор трека для финальной проверки:`);
            console.log(`   - trackFromReceiver: ${trackFromReceiver ? 'ЕСТЬ' : 'НЕТ'}`);
            console.log(`   - trackFromStream: ${trackFromStream ? 'ЕСТЬ' : 'НЕТ'}`);
            console.log(`   - trackToCheck: ${trackToCheck ? 'ЕСТЬ' : 'НЕТ'}`);
            if (trackToCheck) {
                console.log(`   - trackToCheck.muted: ${trackToCheck.muted}`);
                console.log(`   - trackToCheck.enabled: ${trackToCheck.enabled}`);
                console.log(`   - trackToCheck.readyState: ${trackToCheck.readyState}`);
            }
            
            // КРИТИЧНО: Если есть receiver, используем его состояние - оно более актуальное
            let finalIsTrackMuted = true;
            let finalIsTrackLive = false;
            let finalIsTrackEnabled = false;
            
            if (trackFromReceiver) {
                // Используем состояние из receiver - оно более актуальное
                finalIsTrackMuted = trackFromReceiver.muted;
                finalIsTrackLive = trackFromReceiver.readyState === 'live';
                finalIsTrackEnabled = trackFromReceiver.enabled;
                console.log(`   ✅ Используем состояние из receiver (muted=${finalIsTrackMuted}, enabled=${finalIsTrackEnabled}, live=${finalIsTrackLive})`);
            } else if (trackFromStream) {
                // Используем состояние из потока если receiver нет
                finalIsTrackMuted = trackFromStream.muted;
                finalIsTrackLive = trackFromStream.readyState === 'live';
                finalIsTrackEnabled = trackFromStream.enabled;
                console.log(`   ⚠️ Используем состояние из потока (receiver не найден) (muted=${finalIsTrackMuted}, enabled=${finalIsTrackEnabled}, live=${finalIsTrackLive})`);
            } else {
                console.log(`   ❌ Нет трека для проверки`);
            }
            
            // КРИТИЧНО: Проверяем состояние соединения - используем только для определения когда устанавливать srcObject
            // Карточка должна показываться даже если соединение еще устанавливается (показываем overlay)
            let isConnectionReady = false;
            if (peerConnection) {
                const iceState = peerConnection.iceConnectionState;
                const connState = peerConnection.connectionState;
                isConnectionReady = (iceState === 'connected' || iceState === 'completed') && 
                                   (connState === 'connected');
                console.log(`🔍 [${userId}] Состояние соединения:`);
                console.log(`   - iceConnectionState: ${iceState}`);
                console.log(`   - connectionState: ${connState}`);
                console.log(`   - isConnectionReady: ${isConnectionReady}`);
            } else {
                console.log(`⚠️ [${userId}] PeerConnection не найден, считаем соединение не готовым`);
            }
            
            // КРИТИЧНО: Карточка показывается если трек активен, НЕ зависимо от состояния соединения
            // Состояние соединения используется только для определения когда устанавливать srcObject
            const finalHasActiveVideo = finalIsTrackLive && finalIsTrackEnabled && !finalIsTrackMuted;
            
            console.log(`🔍 [${userId}] ФИНАЛЬНАЯ ПРОВЕРКА перед показом карточки:`);
            console.log(`   - track.muted: ${finalIsTrackMuted}`);
            console.log(`   - track.readyState: ${trackToCheck ? trackToCheck.readyState : 'N/A'}`);
            console.log(`   - track.enabled: ${finalIsTrackEnabled}`);
            console.log(`   - isConnectionReady: ${isConnectionReady} (используется только для srcObject)`);
            console.log(`   - finalHasActiveVideo: ${finalHasActiveVideo}`);
            
            if (finalHasActiveVideo) {
                console.log(`✅ [${userId}] ЕСТЬ АКТИВНОЕ ВИДЕО - показываем карточку`);
                
                // ЕСТЬ АКТИВНОЕ ВИДЕО - создаем карточку если нет, показываем видео
                if (!participantCard) {
                    console.log(`🆕 [${userId}] Карточка не существует, создаем...`);
                    this.createRemoteVideoElement(userId, stream);
                    participantCard = document.getElementById(`participant-${userId}`);
                    console.log(`✅ [${userId}] Карточка создана: ${!!participantCard}`);
                    
                    // КРИТИЧНО: Обновляем переменные после создания карточки
                    if (participantCard) {
                        videoElement = document.getElementById(`remoteVideo-${userId}`);
                        overlay = participantCard.querySelector('.video-overlay');
                        console.log(`🔄 [${userId}] Обновлены переменные после создания: videoElement=${!!videoElement}, overlay=${!!overlay}`);
                    }
                } else {
                    console.log(`ℹ️ [${userId}] Карточка уже существует`);
                }
                
                if (participantCard && overlay && videoElement) {
                    console.log(`🔄 [${userId}] Показываем карточку и видео`);
                    
                    // Показываем карточку
                    const beforeDisplay = window.getComputedStyle(participantCard).display;
                    participantCard.style.setProperty('display', 'block', 'important');
                    participantCard.style.removeProperty('visibility');
                    participantCard.style.removeProperty('opacity');
                    participantCard.style.removeProperty('width');
                    participantCard.style.removeProperty('height');
                    participantCard.style.removeProperty('overflow');
                    participantCard.style.removeProperty('pointer-events');
                    const afterDisplay = window.getComputedStyle(participantCard).display;
                    console.log(`   - participantCard display: ${beforeDisplay} -> ${afterDisplay}`);
                    
                    // КРИТИЧНО: Устанавливаем srcObject ТОЛЬКО если трек активен И соединение готово
                    // Проверяем ЕЩЕ РАЗ перед установкой srcObject
                    const currentIsTrackMuted = trackToCheck ? trackToCheck.muted : true;
                    const currentIsTrackLive = trackToCheck ? trackToCheck.readyState === 'live' : false;
                    const currentIsTrackEnabled = trackToCheck ? trackToCheck.enabled : false;
                    const canSetSrcObject = !currentIsTrackMuted && currentIsTrackLive && currentIsTrackEnabled && isConnectionReady;
                    
                    console.log(`🔍 [${userId}] Проверка состояния трека перед установкой srcObject:`);
                    console.log(`   - track.muted: ${currentIsTrackMuted}`);
                    console.log(`   - track.readyState: ${trackToCheck ? trackToCheck.readyState : 'N/A'}`);
                    console.log(`   - track.enabled: ${currentIsTrackEnabled}`);
                    console.log(`   - isConnectionReady: ${isConnectionReady}`);
                    console.log(`   - canSetSrcObject: ${canSetSrcObject}`);
                    console.log(`   - videoElement.srcObject: ${videoElement.srcObject ? 'SET' : 'NULL'}`);
                    
                    // ЕСЛИ трек muted ИЛИ не live ИЛИ не enabled - НЕ устанавливаем srcObject
                    if (currentIsTrackMuted || !currentIsTrackLive || !currentIsTrackEnabled) {
                        console.log(`⚠️ [${userId}] ТРЕК НЕ АКТИВЕН (muted=${currentIsTrackMuted}, live=${currentIsTrackLive}, enabled=${currentIsTrackEnabled}) - НЕ УСТАНАВЛИВАЕМ srcObject`);
                        // Если srcObject уже установлен - ОБЯЗАТЕЛЬНО очищаем его
                        if (videoElement.srcObject) {
                            console.log(`   🔄 ОЧИЩАЕМ srcObject так как трек не активен...`);
                            videoElement.pause();
                            videoElement.srcObject = null;
                            videoElement.load();
                            videoElement.removeAttribute('src');
                            videoElement.removeAttribute('srcObject');
                            console.log(`   ✅ srcObject ОЧИЩЕН`);
                        }
                        // Показываем overlay "Ожидание видео..."
                        overlay.style.display = 'block';
                        videoElement.style.setProperty('display', 'none', 'important');
                    } else {
                        // Трек активен - устанавливаем srcObject (даже если соединение еще не готово)
                        // По документации WebRTC, srcObject можно устанавливать до установления соединения
                        // Видео начнет воспроизводиться когда данные начнут приходить
                        console.log(`🔄 [${userId}] Трек активен - устанавливаем srcObject (соединение: ${isConnectionReady ? 'готово ✅' : 'еще устанавливается ⏳'})`);
                        
                        const hadSrcObject = !!videoElement.srcObject;
                        if (videoElement.srcObject !== stream) {
                            console.log(`🔄 [${userId}] Устанавливаем srcObject (было: ${hadSrcObject ? 'SET' : 'NULL'})`);
                            
                            // КРИТИЧНО: Устанавливаем обработчики событий ПЕРЕД установкой srcObject
                            // Это нужно чтобы избежать черной плашки пока видео не загрузилось
                            const handleLoadedMetadata = () => {
                                console.log(`✅ [${userId}] Видео загружено (loadedmetadata)`);
                                console.log(`   - videoElement.readyState: ${videoElement.readyState}`);
                                console.log(`   - videoElement.videoWidth: ${videoElement.videoWidth}`);
                                console.log(`   - videoElement.videoHeight: ${videoElement.videoHeight}`);
                                
                                // Проверяем что видео действительно загрузилось И соединение готово
                                // КРИТИЧНО: Проверяем isConnectionReady перед показом видео
                                const checkConnectionReady = () => {
                                    // Проверяем что все объекты существуют
                                    if (!this.videoCallManager || 
                                        !this.videoCallManager.webrtcManager || 
                                        !this.videoCallManager.webrtcManager.peerConnections) {
                                        console.warn(`⚠️ [${userId}] webrtcManager или peerConnections не доступны`);
                                        return false;
                                    }
                                    
                                    const peerConn = this.videoCallManager.webrtcManager.peerConnections.get(userId);
                                    if (peerConn) {
                                        const iceState = peerConn.iceConnectionState;
                                        const connState = peerConn.connectionState;
                                        return (iceState === 'connected' || iceState === 'completed') && 
                                               (connState === 'connected');
                                    }
                                    return false;
                                };
                                
                                if (videoElement.readyState >= 2) { // HAVE_CURRENT_DATA или выше
                                    const connectionReady = checkConnectionReady();
                                    if (connectionReady) {
                                        console.log(`✅ [${userId}] Видео готово к показу, соединение готово - скрываем overlay`);
                                        overlay.style.display = 'none';
                                        videoElement.style.setProperty('display', 'block', 'important');
                                    } else {
                                        console.log(`⏳ [${userId}] Видео готово, но соединение еще не готово - показываем overlay`);
                                        overlay.innerHTML = '<div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div><p>Установка соединения...</p>';
                                        overlay.style.display = 'block';
                                        videoElement.style.setProperty('display', 'none', 'important');
                                    }
                                } else {
                                    console.log(`⚠️ [${userId}] Видео еще не готово (readyState=${videoElement.readyState}), ждем canplay`);
                                }
                            };
                            
                            const handleCanPlay = () => {
                                console.log(`✅ [${userId}] Видео может воспроизводиться (canplay)`);
                                console.log(`   - videoElement.readyState: ${videoElement.readyState}`);
                                
                                // КРИТИЧНО: Проверяем isConnectionReady перед показом видео
                                let connectionReady = false;
                                
                                // Проверяем что все объекты существуют
                                if (this.videoCallManager && 
                                    this.videoCallManager.webrtcManager && 
                                    this.videoCallManager.webrtcManager.peerConnections) {
                                    const peerConn = this.videoCallManager.webrtcManager.peerConnections.get(userId);
                                    if (peerConn) {
                                        const iceState = peerConn.iceConnectionState;
                                        const connState = peerConn.connectionState;
                                        connectionReady = (iceState === 'connected' || iceState === 'completed') && 
                                                         (connState === 'connected');
                                    }
                                } else {
                                    console.warn(`⚠️ [${userId}] webrtcManager или peerConnections не доступны в handleCanPlay`);
                                }
                                
                                if (connectionReady) {
                                    console.log(`✅ [${userId}] Соединение готово - показываем видео`);
                                    overlay.style.display = 'none';
                                    videoElement.style.setProperty('display', 'block', 'important');
                                } else {
                                    console.log(`⏳ [${userId}] Соединение еще не готово - показываем overlay`);
                                    overlay.innerHTML = '<div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div><p>Установка соединения...</p>';
                                    overlay.style.display = 'block';
                                    videoElement.style.setProperty('display', 'none', 'important');
                                }
                            };
                            
                            const handleError = (error) => {
                                console.error(`❌ [${userId}] Ошибка загрузки видео:`, error);
                                console.error(`   - videoElement.error:`, videoElement.error);
                                overlay.style.display = 'block';
                                videoElement.style.setProperty('display', 'none', 'important');
                            };
                            
                            // Удаляем старые обработчики если есть
                            videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
                            videoElement.removeEventListener('canplay', handleCanPlay);
                            videoElement.removeEventListener('error', handleError);
                            
                            // Добавляем новые обработчики
                            videoElement.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
                            videoElement.addEventListener('canplay', handleCanPlay, { once: true });
                            videoElement.addEventListener('error', handleError, { once: true });
                            
                            // Устанавливаем srcObject
                            videoElement.srcObject = stream;
                            videoElement.setAttribute('playsinline', 'true');
                            
                            // Пытаемся воспроизвести
                            videoElement.play().then(() => {
                                console.log(`✅ [${userId}] Видео воспроизводится`);
                            }).catch(error => {
                                console.warn(`⚠️ [${userId}] Ошибка воспроизведения видео:`, error);
                            });
                            
                            console.log(`   - videoElement.srcObject установлен: ${!!videoElement.srcObject}`);
                            
                            // Показываем overlay пока видео не загрузилось
                            if (!isConnectionReady) {
                                overlay.innerHTML = '<div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div><p>Установка соединения...</p>';
                            }
                            overlay.style.display = 'block';
                            videoElement.style.setProperty('display', 'none', 'important');
                        } else {
                            console.log(`ℹ️ [${userId}] srcObject уже установлен, проверяем готовность`);
                            // Если srcObject уже установлен, проверяем готовность видео И соединения
                            if (videoElement.readyState >= 2 && isConnectionReady) {
                                console.log(`✅ [${userId}] Видео готово (readyState=${videoElement.readyState}) И соединение готово - показываем`);
                                overlay.style.display = 'none';
                                videoElement.style.setProperty('display', 'block', 'important');
                            } else {
                                // Видео не готово ИЛИ соединение не готово - показываем overlay
                                if (videoElement.readyState >= 2 && !isConnectionReady) {
                                    console.log(`⏳ [${userId}] Видео готово, но соединение не готово - показываем overlay "Установка соединения..."`);
                                    overlay.innerHTML = '<div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div><p>Установка соединения...</p>';
                                } else if (videoElement.readyState < 2) {
                                    console.log(`⏳ [${userId}] Видео еще не готово (readyState=${videoElement.readyState}), показываем overlay`);
                                    if (!isConnectionReady) {
                                        overlay.innerHTML = '<div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div><p>Установка соединения...</p>';
                                    }
                                } else {
                                    console.log(`⏳ [${userId}] Показываем overlay (readyState=${videoElement.readyState}, isConnectionReady=${isConnectionReady})`);
                                    if (!isConnectionReady) {
                                        overlay.innerHTML = '<div class="overlay-icon"><img src="/static/images/user.png" alt="Пользователь"></div><p>Установка соединения...</p>';
                                    }
                                }
                                overlay.style.display = 'block';
                                videoElement.style.setProperty('display', 'none', 'important');
                            }
                        }
                        
                        // Пытаемся воспроизвести если еще не воспроизводится
                        if (videoElement.paused) {
                            videoElement.play().then(() => {
                                console.log(`✅ [${userId}] videoElement.play() успешно`);
                            }).catch(error => {
                                if (error.name !== 'AbortError') {
                                    console.warn(`⚠️ [${userId}] Ошибка play:`, error);
                                } else {
                                    console.log(`ℹ️ [${userId}] play() AbortError (нормально)`);
                                }
                            });
                        }
                    }
                } else {
                    console.warn(`⚠️ [${userId}] Не все элементы найдены: participantCard=${!!participantCard}, overlay=${!!overlay}, videoElement=${!!videoElement}`);
                }
            } else {
                // НЕТ АКТИВНОГО ВИДЕО - удаляем карточку полностью
                console.log(`\n❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌`);
                console.log(`❌ ========== НЕТ АКТИВНОГО ВИДЕО - УДАЛЯЕМ КАРТОЧКУ [${userId}] ==========`);
                console.log(`📅 Время: ${new Date().toISOString()}`);
                console.log(`   📊 Детали проверки:`);
                console.log(`   - videoTracks.length: ${videoTracks.length}`);
                if (videoTracks.length > 0) {
                    const track = videoTracks[0];
                    console.log(`   - track.id: ${track.id}`);
                    console.log(`   - track.enabled: ${track.enabled} ${track.enabled ? '✅' : '❌ (должно быть true)'}`);
                    console.log(`   - track.readyState: ${track.readyState} ${track.readyState === 'live' ? '✅' : '❌'}`);
                    console.log(`   - track.muted: ${track.muted} ${track.muted ? '❌ (КАМЕРА ВЫКЛЮЧЕНА!)' : '✅'}`);
                    console.log(`   - hasActiveVideo = ${track.readyState === 'live'} && ${track.enabled} && ${!track.muted} = ${hasActiveVideo}`);
                } else {
                    console.log(`   - НЕТ видео треков в потоке`);
                }
                
                // КРИТИЧНО: Очищаем srcObject ПЕРЕД удалением карточки
                        if (videoElement) {
                    console.log(`\n🗑️ [${userId}] ШАГ 1: Очищаем videoElement`);
                    const hadSrcObject = !!videoElement.srcObject;
                    console.log(`   - srcObject ДО очистки: ${hadSrcObject ? 'SET ❌' : 'NULL ✅'}`);
                    
                    if (hadSrcObject) {
                            videoElement.pause();
                            videoElement.srcObject = null;
                                videoElement.load();
                        console.log(`   ✅ srcObject очищен (pause, null, load)`);
                    }
                    
                    // Скрываем элемент
                    videoElement.style.setProperty('display', 'none', 'important');
                    videoElement.style.setProperty('visibility', 'hidden', 'important');
                    videoElement.style.setProperty('opacity', '0', 'important');
                    videoElement.style.setProperty('width', '0', 'important');
                    videoElement.style.setProperty('height', '0', 'important');
                    
                    const afterSrcObject = !!videoElement.srcObject;
                    console.log(`   - srcObject ПОСЛЕ очистки: ${afterSrcObject ? 'SET ❌❌❌' : 'NULL ✅'}`);
                    if (afterSrcObject) {
                        console.error(`   ❌❌❌ КРИТИЧЕСКАЯ ОШИБКА: srcObject все еще установлен!`);
                    }
                }
                
                // Удаляем карточку из DOM
                if (participantCard && participantCard.parentNode) {
                    console.log(`\n🗑️ [${userId}] ШАГ 2: Удаляем participantCard из DOM`);
                    
                    // Дополнительная проверка srcObject перед удалением
                    if (videoElement && videoElement.srcObject) {
                        console.error(`   ⚠️ КРИТИЧНО: srcObject все еще установлен! Принудительно очищаем...`);
                        videoElement.srcObject = null;
                        videoElement.load();
                    }
                    
                    participantCard.remove();
                    console.log(`   ✅ participantCard.remove() вызван`);
                    
                    // Проверяем что карточка удалена
                    const stillExists = document.getElementById(`participant-${userId}`);
                    if (stillExists) {
                        console.error(`   ❌❌❌ КРИТИЧЕСКАЯ ОШИБКА: Карточка все еще существует!`);
                    } else {
                        console.log(`   ✅ Карточка успешно удалена`);
                    }
                }
                
                console.log(`❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌`);
                console.log(`🔵 ========== КОНЕЦ ОБРАБОТКИ ${userId} ==========\n`);
            }
        });
        
        console.log(`\n🟡 ========== КОНЕЦ updateVideoOverlays ==========\n`);
        console.log(`📅 Время завершения: ${new Date().toISOString()}\n`);
        } finally {
            // Сбрасываем флаг после завершения обновления
            this._updatingVideoOverlays = false;
            console.log(`✅ [updateVideoOverlays] Флаг _updatingVideoOverlays сброшен`);
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
        console.log(`\n🟢 ========== СОЗДАНИЕ КАРТОЧКИ ДЛЯ ${userId} ==========`);
        console.log(`📊 [createRemoteVideoElement ${userId}] Начало создания карточки`);
        
        // УБЕЖДАЕМСЯ, что participantsGrid существует
        let participantsGrid = document.getElementById('participantsGrid');
        console.log(`📊 [createRemoteVideoElement ${userId}] participantsGrid: ${participantsGrid ? 'exists' : 'NOT FOUND'}`);
        
        if (!participantsGrid) {
            console.warn(`⚠️ [createRemoteVideoElement ${userId}] participantsGrid не найден, создаем...`);
            const videoContainer = document.querySelector('.video-container');
            console.log(`   - videoContainer: ${videoContainer ? 'exists' : 'NOT FOUND'}`);
            if (videoContainer) {
                participantsGrid = document.createElement('div');
                participantsGrid.id = 'participantsGrid';
                participantsGrid.className = 'participants-grid';
                videoContainer.appendChild(participantsGrid);
                console.log(`✅ [createRemoteVideoElement ${userId}] participantsGrid создан`);
            } else {
                console.error(`❌ [createRemoteVideoElement ${userId}] Не удалось создать participantsGrid: video-container не найден`);
                return;
            }
        }

        const existingCard = document.getElementById(`participant-${userId}`);
        if (existingCard) {
            console.log(`⚠️ [createRemoteVideoElement ${userId}] Participant card already exists, возвращаемся`);
            console.log(`   - existingCard.parentNode: ${existingCard.parentNode ? existingCard.parentNode.id || 'exists' : 'NULL'}`);
            return;
        }
        console.log(`✅ [createRemoteVideoElement ${userId}] Карточка не существует, продолжаем создание`);
        
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
        
        console.log(`📝 [createRemoteVideoElement ${userId}] Создаем HTML структуру карточки`);
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
        console.log(`✅ [createRemoteVideoElement ${userId}] HTML структура создана`);
        
        // Скрываем карточку по умолчанию - она появится только если есть активное видео
        // ВАЖНО: Используем setProperty с important чтобы гарантировать скрытие
        console.log(`🔒 [createRemoteVideoElement ${userId}] Скрываем карточку по умолчанию`);
        participantCard.style.setProperty('display', 'none', 'important');
        participantCard.style.setProperty('visibility', 'hidden', 'important');
        participantCard.style.setProperty('opacity', '0', 'important');
        participantCard.style.setProperty('width', '0', 'important');
        participantCard.style.setProperty('height', '0', 'important');
        participantCard.style.setProperty('overflow', 'hidden', 'important');
        participantCard.style.setProperty('pointer-events', 'none', 'important');
        console.log(`✅ [createRemoteVideoElement ${userId}] Все стили скрытия установлены`);
        
        participantsGrid.appendChild(participantCard);
        console.log(`✅ [createRemoteVideoElement ${userId}] Карточка добавлена в participantsGrid`);
        
        // ВАЖНО: Проверяем, что карточка действительно добавлена в DOM
        const isInDOM = participantsGrid.contains(participantCard);
        const computedDisplay = window.getComputedStyle(participantCard).display;
        console.log(`🔍 [createRemoteVideoElement ${userId}] Проверка добавления в DOM:`);
        console.log(`   - isInDOM: ${isInDOM}`);
        console.log(`   - parent: ${participantCard.parentElement?.id || 'null'}`);
        console.log(`   - computed display: ${computedDisplay}`);
        console.log(`   - inline display: ${participantCard.style.display}`);
        
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        if (videoElement) {
            console.log(`✅ [createRemoteVideoElement ${userId}] videoElement найден после создания`);
            console.log(`   - videoElement.id: ${videoElement.id}`);
            console.log(`   - videoElement.srcObject: ${videoElement.srcObject ? 'SET ❌' : 'NULL ✅'}`);
            console.log(`   - videoElement.style.display: ${videoElement.style.display || 'not set'}`);
            
            // КРИТИЧНО: НЕ устанавливаем srcObject здесь!
            // Карточка скрыта, и установка srcObject создаст черную плашку
            // srcObject будет установлен в updateVideoOverlays когда карточка покажется
            console.log(`🔒 [createRemoteVideoElement ${userId}] НЕ устанавливаем srcObject (карточка скрыта)`);

            // ДОБАВЛЯЕМ ОБРАБОТЧИКИ ДЛЯ СЛЕДЕНИЯ ЗА СОСТОЯНИЕМ ТРЕКОВ
            console.log(`📡 [createRemoteVideoElement ${userId}] Добавляем обработчики событий для треков`);
            const tracks = stream.getTracks();
            console.log(`   - Всего треков в потоке: ${tracks.length}`);
            tracks.forEach((track, index) => {
                console.log(`   - Трек ${index}: kind=${track.kind}, id=${track.id}, enabled=${track.enabled}, readyState=${track.readyState}`);
            });
            
            stream.getTracks().forEach(track => {
                console.log(`📡 [createRemoteVideoElement ${userId}] Настраиваем обработчики для трека ${track.kind} (${track.id})`);
                
                // Удаляем старые обработчики если есть
                track.onended = null;
                track.onmute = null;
                track.onunmute = null;
                
                track.onended = () => {
                    console.log(`\n🔴 [${userId}] СОБЫТИЕ: Трек ${track.kind} завершился`);
                    console.log(`   - track.id: ${track.id}`);
                    console.log(`   - track.enabled: ${track.enabled}`);
                    console.log(`   - track.readyState: ${track.readyState}`);
                            this.updateVideoOverlays();
                };
                
                track.onmute = () => {
                    console.log(`\n🔇🔇🔇 [${userId}] СОБЫТИЕ: ТРЕК ${track.kind} ЗАГЛУШЕН (MUTED) 🔇🔇🔇`);
                    console.log(`   - track.id: ${track.id}`);
                    console.log(`   - track.enabled: ${track.enabled}`);
                    console.log(`   - track.readyState: ${track.readyState}`);
                    console.log(`   - track.muted: ${track.muted}`);
                    
                    // КРИТИЧНО: Если видео трек стал muted - НЕМЕДЛЕННО очищаем srcObject и удаляем карточку
                    if (track.kind === 'video') {
                        console.log(`🗑️ [${userId}] ВИДЕО ТРЕК MUTED - НЕМЕДЛЕННАЯ ОЧИСТКА`);
                        
                        const videoElement = document.getElementById(`remoteVideo-${userId}`);
                        if (videoElement) {
                            console.log(`   🔄 Очищаем srcObject у videoElement...`);
                            videoElement.pause();
                            videoElement.srcObject = null;
                            videoElement.load();
                            // Дополнительно очищаем все атрибуты
                            videoElement.removeAttribute('src');
                            videoElement.removeAttribute('srcObject');
                            console.log(`   ✅ srcObject очищен`);
                        }
                        
                        // Удаляем карточку из DOM
                        const participantCard = document.getElementById(`participant-${userId}`);
                        if (participantCard && participantCard.parentNode) {
                            console.log(`   🔄 Удаляем карточку из DOM...`);
                            participantCard.remove();
                            console.log(`   ✅ Карточка удалена из DOM`);
                        }
                        
                        // Вызываем updateVideoOverlays для обновления состояния
                        console.log(`   🔄 Вызываем updateVideoOverlays для обновления состояния...`);
                        this.updateVideoOverlays();
                    }
                    console.log(`   - track.muted: ${track.muted}`);
                    
                    // КРИТИЧНО: Если видео трек стал muted - немедленно очищаем srcObject и удаляем карточку
                    if (track.kind === 'video') {
                        console.log(`🗑️ [${userId}] ВИДЕО ТРЕК MUTED - НЕМЕДЛЕННАЯ ОЧИСТКА`);
                        
                        // 1. Очищаем srcObject у videoElement
                        const videoElement = document.getElementById(`remoteVideo-${userId}`);
                        if (videoElement && videoElement.srcObject) {
                            console.log(`   🔄 Очищаем srcObject у videoElement...`);
                            videoElement.pause();
                            videoElement.srcObject = null;
                            videoElement.load();
                            console.log(`   ✅ srcObject очищен`);
                        }
                        
                        // 2. Удаляем трек из потока
                        if (stream.getTracks().includes(track)) {
                            console.log(`   🔄 Удаляем muted видео трек из потока...`);
                            stream.removeTrack(track);
                            console.log(`   ✅ Трек удален из потока`);
                        }
                        
                        // 3. Удаляем карточку из DOM
                        const participantCard = document.getElementById(`participant-${userId}`);
                        if (participantCard && participantCard.parentNode) {
                            console.log(`   🔄 Удаляем карточку из DOM...`);
                            participantCard.remove();
                            console.log(`   ✅ Карточка удалена из DOM`);
                        }
                    }
                    
                    console.log(`🔄 [${userId}] Вызываем updateVideoOverlays() после mute...`);
                    this.updateVideoOverlays();
                    console.log(`✅ [${userId}] updateVideoOverlays() вызван после mute`);
                };
                
                track.onunmute = () => {
                    console.log(`\n🔊 [${userId}] СОБЫТИЕ: Трек ${track.kind} включен`);
                    console.log(`   - track.id: ${track.id}`);
                    console.log(`   - track.enabled: ${track.enabled}`);
                    console.log(`   - track.readyState: ${track.readyState}`);
                    console.log(`   - track.muted: ${track.muted}`);
                    this.updateVideoOverlays();
                };
                
                // КРИТИЧНО: Отслеживаем изменение enabled И muted через периодическую проверку
                // WebRTC не предоставляет событие для изменения enabled
                if (track.kind === 'video') {
                    console.log(`⏰ [createRemoteVideoElement ${userId}] Настраиваем периодическую проверку enabled и muted для видео трека`);
                    let lastEnabledState = track.enabled;
                    let lastMutedState = track.muted;
                    console.log(`   - Начальное enabled: ${lastEnabledState}, muted: ${lastMutedState}`);
                    
                    // Проверяем каждые 100ms для быстрой реакции
                    const enabledCheckInterval = setInterval(() => {
                        if (!stream.getTracks().includes(track) || track.readyState === 'ended') {
                            console.log(`⏰ [checkEnabled ${userId}] Трек завершен, очищаем интервал`);
                            clearInterval(enabledCheckInterval);
                            return;
                        }
                        
                        const currentEnabled = track.enabled;
                        const currentMuted = track.muted;
                        
                        // Проверяем изменение enabled
                        if (currentEnabled !== lastEnabledState) {
                            console.log(`\n🔄🔄🔄 [checkEnabled ${userId}] enabled ИЗМЕНИЛСЯ: ${lastEnabledState} -> ${currentEnabled} 🔄🔄🔄`);
                            console.log(`   - track.id: ${track.id}`);
                            console.log(`   - track.readyState: ${track.readyState}`);
                            console.log(`   - track.muted: ${track.muted}`);
                            lastEnabledState = currentEnabled;
                            this.updateVideoOverlays();
                        }
                        
                        // КРИТИЧНО: Проверяем изменение muted - если стал muted=true, немедленно удаляем карточку
                        if (currentMuted !== lastMutedState) {
                            console.log(`\n🔇🔇🔇 [checkEnabled ${userId}] muted ИЗМЕНИЛСЯ: ${lastMutedState} -> ${currentMuted} 🔇🔇🔇`);
                            console.log(`   - track.id: ${track.id}`);
                            console.log(`   - track.enabled: ${track.enabled}`);
                            console.log(`   - track.readyState: ${track.readyState}`);
                            lastMutedState = currentMuted;
                            
                            if (currentMuted) {
                                // Трек стал muted - немедленно очищаем и удаляем
                                console.log(`🗑️ [checkEnabled ${userId}] ТРЕК СТАЛ MUTED - НЕМЕДЛЕННАЯ ОЧИСТКА`);
                                
                                const videoElement = document.getElementById(`remoteVideo-${userId}`);
                                if (videoElement && videoElement.srcObject) {
                                    videoElement.pause();
                                    videoElement.srcObject = null;
                                    videoElement.load();
                                    console.log(`   ✅ srcObject очищен`);
                                }
                                
                                if (stream.getTracks().includes(track)) {
                                    stream.removeTrack(track);
                                    console.log(`   ✅ Трек удален из потока`);
                                }
                                
                                const participantCard = document.getElementById(`participant-${userId}`);
                                if (participantCard && participantCard.parentNode) {
                                    participantCard.remove();
                                    console.log(`   ✅ Карточка удалена`);
                                }
                            }
                            
                            this.updateVideoOverlays();
                        }
                    }, 100);
                    
                    console.log(`✅ [createRemoteVideoElement ${userId}] Интервал проверки enabled и muted установлен (100ms)`);
                    
                    // Очищаем интервал когда трек заканчивается
                    const originalOnEnded = track.onended;
                    track.onended = () => {
                        console.log(`⏰ [${userId}] Трек завершился, очищаем интервал проверки enabled и muted`);
                        clearInterval(enabledCheckInterval);
                        if (originalOnEnded) originalOnEnded();
                    };
                }
            });
            console.log(`✅ [createRemoteVideoElement ${userId}] Все обработчики событий установлены`);
            
            // ВАЖНО: Обновляем состояние после создания видео элемента
            setTimeout(() => {
                if (this.videoCallManager.checkEmptyState) {
                this.videoCallManager.checkEmptyState();
                }
            }, 100);
            
            console.log(`\n🟢 ========== КОНЕЦ СОЗДАНИЯ КАРТОЧКИ ${userId} ==========\n`);
        } else {
            console.error(`❌❌❌ [createRemoteVideoElement ${userId}] КРИТИЧЕСКАЯ ОШИБКА: Video element not found after creation!`);
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


