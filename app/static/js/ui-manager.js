// Модуль для управления UI
class UIManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    updateUI() {
        // Update connection status
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const isConnected = this.videoCallManager.socketHandler.getIsConnected();
            statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = isConnected ? 'status-connected' : 'status-disconnected';
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
            if (videoTrack && videoTrack.enabled && this.videoCallManager.localStream) {
                localOverlay.style.display = 'none';
            } else {
                localOverlay.style.display = 'flex';
            }
        }
        
        // Remote video overlays для всех пользователей
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
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
        const videoContainer = document.querySelector('.video-container');
        
        // Проверяем, есть ли уже статический элемент remoteVideo
        const existingStaticVideo = document.getElementById('remoteVideo');
        const existingStaticWrapper = existingStaticVideo?.closest('.video-wrapper.remote');
        
        // Если есть статический элемент и это первый пользователь, используем его
        if (existingStaticWrapper && this.videoCallManager.remoteStreams.size === 0) {
            console.log('Using existing static remote video element for first user');
            const videoElement = existingStaticVideo;
            videoElement.id = `remoteVideo-${userId}`;
            existingStaticWrapper.id = `remoteWrapper-${userId}`;
            videoElement.srcObject = stream;
            videoElement.volume = 1.0;
            videoElement.muted = false;
            
            // Обновляем label безопасно
            const label = existingStaticWrapper.querySelector('.video-label');
            if (label) {
                // Очищаем содержимое
                label.textContent = '';
                
                // Создаем текстовый узел для имени пользователя
                const userNameText = document.createTextNode(`User ${userId.substring(0, 8)} `);
                label.appendChild(userNameText);
                
                // Создаем badge-group
                const badgeGroup = document.createElement('span');
                badgeGroup.className = 'badge-group';
                
                const audioBadge = document.createElement('span');
                audioBadge.className = 'badge badge-audio on';
                audioBadge.title = 'Микрофон включен';
                audioBadge.textContent = '🎤';
                
                const videoBadge = document.createElement('span');
                videoBadge.className = 'badge badge-video on';
                videoBadge.title = 'Камера включена';
                videoBadge.textContent = '📹';
                
                badgeGroup.appendChild(audioBadge);
                badgeGroup.appendChild(videoBadge);
                label.appendChild(badgeGroup);
            }
            
            videoElement.onloadedmetadata = () => {
                videoElement.play().catch(err => {
                    console.error('Error playing remote video/audio:', err);
                });
            };
            
            // Обновляем grid с учетом локального видео
            this.updateGridLayout();
            return;
        }
        
        // Для остальных пользователей создаем новые элементы безопасно
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper remote';
        videoWrapper.id = `remoteWrapper-${userId}`;
        
        // Создаем video элемент
        const videoElement = document.createElement('video');
        videoElement.id = `remoteVideo-${userId}`;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.muted = false;
        
        // Создаем label
        const label = document.createElement('div');
        label.className = 'video-label';
        
        const userNameText = document.createTextNode(`User ${userId.substring(0, 8)} `);
        label.appendChild(userNameText);
        
        const badgeGroup = document.createElement('span');
        badgeGroup.className = 'badge-group';
        
        const audioBadge = document.createElement('span');
        audioBadge.className = 'badge badge-audio on';
        audioBadge.title = 'Микрофон включен';
        audioBadge.textContent = '🎤';
        
        const videoBadge = document.createElement('span');
        videoBadge.className = 'badge badge-video on';
        videoBadge.title = 'Камера включена';
        videoBadge.textContent = '📹';
        
        badgeGroup.appendChild(audioBadge);
        badgeGroup.appendChild(videoBadge);
        label.appendChild(badgeGroup);
        
        // Создаем overlay
        const overlay = document.createElement('div');
        overlay.className = 'video-overlay';
        
        const overlayIcon = document.createElement('div');
        overlayIcon.className = 'overlay-icon';
        overlayIcon.textContent = '👤';
        
        const overlayText = document.createElement('p');
        overlayText.textContent = 'Waiting for video...';
        
        overlay.appendChild(overlayIcon);
        overlay.appendChild(overlayText);
        
        // Собираем все вместе
        videoWrapper.appendChild(videoElement);
        videoWrapper.appendChild(label);
        videoWrapper.appendChild(overlay);
        
        videoContainer.appendChild(videoWrapper);
        
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        if (videoElement) {
            videoElement.srcObject = stream;
        }
        
        // Убеждаемся что аудио воспроизводится
        videoElement.volume = 1.0;
        videoElement.muted = false;
        
        // Обработчик для воспроизведения аудио
        videoElement.onloadedmetadata = () => {
            videoElement.play().catch(err => {
                console.error('Error playing remote video/audio:', err);
            });
        };
        
        // Обновляем grid с учетом локального видео
        this.updateGridLayout();
    }
    
    updateGridLayout() {
        const videoContainer = document.querySelector('.video-container');
        const localVideoWrapper = document.querySelector('.video-wrapper.local');
        const hasLocalVideo = localVideoWrapper !== null;
        
        // Считаем общее количество участников (локальный + удаленные)
        const remoteCount = this.videoCallManager.remoteStreams.size;
        const totalCount = (hasLocalVideo ? 1 : 0) + remoteCount;
        
        if (totalCount === 0) {
            videoContainer.style.gridTemplateColumns = '1fr';
            videoContainer.style.gridTemplateRows = '';
        } else if (totalCount === 1) {
            videoContainer.style.gridTemplateColumns = '1fr';
            videoContainer.style.gridTemplateRows = '';
        } else if (totalCount === 2) {
            videoContainer.style.gridTemplateColumns = '1fr 1fr';
            videoContainer.style.gridTemplateRows = '';
        } else if (totalCount === 3) {
            videoContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
            videoContainer.style.gridTemplateRows = 'repeat(2, 1fr)';
        } else if (totalCount === 4) {
            videoContainer.style.gridTemplateColumns = 'repeat(2, 1fr)';
            videoContainer.style.gridTemplateRows = 'repeat(2, 1fr)';
        } else {
            // Для большего количества используем адаптивную сетку
            videoContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
            videoContainer.style.gridTemplateRows = '';
        }
    }
}

