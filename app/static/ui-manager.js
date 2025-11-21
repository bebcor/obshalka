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
        
        // Local video overlay
        if (localVideo && localOverlay) {
            const videoTrack = this.videoCallManager.localStream?.getVideoTracks()[0];
            const audioTrack = this.videoCallManager.localStream?.getAudioTracks()[0];
            
            const hasActiveVideo = videoTrack && videoTrack.enabled && videoTrack.readyState === 'live';
            const hasActiveAudio = audioTrack && audioTrack.enabled && audioTrack.readyState === 'live';
            
            if (hasActiveVideo) {
                localOverlay.style.display = 'none';
                localVideo.style.display = 'block';
            } else {
                localVideo.style.display = 'none';
                // Показываем overlay только если есть активное аудио
                if (hasActiveAudio) {
                    localOverlay.style.display = 'flex';
                } else {
                    localOverlay.style.display = 'flex'; // Показываем overlay даже без аудио для локального участника
                }
            }
        }
        
        // Remote video overlays для всех пользователей
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            const videoElement = document.getElementById(`remoteVideo-${userId}`);
            const participantCard = document.getElementById(`participant-${userId}`);
            const overlay = participantCard?.querySelector('.video-overlay');
            
            if (!participantCard) {
                return; // Карточка не существует, пропускаем
            }
            
            const videoTracks = stream.getVideoTracks();
            const audioTracks = stream.getAudioTracks();
            
            // Удаляем только ended треки (disabled треки могут снова включиться)
            videoTracks.forEach(track => {
                if (track.readyState === 'ended') {
                    console.log(`🗑️ Удаляем ended видео трек для ${userId}`);
                    stream.removeTrack(track);
                }
            });
            
            audioTracks.forEach(track => {
                if (track.readyState === 'ended') {
                    console.log(`🗑️ Удаляем ended аудио трек для ${userId}`);
                    stream.removeTrack(track);
                }
            });
            
            // Получаем актуальные треки после очистки
            const activeVideoTracks = stream.getVideoTracks();
            const activeAudioTracks = stream.getAudioTracks();
            
            // Проверяем наличие активного видео трека (enabled и live)
            // ВАЖНО: проверяем что трек не только есть, но и активен
            const hasActiveVideo = activeVideoTracks.length > 0 && 
                                  activeVideoTracks[0] &&
                                  activeVideoTracks[0].readyState === 'live' && 
                                  activeVideoTracks[0].enabled &&
                                  !activeVideoTracks[0].muted;
            
            // Проверяем наличие активного аудио трека
            const hasActiveAudio = activeAudioTracks.length > 0 && 
                                  activeAudioTracks[0] &&
                                  activeAudioTracks[0].readyState === 'live' && 
                                  activeAudioTracks[0].enabled &&
                                  !activeAudioTracks[0].muted;
            
            // Логируем только при изменениях для отладки
            // console.log(`🔍 Проверка треков для ${userId}:`, {
            //     videoTracks: videoTracks.length,
            //     audioTracks: audioTracks.length,
            //     hasActiveVideo,
            //     hasActiveAudio,
            //     videoEnabled: videoTracks[0]?.enabled,
            //     videoReadyState: videoTracks[0]?.readyState,
            //     videoMuted: videoTracks[0]?.muted
            // });
            
            // Если есть активное видео - показываем видео, скрываем overlay
            if (hasActiveVideo) {
                if (overlay) overlay.style.display = 'none';
                if (videoElement) {
                    videoElement.style.display = 'block';
                    // Убеждаемся, что видео элемент имеет правильный srcObject
                    if (videoElement.srcObject !== stream) {
                        videoElement.srcObject = stream;
                    }
                }
                participantCard.style.display = 'block';
                } else {
                    // Если нет активного видео - скрываем видео элемент
                    if (videoElement) {
                        videoElement.style.display = 'none';
                        // Очищаем srcObject чтобы не показывать черный экран
                        // НО НЕ очищаем если есть аудио, чтобы аудио продолжало работать
                        if (!hasActiveAudio) {
                            videoElement.srcObject = null;
                        }
                    }
                    
                    // Если есть активное аудио - показываем overlay с иконкой пользователя
                    if (hasActiveAudio) {
                        if (overlay) overlay.style.display = 'flex';
                        participantCard.style.display = 'block';
                    } else {
                        // Если нет ни видео, ни аудио - полностью скрываем карточку
                        console.log(`❌ Скрываем карточку для ${userId} - нет активных треков`);
                        participantCard.style.display = 'none';
                        // Очищаем srcObject когда карточка скрыта
                        if (videoElement) {
                            videoElement.srcObject = null;
                        }
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
        
        participantsGrid.appendChild(participantCard);
        
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        if (videoElement) {
            videoElement.srcObject = stream;

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
                this.updateVideoOverlays();
                this.videoCallManager.checkEmptyState();
                return result;
            };
            
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

