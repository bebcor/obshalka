// Модуль для управления UI
class UIManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
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
                if (localVideo && localVideo.srcObject) {
                    const currentStream = localVideo.srcObject;
                    const hasVideoTracks = currentStream.getVideoTracks().some(t => t.enabled && !t.muted && t.readyState === 'live');
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
        
        // Remote video overlays для всех пользователей
        // ВАЖНО: Сначала проверяем все потоки и удаляем карточки без активного видео
        const streamsToCheck = Array.from(this.videoCallManager.remoteStreams.entries());
        
        streamsToCheck.forEach(([userId, stream]) => {
            const videoElement = document.getElementById(`remoteVideo-${userId}`);
            const participantCard = document.getElementById(`participant-${userId}`);
            const overlay = participantCard?.querySelector('.video-overlay');
            
            if (!participantCard) {
                return; // Карточка не существует, пропускаем
            }
            
            // ВАЖНО: Проверяем, что peer connection существует и треки в receivers соответствуют трекам в stream
            const peerConnection = this.videoCallManager.remoteUsers.get(userId);
            if (peerConnection) {
                const receivers = peerConnection.getReceivers();
                // ВАЖНО: Собираем только активные треки (enabled, не muted, live)
                const activeReceiverTrackIds = new Set();
                receivers.forEach(receiver => {
                    const track = receiver.track;
                    if (track && track.enabled && !track.muted && track.readyState === 'live') {
                        activeReceiverTrackIds.add(track.id);
                    }
                });
                
                // ВАЖНО: Также добавляем треки из receivers, которых нет в stream
                // Это критично - если ontrack не сработал, треки все равно должны попасть в stream
                receivers.forEach(receiver => {
                    const track = receiver.track;
                    if (track && track.enabled && !track.muted && track.readyState === 'live') {
                        const trackInStream = stream.getTracks().find(t => t.id === track.id);
                        if (!trackInStream) {
                            console.log(`✅ [updateVideoOverlays] Добавляем трек ${track.kind} (${track.id}) из receivers в remoteStream для ${userId}`, {
                                enabled: track.enabled,
                                muted: track.muted,
                                readyState: track.readyState
                            });
                            stream.addTrack(track);
                            console.log(`✅ [updateVideoOverlays] RemoteStream теперь имеет ${stream.getTracks().length} треков:`, stream.getTracks().map(t => `${t.kind}:${t.id}`));
                        }
                    }
                });
                
                // Удаляем треки из stream, которых нет в активных receivers
                const streamTracks = stream.getTracks();
                streamTracks.forEach(track => {
                    const receiverTrack = receivers.find(r => r.track && r.track.id === track.id)?.track;
                    // Удаляем трек если его нет в активных receivers или он неактивен
                    if (!activeReceiverTrackIds.has(track.id) || !receiverTrack || !receiverTrack.enabled || receiverTrack.muted || receiverTrack.readyState !== 'live') {
                        console.log(`🗑️ [updateVideoOverlays] Трек ${track.kind} (${track.id}) неактивен или отсутствует в активных receivers для ${userId}, удаляем из потока`, {
                            hasReceiver: !!receiverTrack,
                            enabled: receiverTrack?.enabled,
                            muted: receiverTrack?.muted,
                            readyState: receiverTrack?.readyState
                        });
                        stream.removeTrack(track);
                    }
                });
            } else {
                console.log(`⚠️ [updateVideoOverlays] Нет peer connection для ${userId}, но есть remoteStream`);
            }
            
            const videoTracks = stream.getVideoTracks();
            const audioTracks = stream.getAudioTracks();
            
            // ВАЖНО: Удаляем неактивные видео треки (ended, disabled, или muted)
            // Это предотвращает показ черных экранов
            videoTracks.forEach(track => {
                const isInactive = track.readyState === 'ended' || 
                                  !track.enabled || 
                                  track.muted;
                if (isInactive) {
                    console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем неактивный видео трек:`, {
                        id: track.id,
                        readyState: track.readyState,
                        enabled: track.enabled,
                        muted: track.muted
                    });
                    stream.removeTrack(track);
                }
            });
            
            // Для аудио удаляем только ended треки (disabled/muted аудио может снова включиться)
            audioTracks.forEach(track => {
                if (track.readyState === 'ended') {
                    console.log(`🗑️ Удаляем ended аудио трек для ${userId}`);
                    stream.removeTrack(track);
                }
            });
            
            // ВАЖНО: ПРОСТАЯ ПРОВЕРКА - есть ли активный видео трек в receivers
            // Это единственный надежный источник истины - если в receivers нет активного видео, значит камера выключена
            let hasActiveVideo = false;
            if (peerConnection) {
                const receivers = peerConnection.getReceivers();
                // Ищем активный видео трек в receivers
                hasActiveVideo = receivers.some(receiver => {
                    const track = receiver.track;
                    return track && 
                           track.kind === 'video' && 
                           track.readyState === 'live' && 
                           track.enabled && 
                           !track.muted;
                });
                
                console.log(`🔍 [${userId}] Проверка receivers:`, receivers.length, 'receivers, hasActiveVideo:', hasActiveVideo);
                receivers.forEach((receiver, index) => {
                    const track = receiver.track;
                    if (track && track.kind === 'video') {
                        console.log(`  Receiver ${index}: video track - enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
                    }
                });
            } else {
                // Если нет peer connection, значит нет активного видео
                hasActiveVideo = false;
                console.log(`⚠️ [${userId}] Нет peer connection - скрываем карточку`);
            }
            
            // Получаем актуальные треки ПОСЛЕ очистки
            const activeVideoTracks = stream.getVideoTracks();
            const activeAudioTracks = stream.getAudioTracks();
            
            // ВАЖНО: Если в receivers нет активного видео, значит камера выключена - скрываем карточку
            // Не проверяем поток - он может содержать старые неактивные треки
            if (!hasActiveVideo) {
                console.log(`❌ [${userId}] Нет активного видео в receivers - скрываем карточку`);
            }
            
            // ВАЖНО: Проверяем наличие активного аудио
            const hasActiveAudio = activeAudioTracks.length > 0 && 
                                  activeAudioTracks.some(track => 
                                      track && 
                                      track.readyState === 'live' && 
                                      track.enabled && 
                                      !track.muted
                                  );
            
            console.log(`🔍 [updateVideoOverlays ${userId}] Проверка: video=${hasActiveVideo}, audio=${hasActiveAudio}, tracks=${activeVideoTracks.length}v/${activeAudioTracks.length}a`);
            console.log(`🔍 [updateVideoOverlays ${userId}] Stream tracks:`, stream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
            
            if (hasActiveVideo) {
                // Есть активное видео - показываем карточку
                // ВАЖНО: Дополнительная проверка - убеждаемся что в потоке есть активные видео треки
                const finalVideoTracks = stream.getVideoTracks();
                const hasActiveTracksInStream = finalVideoTracks.length > 0 && 
                                               finalVideoTracks.some(track => 
                                                   track && 
                                                   track.readyState === 'live' && 
                                                   track.enabled && 
                                                   !track.muted
                                               );
                
                if (!hasActiveTracksInStream) {
                    console.log(`⚠️ [updateVideoOverlays ${userId}] hasActiveVideo=true, но в потоке нет активных треков - скрываем карточку`);
                    // Переходим к логике скрытия
                } else {
                    // ВАЖНО: Используем setProperty с important чтобы перезаписать скрытие при создании
                    participantCard.style.setProperty('display', 'block', 'important');
                    participantCard.style.removeProperty('visibility');
                    participantCard.style.removeProperty('opacity');
                    participantCard.style.removeProperty('width');
                    participantCard.style.removeProperty('height');
                    participantCard.style.removeProperty('overflow');
                    participantCard.style.removeProperty('pointer-events');
                    
                    if (overlay) overlay.style.display = 'none';
                    if (videoElement) {
                        videoElement.style.setProperty('display', 'block', 'important');
                        // ВАЖНО: Устанавливаем srcObject ТОЛЬКО если есть активные видео треки в потоке
                        if (videoElement.srcObject !== stream) {
                            console.log(`🔄 [updateVideoOverlays ${userId}] Обновляем srcObject для videoElement, активные треки:`, finalVideoTracks.filter(t => t.enabled && !t.muted).map(t => t.id));
                            videoElement.srcObject = stream;
                        }
                        // ВАЖНО: Убеждаемся что видео воспроизводится
                        videoElement.play().then(() => {
                            console.log(`✅ [updateVideoOverlays ${userId}] Видео успешно воспроизводится`);
                        }).catch(err => {
                            // Игнорируем ошибки связанные с aborted - это нормально при очистке
                            if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                console.warn(`⚠️ [updateVideoOverlays ${userId}] Ошибка play:`, err);
                            }
                        });
                    }
                    console.log(`✅ [updateVideoOverlays ${userId}] Удаленная карточка: ПОКАЗЫВАЕМ (есть активное видео)`);
                    return; // Выходим, не переходим к логике скрытия
                }
            }
            
            // Если дошли сюда - значит нет активного видео
            // НЕТ активного видео - СКРЫВАЕМ карточку и ОЧИЩАЕМ srcObject
            console.log(`❌ [updateVideoOverlays ${userId}] НЕТ активного видео в receivers - скрываем карточку и очищаем srcObject`);
            
            // КРИТИЧНО: СНАЧАЛА очищаем srcObject и скрываем карточку - это предотвращает показ черного экрана
            if (videoElement) {
                // Останавливаем воспроизведение
                videoElement.pause();
                // Очищаем srcObject СРАЗУ
                videoElement.srcObject = null;
                // Используем load() для полной очистки
                try {
                    videoElement.load();
                } catch (e) {
                    // Игнорируем ошибки
                }
                // Скрываем элемент
                videoElement.style.setProperty('display', 'none', 'important');
            }
            
            // Скрываем карточку полностью СРАЗУ
            participantCard.style.setProperty('display', 'none', 'important');
            participantCard.style.setProperty('visibility', 'hidden', 'important');
            participantCard.style.setProperty('opacity', '0', 'important');
            participantCard.style.setProperty('width', '0', 'important');
            participantCard.style.setProperty('height', '0', 'important');
            participantCard.style.setProperty('overflow', 'hidden', 'important');
            participantCard.style.setProperty('pointer-events', 'none', 'important');
            
            if (overlay) overlay.style.display = 'none';
            
            // ВАЖНО: Удаляем ВСЕ видео треки из потока ПОСЛЕ очистки srcObject
            const allVideoTracks = stream.getVideoTracks();
            allVideoTracks.forEach(track => {
                console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем видео трек из потока:`, track.id);
                stream.removeTrack(track);
            });
            
            // Проверяем и очищаем еще раз через небольшую задержку для надежности
            setTimeout(() => {
                if (videoElement) {
                    const currentSrcObject = videoElement.srcObject;
                    if (currentSrcObject) {
                        const videoTracksInSrcObject = currentSrcObject.getVideoTracks();
                        if (videoTracksInSrcObject.length > 0) {
                            console.warn(`⚠️ [updateVideoOverlays ${userId}] В srcObject все еще есть видео треки (${videoTracksInSrcObject.length}), очищаем принудительно`);
                            videoElement.pause();
                            videoElement.srcObject = null;
                            try {
                                videoElement.load();
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        }
                    }
                    // Убеждаемся что карточка скрыта
                    const computedDisplay = window.getComputedStyle(participantCard).display;
                    if (computedDisplay !== 'none') {
                        console.warn(`⚠️ [updateVideoOverlays ${userId}] Карточка не скрыта (display: ${computedDisplay}), скрываем принудительно`);
                        participantCard.style.setProperty('display', 'none', 'important');
                    }
                }
            }, 150);
            
            console.log(`❌ [updateVideoOverlays ${userId}] Карточка скрыта, srcObject очищен`);
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
            // ВАЖНО: НЕ устанавливаем srcObject сразу - это сделает updateVideoOverlays()
            // после проверки состояния треков
            // videoElement.srcObject = stream;
            // Скрываем видео элемент тоже
            videoElement.style.setProperty('display', 'none', 'important');
            videoElement.srcObject = null;

            // ДОБАВЛЯЕМ ОБРАБОТЧИКИ ДЛЯ СЛЕДЕНИЯ ЗА СОСТОЯНИЕМ ТРЕКОВ
            const setupTrackHandlers = (track) => {
                track.onended = () => {
                    console.log(`Трек ${track.kind} завершился для пользователя ${userId}`);
                    // Удаляем трек из потока если он завершился
                    if (stream.getTracks().includes(track)) {
                        stream.removeTrack(track);
                    }
                    this.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                };
                
                track.onmute = () => {
                    console.log(`Трек ${track.kind} заглушен для пользователя ${userId}`);
                    this.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                };
                
                track.onunmute = () => {
                    console.log(`Трек ${track.kind} включен для пользователя ${userId}`);
                    this.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                };
            };
            
            stream.getTracks().forEach(setupTrackHandlers);
            
            // Отслеживаем добавление новых треков в поток
            const originalAddTrack = stream.addTrack.bind(stream);
            stream.addTrack = (track) => {
                const result = originalAddTrack(track);
                setupTrackHandlers(track);
                
                // ВАЖНО: Если видео трек неактивен при добавлении, ждем и перепроверяем
                // Трек может быть временно muted при инициализации
                if (track.kind === 'video' && (track.muted || !track.enabled)) {
                    console.log(`⚠️ Видео трек добавлен как неактивный для ${userId}, muted: ${track.muted}, enabled: ${track.enabled}`);
                    // Ждем 500мс и перепроверяем состояние трека
                    setTimeout(() => {
                        const currentTrack = stream.getVideoTracks().find(t => t.id === track.id);
                        if (currentTrack) {
                            const isNowActive = currentTrack.enabled && !currentTrack.muted && currentTrack.readyState === 'live';
                            console.log(`🔄 Перепроверка видео трека для ${userId}: enabled: ${currentTrack.enabled}, muted: ${currentTrack.muted}, readyState: ${currentTrack.readyState}, isNowActive: ${isNowActive}`);
                            if (isNowActive) {
                                // Трек стал активным - обновляем UI
                                this.updateVideoOverlays();
                            }
                        }
                    }, 500);
                }
                
                // Обновляем UI с небольшой задержкой, чтобы трек успел инициализироваться
                // Вызываем сразу и с задержкой для надежности
                this.updateVideoOverlays();
                setTimeout(() => {
                    this.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                }, 100);
                return result;
            };
            
            // ВАЖНО: Сразу проверяем состояние треков после создания карточки
            // Это нужно чтобы скрыть карточку если треки неактивны
            // Вызываем сразу и с задержкой для надежности
            this.updateVideoOverlays();
            setTimeout(() => {
                this.updateVideoOverlays();
            }, 100);
            
            // Отслеживаем удаление треков из потока
            const originalRemoveTrack = stream.removeTrack.bind(stream);
            stream.removeTrack = (track) => {
                const result = originalRemoveTrack(track);
                console.log(`Трек ${track.kind} удален из потока для пользователя ${userId}`);
                this.updateVideoOverlays();
                this.videoCallManager.checkEmptyState();
                return result;
            };
            
            // Периодическая проверка состояния треков (на случай если события не сработали)
            if (!this.trackCheckIntervals) {
                this.trackCheckIntervals = new Map();
            }
            
            if (this.trackCheckIntervals.has(userId)) {
                clearInterval(this.trackCheckIntervals.get(userId));
            }
            
            const checkInterval = setInterval(() => {
                this.updateVideoOverlays();
            }, 1000);
            
            this.trackCheckIntervals.set(userId, checkInterval);
            
            videoElement.play().catch(error => {
                console.log('Автовоспроизведение звука заблокировано:', error);
                this.showAudioActivationButton(videoElement, userId);
            });
            
            // ВАЖНО: Обновляем состояние после создания видео элемента
            setTimeout(() => {
                this.videoCallManager.checkEmptyState();
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
        if (!participantCard) return;
    
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
                console.log('✅ Звук активирован для:', userId);
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


