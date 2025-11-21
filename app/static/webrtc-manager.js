// Модуль для управления WebRTC соединениями
class WebRTCManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    setupPeerConnection(targetUserId) {
        // Проверяем, нет ли уже соединения с этим пользователем
        if (this.videoCallManager.remoteUsers.has(targetUserId)) {
            console.log('⚠️ [setupPeerConnection] Peer connection already exists for:', targetUserId);
            return;
        }
        console.log('🔄 [setupPeerConnection] Создаем peer connection для:', targetUserId);

        try {
            console.log('🔄 [setupPeerConnection] Setting up peer connection for:', targetUserId);
        
            // Конфигурация ICE-серверов - используем this.configuration из VideoCallManager
            const configuration = this.videoCallManager.configuration;

            // Создаем новый peer connection
            const peerConnection = new RTCPeerConnection(configuration);
        
            // ДОБАВЛЯЕМ ТОЛЬКО АКТИВНЫЕ ТРЕКИ из текущего локального потока
            if (this.videoCallManager.localStream) {
                this.videoCallManager.localStream.getTracks().forEach(track => {
                    // ВАЖНО: Добавляем все треки, которые есть в потоке
                    // Для видео добавляем если трек enabled (независимо от isSharingScreen)
                    // Для аудио всегда добавляем
                    const isSharingScreen = this.videoCallManager.isSharingScreen || false;
                    const shouldAdd = track.kind === 'audio' || 
                                     (track.kind === 'video' && track.enabled);
                    
                    if (shouldAdd) {
                        console.log(`Adding ${track.kind} track to connection for ${targetUserId}, enabled: ${track.enabled}`);
                        try {
                            peerConnection.addTrack(track, this.videoCallManager.localStream);
                            console.log(`✅ ${track.kind} track added successfully`);
                        } catch (error) {
                            console.error(`❌ Error adding ${track.kind} track:`, error);
                        }
                    } else {
                        console.log(`⚠️ Skipping ${track.kind} track (enabled: ${track.enabled})`);
                    }
                });
            } else {
                console.log('⚠️ No local stream available for peer connection');
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
                    this.videoCallManager.socket.emit('ice_candidate', {
                        target_user_id: targetUserId,
                        candidate: event.candidate
                    });
                } else {
                    console.log('✅ ICE gathering complete for:', targetUserId);
                    console.log('Local SDP description:', peerConnection.localDescription?.sdp);
                }
            };
        
            // ВАЖНО: Отслеживаем изменения в receivers для обнаружения replaceTrack(null)
            // Когда трек заменяется на null, receiver.track становится null
            let previousReceiverTracks = new Map(); // Map<receiverIndex, trackId>
            const checkReceiversForNullTracks = () => {
                const receivers = peerConnection.getReceivers();
                const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                if (!remoteStream) {
                    console.log(`🔍 [checkReceiversForNullTracks ${targetUserId}] Нет remoteStream`);
                    return;
                }
                
                console.log(`🔍 [checkReceiversForNullTracks ${targetUserId}] Проверка:`, {
                    receiversCount: receivers.length,
                    streamTracksCount: remoteStream.getTracks().length
                });
                
                let hasChanges = false;
                
                // ВАЖНО: Проверяем все треки в remoteStream - если трека нет в активных receivers, удаляем его
                const streamTracks = remoteStream.getTracks();
                streamTracks.forEach(streamTrack => {
                    // Ищем соответствующий трек в receivers
                    const receiverTrack = receivers.find(r => r.track && r.track.id === streamTrack.id)?.track;
                    
                    console.log(`🔍 [checkReceiversForNullTracks ${targetUserId}] Проверка трека ${streamTrack.kind} (${streamTrack.id}):`, {
                        hasReceiver: !!receiverTrack,
                        receiverEnabled: receiverTrack?.enabled,
                        receiverMuted: receiverTrack?.muted,
                        receiverReadyState: receiverTrack?.readyState,
                        streamEnabled: streamTrack.enabled,
                        streamMuted: streamTrack.muted,
                        streamReadyState: streamTrack.readyState
                    });
                    
                    // ВАЖНО: Для видео треков удаляем ТОЛЬКО если:
                    // 1. Трек есть в receivers, но неактивен (disabled, muted, или не live)
                    // 2. Трек в remoteStream показывает активное состояние, но в receivers неактивен
                    // НЕ удаляем если receiverTrack === null - это может быть временное состояние при инициализации
                    const shouldRemove = streamTrack.kind === 'video' && receiverTrack && (
                                        !receiverTrack.enabled || 
                                        receiverTrack.muted || 
                                        receiverTrack.readyState !== 'live'
                                    );
                    
                    if (shouldRemove) {
                        console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] УДАЛЯЕМ трек ${streamTrack.kind} (${streamTrack.id}) из потока`, {
                            hasReceiver: !!receiverTrack,
                            receiverEnabled: receiverTrack?.enabled,
                            receiverMuted: receiverTrack?.muted,
                            receiverReadyState: receiverTrack?.readyState,
                            streamEnabled: streamTrack.enabled,
                            streamMuted: streamTrack.muted,
                            streamReadyState: streamTrack.readyState,
                            reason: !receiverTrack ? 'no receiver' : 
                                   !receiverTrack.enabled ? 'receiver disabled' :
                                   receiverTrack.muted ? 'receiver muted' :
                                   receiverTrack.readyState !== 'live' ? 'receiver not live' :
                                   'stream active but receiver inactive'
                        });
                        remoteStream.removeTrack(streamTrack);
                        hasChanges = true;
                    } else {
                        console.log(`✅ [checkReceiversForNullTracks ${targetUserId}] Трек ${streamTrack.kind} (${streamTrack.id}) активен, оставляем`);
                    }
                });
                
                // ВАЖНО: Также проверяем, что receivers с null track не имеют соответствующих треков в потоке
                // Это критично для обработки replaceTrack(null)
                receivers.forEach((receiver, index) => {
                    const currentTrack = receiver.track;
                    const previousTrackId = previousReceiverTracks.get(index);
                    
                    // ВАЖНО: Если трек БЫЛ (previousTrackId существует), но стал null - это означает replaceTrack(null) был вызван
                    // Немедленно удаляем соответствующий видео трек из потока
                    if (previousTrackId && !currentTrack) {
                        console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] Receiver ${index} трек ${previousTrackId} заменен на null (replaceTrack(null)), удаляем из потока`);
                        const tracksToRemove = remoteStream.getTracks().filter(t => t.id === previousTrackId && t.kind === 'video');
                        if (tracksToRemove.length > 0) {
                            tracksToRemove.forEach(track => {
                                console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] Удаляем видео трек ${track.id} из потока (replaceTrack(null))`);
                                remoteStream.removeTrack(track);
                                hasChanges = true;
                            });
                        } else {
                            console.log(`⚠️ [checkReceiversForNullTracks ${targetUserId}] Трек ${previousTrackId} был заменен на null, но его нет в remoteStream`);
                        }
                    }
                    
                    // Обновляем предыдущее состояние (сохраняем trackId, а не сам трек)
                    previousReceiverTracks.set(index, currentTrack ? currentTrack.id : null);
                });
                
                if (hasChanges) {
                    console.log(`🔄 Обновляем UI после удаления треков для ${targetUserId}`);
                    this.videoCallManager.uiManager.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                }
            };
            
            // Проверяем receivers периодически
            const receiverCheckInterval = setInterval(() => {
                if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
                    clearInterval(receiverCheckInterval);
                    previousReceiverTracks.clear();
                    return;
                }
                checkReceiversForNullTracks();
            }, 200); // Уменьшил интервал для более быстрой реакции
            
            // Обработчик получения удаленных треков
            console.log('🔄 [setupPeerConnection] Устанавливаем обработчик ontrack для:', targetUserId);
            peerConnection.ontrack = (event) => {
                console.log('🎥 [ontrack] Remote track received from:', targetUserId, 
                            'Track kind:', event.track.kind, 
                            'Track id:', event.track.id,
                            'Track readyState:', event.track.readyState,
                            'Track enabled:', event.track.enabled,
                            'Track muted:', event.track.muted,
                            'Streams count:', event.streams.length);
            
                // Создаем или получаем удаленный поток для этого пользователя
                if (!this.videoCallManager.remoteStreams.has(targetUserId)) {
                    const remoteStream = new MediaStream();
                    this.videoCallManager.remoteStreams.set(targetUserId, remoteStream);
                    this.videoCallManager.uiManager.createRemoteVideoElement(targetUserId, remoteStream);
                }
            
                // Добавляем полученный трек в поток
                const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                
                const track = event.track;
                
                // ВАЖНО: Если трек null (replaceTrack(null) был вызван), удаляем все видео треки из потока
                if (!track) {
                    console.log(`🗑️ Трек null получен для ${targetUserId}, удаляем все видео треки из потока`);
                    const videoTracks = remoteStream.getVideoTracks();
                    videoTracks.forEach(vt => remoteStream.removeTrack(vt));
                    this.videoCallManager.uiManager.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                    return;
                }
                
                // Если трек уже есть в потоке, обновляем его
                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                if (existingTrack && existingTrack !== track) {
                    remoteStream.removeTrack(existingTrack);
                }
                
                if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                    // ВАЖНО: Добавляем трек в remoteStream ВСЕГДА, даже если он временно muted или disabled
                    // Обработчики будут отслеживать изменения состояния и обновлять UI
                    remoteStream.addTrack(track);
                    console.log('✅ [ontrack] Added track to remote stream:', track.kind, track.id, 'enabled:', track.enabled, 'readyState:', track.readyState, 'muted:', track.muted);
                    console.log('✅ [ontrack] RemoteStream now has', remoteStream.getTracks().length, 'tracks:', remoteStream.getTracks().map(t => `${t.kind}:${t.id}`));
                    
                    // КРИТИЧНО: Если видео трек приходит как disabled или muted - камера выключена
                    // Сразу скрываем карточку и очищаем srcObject
                    if (track.kind === 'video' && (track.muted || !track.enabled)) {
                        console.log(`❌ Видео трек для ${targetUserId} пришел как ${track.muted ? 'muted' : 'disabled'} - камера выключена, скрываем карточку`);
                        // Удаляем трек из потока
                        remoteStream.removeTrack(track);
                        // Очищаем srcObject и скрываем карточку
                        const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                        const participantCard = document.getElementById(`participant-${targetUserId}`);
                        if (videoElement) {
                            videoElement.pause();
                            videoElement.srcObject = null;
                            try {
                                videoElement.load();
                            } catch (e) {}
                        }
                        if (participantCard) {
                            participantCard.style.setProperty('display', 'none', 'important');
                            participantCard.style.setProperty('visibility', 'hidden', 'important');
                            participantCard.style.setProperty('opacity', '0', 'important');
                            participantCard.style.setProperty('width', '0', 'important');
                            participantCard.style.setProperty('height', '0', 'important');
                            participantCard.style.setProperty('overflow', 'hidden', 'important');
                            participantCard.style.setProperty('pointer-events', 'none', 'important');
                        }
                        this.videoCallManager.uiManager.updateVideoOverlays();
                        this.videoCallManager.checkEmptyState();
                        return; // Не добавляем обработчики для неактивного трека
                    }
                    
                    // ВАЖНО: Обновляем UI после добавления трека
                    setTimeout(() => {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }, 50);
                    
                    // Добавляем обработчики для отслеживания изменений трека
                    track.onended = () => {
                        console.log(`Трек ${track.kind} завершился для пользователя ${targetUserId}`);
                        remoteStream.removeTrack(track);
                        this.videoCallManager.uiManager.updateVideoOverlays();
                        this.videoCallManager.checkEmptyState();
                    };
                    
                    // ВАЖНО: Отслеживаем изменения enabled и muted состояния трека
                    // Это нужно для отслеживания когда трек выключается через enabled = false или muted = true
                    let previousEnabled = track.enabled;
                    let previousMuted = track.muted;
                    
                    track.onmute = () => {
                        console.log(`🔇 Track ${track.kind} muted for ${targetUserId}`);
                        previousMuted = true;
                        // ВАЖНО: Немедленно удаляем muted видео трек из remoteStream
                        if (track.kind === 'video' && remoteStream.getTracks().includes(track)) {
                            remoteStream.removeTrack(track);
                            console.log(`🗑️ Removed muted video track from stream for ${targetUserId}`);
                            
                            // КРИТИЧНО: Очищаем srcObject немедленно
                            const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                            if (videoElement && videoElement.srcObject === remoteStream) {
                                console.log(`🔄 Очищаем srcObject немедленно (видео трек muted)`);
                                videoElement.pause();
                                videoElement.srcObject = null;
                                try {
                                    videoElement.load();
                                } catch (e) {
                                    // Игнорируем ошибки
                                }
                            }
                            
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                        }
                    };
                    
                    track.onunmute = () => {
                        console.log(`🔊 Track ${track.kind} unmuted for ${targetUserId}`);
                        previousMuted = false;
                        // ВАЖНО: Добавляем трек в поток при unmute ТОЛЬКО если он enabled и активен
                        if (track.enabled && !track.muted && track.readyState === 'live' && !remoteStream.getTracks().includes(track)) {
                            remoteStream.addTrack(track);
                            console.log(`✅ Added unmuted track to stream for ${targetUserId}`);
                            // ВАЖНО: Обновляем UI с небольшой задержкой, чтобы дать браузеру время обновить состояние трека
                            setTimeout(() => {
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                this.videoCallManager.checkEmptyState();
                            }, 50);
                        }
                    };
                    
                    // ВАЖНО: Также отслеживаем изменения enabled
                    const checkEnabled = () => {
                        if (track.enabled !== previousEnabled) {
                            console.log(`🔄 Track ${track.kind} enabled changed: ${previousEnabled} -> ${track.enabled} for ${targetUserId}`);
                            previousEnabled = track.enabled;
                            
                            if (!track.enabled) {
                                // Трек выключен - удаляем из потока НЕМЕДЛЕННО
                                if (remoteStream.getTracks().includes(track)) {
                                    remoteStream.removeTrack(track);
                                    console.log(`🗑️ Removed disabled ${track.kind} track from stream for ${targetUserId}`);
                                    
                                    // КРИТИЧНО: Если это видео трек - очищаем srcObject немедленно
                                    if (track.kind === 'video') {
                                        const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                                        if (videoElement && videoElement.srcObject === remoteStream) {
                                            console.log(`🔄 Очищаем srcObject немедленно (видео трек disabled)`);
                                            videoElement.pause();
                                            videoElement.srcObject = null;
                                            try {
                                                videoElement.load();
                                            } catch (e) {
                                                // Игнорируем ошибки
                                            }
                                        }
                                    }
                                    
                                    this.videoCallManager.uiManager.updateVideoOverlays();
                                    this.videoCallManager.checkEmptyState();
                                }
                            } else {
                                // Трек включен - добавляем в поток ТОЛЬКО если он не muted
                                if (!track.muted && !remoteStream.getTracks().includes(track)) {
                                    remoteStream.addTrack(track);
                                    console.log(`✅ Added enabled track back to stream for ${targetUserId}`);
                                    this.videoCallManager.uiManager.updateVideoOverlays();
                                    this.videoCallManager.checkEmptyState();
                                }
                            }
                        }
                        
                        // Продолжаем проверять
                        if (track.readyState === 'live') {
                            setTimeout(checkEnabled, 100);
                        }
                    };
                    checkEnabled();
                    
                    // ВАЖНО: Если трек приходит как muted, но enabled - ждем unmute события
                    // Это может произойти при инициализации трека
                    if (track.kind === 'video' && track.muted && track.enabled && track.readyState === 'live') {
                        console.log(`⏳ Видео трек для ${targetUserId} пришел как muted, но enabled - ждем unmute события...`);
                        // Устанавливаем обработчик unmute, который добавит трек в поток
                        const unmuteHandler = () => {
                            console.log(`✅ Видео трек для ${targetUserId} стал unmuted!`);
                            if (!remoteStream.getTracks().includes(track)) {
                                remoteStream.addTrack(track);
                                console.log(`✅ Added unmuted video track to stream for ${targetUserId}`);
                            }
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                            track.removeEventListener('unmute', unmuteHandler);
                        };
                        track.addEventListener('unmute', unmuteHandler);
                        // Также проверяем через 1 секунду на случай если событие не сработало
                        setTimeout(() => {
                            if (track.muted === false && track.enabled && !remoteStream.getTracks().includes(track)) {
                                console.log(`✅ Видео трек для ${targetUserId} стал unmuted через таймаут!`);
                                remoteStream.addTrack(track);
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                this.videoCallManager.checkEmptyState();
                            } else if (track.muted === true) {
                                console.log(`⚠️ Видео трек для ${targetUserId} все еще muted после таймаута`);
                            }
                            track.removeEventListener('unmute', unmuteHandler);
                        }, 1000);
                    }
                    
                    const checkTrackState = () => {
                        // ВАЖНО: Проверяем, что трек все еще есть в remoteStream
                        if (!remoteStream.getTracks().includes(track)) {
                            return; // Трек уже удален
                        }
                        
                        if (track.readyState === 'ended') {
                            console.log(`🗑️ Трек ${track.kind} завершился для ${targetUserId}, удаляем из потока`);
                            remoteStream.removeTrack(track);
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                            return;
                        }
                        
                        // ВАЖНО: Проверяем, что трек все еще есть в receivers И активен
                        const receivers = peerConnection.getReceivers();
                        const receiverTrack = receivers.find(r => r.track && r.track.id === track.id)?.track;
                        
                        console.log(`🔍 [checkTrackState ${targetUserId}] Проверка трека ${track.kind} (${track.id}):`, {
                            hasReceiver: !!receiverTrack,
                            receiverEnabled: receiverTrack?.enabled,
                            receiverMuted: receiverTrack?.muted,
                            receiverReadyState: receiverTrack?.readyState,
                            streamTrackEnabled: track.enabled,
                            streamTrackMuted: track.muted,
                            streamTrackReadyState: track.readyState
                        });
                        
                        if (!receiverTrack || !receiverTrack.enabled || receiverTrack.muted || receiverTrack.readyState !== 'live') {
                            console.log(`🗑️ [checkTrackState ${targetUserId}] УДАЛЯЕМ трек ${track.kind} (${track.id}) из потока`, {
                                hasReceiver: !!receiverTrack,
                                enabled: receiverTrack?.enabled,
                                muted: receiverTrack?.muted,
                                readyState: receiverTrack?.readyState,
                                streamTrackEnabled: track.enabled,
                                streamTrackMuted: track.muted,
                                streamTrackReadyState: track.readyState,
                                reason: !receiverTrack ? 'no receiver' : 
                                       !receiverTrack.enabled ? 'receiver disabled' :
                                       receiverTrack.muted ? 'receiver muted' :
                                       receiverTrack.readyState !== 'live' ? 'receiver not live' : 'unknown'
                            });
                            remoteStream.removeTrack(track);
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                            return;
                        }
                        
                        // ВАЖНО: Синхронизируем состояние трека в remoteStream с состоянием в receivers
                        // Если трек в receivers неактивен, но трек в remoteStream активен - удаляем его
                        if (track.kind === 'video' && track.enabled && !track.muted && track.readyState === 'live') {
                            if (!receiverTrack.enabled || receiverTrack.muted || receiverTrack.readyState !== 'live') {
                                console.log(`🔄 [checkTrackState ${targetUserId}] Синхронизация: трек в remoteStream активен, но в receivers неактивен, удаляем из потока`, {
                                    receiverEnabled: receiverTrack.enabled,
                                    receiverMuted: receiverTrack.muted,
                                    receiverReadyState: receiverTrack.readyState
                                });
                                remoteStream.removeTrack(track);
                                
                                // КРИТИЧНО: Очищаем srcObject немедленно
                                const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                                if (videoElement && videoElement.srcObject === remoteStream) {
                                    console.log(`🔄 Очищаем srcObject немедленно (синхронизация с receivers)`);
                                    videoElement.pause();
                                    videoElement.srcObject = null;
                                    try {
                                        videoElement.load();
                                    } catch (e) {
                                        // Игнорируем ошибки
                                    }
                                }
                                
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                this.videoCallManager.checkEmptyState();
                                return;
                            }
                        }
                        
                        // ВАЖНО: Если видео трек disabled ИЛИ muted, это значит камера выключена
                        // Удаляем трек из потока чтобы карточка скрылась
                        if (track.kind === 'video' && track.readyState === 'live') {
                            if (!track.enabled || track.muted) {
                                console.log(`🗑️ Видео трек для ${targetUserId} неактивен (enabled: ${track.enabled}, muted: ${track.muted}), удаляем из потока`);
                                remoteStream.removeTrack(track);
                                
                                // КРИТИЧНО: Очищаем srcObject немедленно
                                const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                                if (videoElement && videoElement.srcObject === remoteStream) {
                                    console.log(`🔄 Очищаем srcObject немедленно (видео трек неактивен)`);
                                    videoElement.pause();
                                    videoElement.srcObject = null;
                                    try {
                                        videoElement.load();
                                    } catch (e) {
                                        // Игнорируем ошибки
                                    }
                                }
                                
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                this.videoCallManager.checkEmptyState();
                                return;
                            }
                        }
                        
                        // Проверяем изменения enabled
                        if (track.enabled !== previousEnabled) {
                            console.log(`Трек ${track.kind} enabled изменился для пользователя ${targetUserId}: ${previousEnabled} -> ${track.enabled}`);
                            previousEnabled = track.enabled;
                            // Если видео трек disabled, удаляем его
                            if (track.kind === 'video' && !track.enabled) {
                                console.log(`🗑️ Видео трек для ${targetUserId} disabled, удаляем из потока`);
                                remoteStream.removeTrack(track);
                                
                                // КРИТИЧНО: Очищаем srcObject немедленно
                                const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                                if (videoElement && videoElement.srcObject === remoteStream) {
                                    console.log(`🔄 Очищаем srcObject немедленно (видео трек disabled)`);
                                    videoElement.pause();
                                    videoElement.srcObject = null;
                                    try {
                                        videoElement.load();
                                    } catch (e) {
                                        // Игнорируем ошибки
                                    }
                                }
                                
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                this.videoCallManager.checkEmptyState();
                                return;
                            }
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                        }
                        
                        // Проверяем изменения muted
                        if (track.muted !== previousMuted) {
                            console.log(`Трек ${track.kind} muted изменился для пользователя ${targetUserId}: ${previousMuted} -> ${track.muted}`);
                            previousMuted = track.muted;
                            // Если видео трек muted, удаляем его
                            if (track.kind === 'video' && track.muted) {
                                console.log(`🗑️ Видео трек для ${targetUserId} стал muted, удаляем из потока`);
                                remoteStream.removeTrack(track);
                                
                                // КРИТИЧНО: Очищаем srcObject немедленно
                                const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                                if (videoElement && videoElement.srcObject === remoteStream) {
                                    console.log(`🔄 Очищаем srcObject немедленно (видео трек muted)`);
                                    videoElement.pause();
                                    videoElement.srcObject = null;
                                    try {
                                        videoElement.load();
                                    } catch (e) {
                                        // Игнорируем ошибки
                                    }
                                }
                                
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                this.videoCallManager.checkEmptyState();
                                return;
                            }
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                        }
                        
                        // Проверяем состояние каждые 200мс для более быстрой реакции
                        setTimeout(() => {
                            if (remoteStream.getTracks().includes(track)) {
                                checkTrackState();
                            }
                        }, 200);
                    };
                    // ВАЖНО: Вызываем сразу для проверки начального состояния
                    checkTrackState();
                    
                    // Если это аудио трек, убеждаемся что он воспроизводится
                    if (track.kind === 'audio' && videoElement) {
                        console.log('Audio track added, ensuring playback');
                        videoElement.muted = false;
                        videoElement.volume = 1.0;
                        // Обновляем srcObject чтобы аудио начало воспроизводиться
                        if (videoElement.srcObject !== remoteStream) {
                            videoElement.srcObject = remoteStream;
                        }
                        videoElement.play().catch(err => {
                            // Игнорируем ошибки связанные с aborted - это нормально при очистке srcObject
                            if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                console.warn('⚠️ [ontrack] Ошибка воспроизведения аудио:', err);
                            }
                        });
                    }
                }
            
            // ВАЖНО: НЕ управляем видимостью карточки здесь - это делает updateVideoOverlays()
            // Проверяем есть ли активный видео трек в receivers - это единственный надежный источник
            const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
            let hasActiveVideoInReceivers = false;
            
            if (peerConnection) {
                const receivers = peerConnection.getReceivers();
                hasActiveVideoInReceivers = receivers.some(receiver => {
                    const track = receiver.track;
                    return track && 
                           track.kind === 'video' && 
                           track.readyState === 'live' && 
                           track.enabled && 
                           !track.muted;
                });
            }
            
            // Также проверяем треки в потоке
            const videoTracks = remoteStream.getVideoTracks();
            const hasActiveVideoTracks = videoTracks.length > 0 && 
                                       videoTracks.some(t => 
                                           t && 
                                           t.readyState === 'live' && 
                                           t.enabled && 
                                           !t.muted
                                       );
            
            // Видео активно ТОЛЬКО если оно активно И в receivers И в потоке
            const hasActiveVideo = hasActiveVideoInReceivers && hasActiveVideoTracks;
            
            if (videoElement) {
                if (hasActiveVideo) {
                    // Если есть АКТИВНОЕ видео - устанавливаем srcObject
                    if (videoElement.srcObject !== remoteStream) {
                        console.log(`🔄 [ontrack ${targetUserId}] Устанавливаем srcObject, активные video tracks:`, videoTracks.filter(t => t.enabled && !t.muted).map(t => `${t.id}`));
                        videoElement.srcObject = remoteStream;
                        // Пробуем воспроизвести видео
                        videoElement.play().catch(err => {
                            // Игнорируем ошибки связанные с aborted - это нормально при очистке
                            if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                console.warn(`⚠️ [ontrack ${targetUserId}] Ошибка play:`, err);
                            }
                        });
                    }
                } else {
                    // Если нет АКТИВНОГО видео - очищаем srcObject
                    // Это предотвращает показ черного экрана
                    if (videoElement.srcObject === remoteStream || videoElement.srcObject !== null) {
                        console.log(`🔄 [ontrack ${targetUserId}] Очищаем srcObject (нет активного видео в receivers или потоке)`);
                        // Сначала останавливаем воспроизведение
                        videoElement.pause();
                        // Потом очищаем srcObject
                        videoElement.srcObject = null;
                        // Используем load() для полной очистки
                        try {
                            videoElement.load();
                        } catch (e) {
                            // Игнорируем ошибки load()
                        }
                    }
                }
            }
        
            // Обновляем UI сразу после добавления трека с небольшой задержкой
            // чтобы дать треку время инициализироваться
            // ВАЖНО: Обновляем дважды - сразу и через задержку, чтобы убедиться что карточка скрыта если трек неактивен
            this.videoCallManager.uiManager.updateVideoOverlays();
            setTimeout(() => {
                this.videoCallManager.uiManager.updateVideoOverlays();
                this.videoCallManager.checkEmptyState();
            }, 100);
            };
        
            // Обработчик изменения состояния соединения
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log('Connection state with', targetUserId, ':', state);
            
                if (state === 'connected') {
                    this.videoCallManager.notificationManager.show('Звонок подключен', 'success');
                    console.log('✅ WebRTC connection established!');
                } else if (state === 'disconnected') {
                    this.videoCallManager.notificationManager.show('Звонок отключен', 'warning');
                } else if (state === 'failed') {
                    console.error('❌ Connection failed - attempting ICE restart...');
                    this.videoCallManager.notificationManager.show('Обнаружены проблемы с соединением', 'warning');
                
                    // Пытаемся перезапустить ICE через 3 секунды
                    setTimeout(() => {
                        if (this.videoCallManager.remoteUsers.has(targetUserId) && 
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
                    console.error('❌ ICE connection failed - attempting restart');
                    // Пытаемся перезапустить ICE через renegotiation
                    setTimeout(() => {
                        if (this.videoCallManager.remoteUsers.has(targetUserId)) {
                            const pc = this.videoCallManager.remoteUsers.get(targetUserId);
                            if (pc.iceConnectionState === 'failed' && pc.signalingState === 'stable') {
                                console.log('🔄 Attempting ICE restart via renegotiation for', targetUserId);
                                this.createOffer(targetUserId).catch(err => {
                                    console.error('Error during ICE restart:', err);
                                });
                            }
                        }
                    }, 2000);
                }
            };
        
            // Обработчик необходимости переговоров (renegotiation)
            peerConnection.onnegotiationneeded = () => {
                console.log('Negotiation needed for:', targetUserId);
                // Не запускаем автоматически, чтобы избежать конфликтов
                // Будем запускать вручную когда нужно
            };
        
            // Обработчик изменения состояния ICE gathering
            peerConnection.onicegatheringstatechange = () => {
                console.log('ICE gathering state for', targetUserId, ':', 
                            peerConnection.iceGatheringState);
            };
        
            // Сохраняем соединение в Map
            this.videoCallManager.remoteUsers.set(targetUserId, peerConnection);
        
            console.log('✅ [setupPeerConnection] Peer connection setup completed for:', targetUserId);
            console.log('✅ [setupPeerConnection] Обработчик ontrack установлен для:', targetUserId);
        
        } catch (error) {
            console.error('❌ Error setting up peer connection:', error);
            this.videoCallManager.notificationManager.show('Не удалось установить соединение: ' + error.message, 'error');
        }
    }

    async createOffer(targetUserId) {
        if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
            console.error('No peer connection for:', targetUserId);
            return;
        }
    
        try {
            const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
            
            // ВАЖНО: Проверяем состояние соединения перед созданием offer
            const currentState = peerConnection.signalingState;
            console.log(`📊 Signaling state before offer for ${targetUserId}:`, currentState);
            
            // ЕСЛИ соединение в failed - пересоздаем его
            if (peerConnection.connectionState === 'failed' || peerConnection.iceConnectionState === 'failed') {
                console.log('🔄 Connection failed, recreating for:', targetUserId);
                try {
                    peerConnection.close();
                } catch (e) {
                    console.error('Error closing failed connection:', e);
                }
                this.videoCallManager.remoteUsers.delete(targetUserId);
                // Удаляем удаленный поток если есть
                if (this.videoCallManager.remoteStreams.has(targetUserId)) {
                    const stream = this.videoCallManager.remoteStreams.get(targetUserId);
                    stream.getTracks().forEach(track => track.stop());
                    this.videoCallManager.remoteStreams.delete(targetUserId);
                }
                // Удаляем UI элемент участника
                const participantCard = document.getElementById(`participant-${targetUserId}`);
                if (participantCard) {
                    participantCard.remove();
                }
                // Пересоздаем соединение ТОЛЬКО если есть локальный поток
                if (this.videoCallManager.localStream) {
                    this.setupPeerConnection(targetUserId);
                    // Ждем немного и создаем оффер
                    setTimeout(() => {
                        if (this.videoCallManager.remoteUsers.has(targetUserId)) {
                            this.createOffer(targetUserId).catch(err => {
                                console.error('Error creating offer after recreation:', err);
                            });
                        }
                    }, 500);
                } else {
                    console.log('⚠️ No local stream, will recreate connection when stream is available');
                }
                return;
            }
            
            // ВАЖНО: Если уже есть локальный offer, ждем его обработки
            if (currentState === 'have-local-offer') {
                console.log(`⏳ Already have local offer for ${targetUserId}, waiting...`);
                // Ждем немного и проверяем снова
                setTimeout(() => {
                    if (this.videoCallManager.remoteUsers.has(targetUserId)) {
                        const newState = this.videoCallManager.remoteUsers.get(targetUserId).signalingState;
                        if (newState === 'stable') {
                            console.log(`🔄 Signaling stable, creating new offer for ${targetUserId}`);
                            this.createOffer(targetUserId).catch(console.error);
                        }
                    }
                }, 1000);
                return;
            }
            
            // ВАЖНО: Убедимся что все треки добавлены перед созданием offer
            if (this.videoCallManager.localStream) {
                const existingSenders = peerConnection.getSenders();
                const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
                const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
                
                // ВАЖНО: Добавляем видео трек если он есть, enabled и еще не добавлен
                if (videoTrack && videoTrack.enabled && !existingSenders.some(s => s.track?.kind === 'video')) {
                    console.log(`🎯 Adding missing video track to ${targetUserId} before offer`);
                    try {
                        peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                        console.log(`✅ Video track added before offer for ${targetUserId}`);
                    } catch (error) {
                        console.error(`❌ Error adding video track before offer:`, error);
                    }
                }
                
                // ВАЖНО: Добавляем аудио трек если он есть, enabled и еще не добавлен
                if (audioTrack && audioTrack.enabled && !existingSenders.some(s => s.track?.kind === 'audio')) {
                    console.log(`🎯 Adding missing audio track to ${targetUserId} before offer`);
                    try {
                        peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                        console.log(`✅ Audio track added before offer for ${targetUserId}`);
                    } catch (error) {
                        console.error(`❌ Error adding audio track before offer:`, error);
                    }
                }
            }
        
            // Используем стандартные опции, но с правильными настройками для медиа
            const offerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            };
            
            console.log(`📤 Creating offer for ${targetUserId}...`);
            const offer = await peerConnection.createOffer(offerOptions);
        
            // Убеждаемся, что все transceivers правильно настроены
            peerConnection.getTransceivers().forEach((transceiver, index) => {
                if (transceiver.sender.track) {
                    // Если есть отправляемый трек, должно быть sendrecv или sendonly
                    if (transceiver.direction === 'inactive' || transceiver.direction === 'recvonly') {
                        transceiver.direction = 'sendrecv';
                        console.log(`🔄 Fixed transceiver ${index} direction to sendrecv`);
                    }
                }
            });
        
            await peerConnection.setLocalDescription(offer);
            console.log(`✅ Local description set for ${targetUserId}`);
        
            console.log('📤 Sending offer to:', targetUserId);
            console.log('SDP offer direction check:');
            peerConnection.getTransceivers().forEach((transceiver, index) => {
                console.log(`Transceiver ${index}:`, {
                    direction: transceiver.direction,
                    currentDirection: transceiver.currentDirection,
                    kind: transceiver.receiver.track?.kind || transceiver.sender.track?.kind || 'no track'
                });
            });
        
            this.videoCallManager.socket.emit('webrtc_offer', {
                target_user_id: targetUserId,
                offer: offer
            });
            console.log(`📤 Offer sent to ${targetUserId}`);
        
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleWebRTCOffer(data) {
        try {
            console.log('📥 [handleWebRTCOffer] Received offer from:', data.sender_id);
            console.log('📥 [handleWebRTCOffer] Current signaling state:', this.videoCallManager.remoteUsers.has(data.sender_id) ? 
                this.videoCallManager.remoteUsers.get(data.sender_id).signalingState : 'no connection');
        
            // Если соединение с этим пользователем еще не создано, создаем его
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.log('🔄 Peer connection не существует для', data.sender_id, ', создаем...');
                this.setupPeerConnection(data.sender_id);
            }
            
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            
            // ВАЖНО: Проверяем текущее состояние signaling
            const currentSignalingState = peerConnection.signalingState;
            console.log('📥 Current signaling state before setting remote description:', currentSignalingState);
            
            // Если уже есть локальный offer, значит мы уже отправили offer этому пользователю
            // В этом случае нужно обработать race condition
            if (currentSignalingState === 'have-local-offer') {
                console.log('⚠️ Уже есть локальный offer для', data.sender_id, ', обрабатываем race condition...');
                // Устанавливаем remote description - это может вызвать renegotiation
                await peerConnection.setRemoteDescription(data.offer);
                // Создаем новый answer
                const answer = await peerConnection.createAnswer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                await peerConnection.setLocalDescription(answer);
                this.videoCallManager.socket.emit('webrtc_answer', {
                    target_user_id: data.sender_id,
                    answer: answer
                });
                console.log('✅ Отправлен answer после race condition для', data.sender_id);
                return;
            }
            
            // ВАЖНО: Убеждаемся, что локальные треки добавлены ПЕРЕД установкой remote description
            // Это нужно чтобы answer содержал информацию о наших треках
            if (this.videoCallManager.localStream) {
                console.log('🔄 Проверяем локальные треки перед обработкой offer...');
                const existingSenders = peerConnection.getSenders();
                const hasVideoSender = existingSenders.some(s => s.track && s.track.kind === 'video');
                const hasAudioSender = existingSenders.some(s => s.track && s.track.kind === 'audio');
                
                console.log('🔄 Existing senders:', { hasVideoSender, hasAudioSender });
                
                if (!hasVideoSender) {
                    const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
                    if (videoTrack && videoTrack.enabled) {
                        peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                        console.log('✅ Added video track when handling offer');
                    } else {
                        console.log('⚠️ Video track не доступен или disabled');
                    }
                }
                
                if (!hasAudioSender) {
                    const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
                    if (audioTrack && audioTrack.enabled) {
                        peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                        console.log('✅ Added audio track when handling offer');
                    } else {
                        console.log('⚠️ Audio track не доступен или disabled');
                    }
                }
            } else {
                console.log('⚠️ Локальный поток не доступен при обработке offer');
            }
            
            // Устанавливаем полученное предложение (offer) как удаленное описание
            await peerConnection.setRemoteDescription(data.offer);
            console.log('✅ Remote description установлено для', data.sender_id);
        
            // Создаем ответ (answer) с правильными опциями
            const answer = await peerConnection.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            // Убеждаемся, что transceivers правильно настроены
            peerConnection.getTransceivers().forEach((transceiver) => {
                if (transceiver.direction === 'inactive' && transceiver.sender.track) {
                    transceiver.direction = 'sendrecv';
                }
            });
            
            // Устанавливаем созданный ответ как локальное описание
            await peerConnection.setLocalDescription(answer);
            console.log('✅ [handleWebRTCOffer] Local description set, signalingState:', peerConnection.signalingState);
            
            // ВАЖНО: После установки local description треки должны прийти через ontrack
            // Но иногда они уже есть в receivers, поэтому проверяем их тоже
            setTimeout(() => {
                const receivers = peerConnection.getReceivers();
                console.log(`🔍 [handleWebRTCOffer] Проверка receivers после установки local description для ${data.sender_id}:`, receivers.length);
                receivers.forEach((receiver, index) => {
                    const track = receiver.track;
                    console.log(`  [handleWebRTCOffer] Receiver ${index}: kind=${receiver.track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                });
            }, 100);
        
            console.log('📤 [handleWebRTCOffer] Sending answer to:', data.sender_id);
            console.log('Answer transceivers:');
            peerConnection.getTransceivers().forEach((transceiver, index) => {
                console.log(`Transceiver ${index}:`, {
                    direction: transceiver.direction,
                    currentDirection: transceiver.currentDirection,
                    kind: transceiver.receiver.track?.kind || transceiver.sender.track?.kind || 'no track'
                });
            });
            
            // Отправляем ответ обратно инициатору через signaling-сервер
            this.videoCallManager.socket.emit('webrtc_answer', {
                target_user_id: data.sender_id,
                answer: answer
            });
        
        } catch (error) {
            console.error('Error handling WebRTC offer:', error);
        }
    }

    async handleWebRTCAnswer(data) {
        try {
            console.log('📥 [handleWebRTCAnswer] Received ANSWER from:', data.sender_id);
            console.log('📥 [handleWebRTCAnswer] Answer SDP:', data.answer.sdp.substring(0, 100) + '...');
        
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.error('❌ [handleWebRTCAnswer] No peer connection for:', data.sender_id);
                return;
            }
        
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            console.log('📥 [handleWebRTCAnswer] Setting remote description, current signalingState:', peerConnection.signalingState);
            await peerConnection.setRemoteDescription(data.answer);
            console.log('✅ [handleWebRTCAnswer] Remote description set successfully, new signalingState:', peerConnection.signalingState);
            
            // ВАЖНО: Проверяем, есть ли уже треки в соединении после установки remote description
            
            // ВАЖНО: После установки remote description треки должны прийти через ontrack
            // Но иногда они уже есть в receivers, поэтому проверяем их тоже
            setTimeout(() => {
                const receivers = peerConnection.getReceivers();
                console.log(`🔍 [handleWebRTCAnswer] Проверка receivers после установки remote description для ${data.sender_id}:`, receivers.length);
                console.log(`🔍 [handleWebRTCAnswer] Текущие remoteStreams:`, Array.from(this.videoCallManager.remoteStreams.keys()));
                receivers.forEach((receiver, index) => {
                    const track = receiver.track;
                    console.log(`  Receiver ${index}: kind=${receiver.track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                    // ВАЖНО: Если track null, не обрабатываем его
                    if (!track) {
                        console.log(`⚠️ Receiver ${index} имеет null track, пропускаем`);
                        return;
                    }
                    // ВАЖНО: Проверяем, есть ли уже remoteStream для этого пользователя
                    if (!this.videoCallManager.remoteStreams.has(data.sender_id)) {
                        const remoteStream = new MediaStream();
                        this.videoCallManager.remoteStreams.set(data.sender_id, remoteStream);
                        this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                    }
                    const remoteStream = this.videoCallManager.remoteStreams.get(data.sender_id);
                    
                    // ВАЖНО: Добавляем трек в поток ВСЕГДА если он live и еще не добавлен
                    // Даже если трек временно muted или disabled, он может стать активным позже
                    if (track && track.readyState === 'live' && !remoteStream.getTracks().some(t => t.id === track.id)) {
                        console.log(`✅ [handleWebRTCAnswer] Трек ${track.kind} (${track.id}) для ${data.sender_id}, добавляем в поток (enabled=${track.enabled}, muted=${track.muted})...`);
                        remoteStream.addTrack(track);
                        console.log(`✅ [handleWebRTCAnswer] RemoteStream теперь имеет ${remoteStream.getTracks().length} треков:`, remoteStream.getTracks().map(t => `${t.kind}:${t.id}`));
                        // Обновляем UI
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    } else if (track && track.readyState !== 'live') {
                        console.log(`⚠️ [handleWebRTCAnswer] Трек ${track.kind} (${track.id}) для ${data.sender_id} не live (readyState=${track.readyState}), не добавляем в поток`);
                    }
                });
            }, 100);
        
        } catch (error) {
            console.error('Error handling WebRTC answer:', error);
        }
    }

    async handleICECandidate(data) {
        try {
            console.log('Received ICE candidate from:', data.sender_id);
            
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.error('No peer connection for:', data.sender_id);
                return;
            }
            
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            await peerConnection.addIceCandidate(data.candidate);
            
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }

    addTracksToPeerConnection(targetUserId) {
        if (!this.videoCallManager.localStream) {
            console.log('⚠️ No local stream available for adding tracks to peer connection');
            return;
        }
        
        const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
        if (!peerConnection) {
            console.log(`⚠️ No peer connection found for ${targetUserId}`);
            return;
        }
        
        console.log(`🔄 Adding tracks to peer connection for ${targetUserId}`);
        
        const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
        const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
        
        // Проверяем, есть ли уже senders для этих треков
        const senders = peerConnection.getSenders();
        const hasVideoSender = senders.some(s => s.track && s.track.kind === 'video');
        const hasAudioSender = senders.some(s => s.track && s.track.kind === 'audio');
        
        // Добавляем видео трек если его нет
        if (videoTrack && videoTrack.enabled && !hasVideoSender) {
            try {
                peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                console.log(`✅ Video track added to peer connection for ${targetUserId}`);
            } catch (error) {
                console.error(`❌ Error adding video track to peer connection for ${targetUserId}:`, error);
            }
        }
        
        // Добавляем аудио трек если его нет
        if (audioTrack && audioTrack.enabled && !hasAudioSender) {
            try {
                peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                console.log(`✅ Audio track added to peer connection for ${targetUserId}`);
            } catch (error) {
                console.error(`❌ Error adding audio track to peer connection for ${targetUserId}:`, error);
            }
        }
    }

    addTracksToExistingConnections() {
        if (!this.videoCallManager.localStream) return;
        
        this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
            // ЕСЛИ соединение в состоянии failed - пересоздаем его
            if (peerConnection.connectionState === 'failed' || peerConnection.iceConnectionState === 'failed') {
                console.log('🔄 Connection failed, recreating for:', userId);
                try {
                    peerConnection.close();
                } catch (e) {
                    console.error('Error closing failed connection:', e);
                }
                this.videoCallManager.remoteUsers.delete(userId);
                // Пересоздаем соединение с треками
                this.setupPeerConnection(userId);
                return;
            }
            
            const existingSenders = peerConnection.getSenders();
            const hasVideoSender = existingSenders.some(sender => 
                sender.track && sender.track.kind === 'video'
            );
            const hasAudioSender = existingSenders.some(sender => 
                sender.track && sender.track.kind === 'audio'
            );
            
            let tracksAdded = false;
            
            if (!hasVideoSender) {
                const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
                if (videoTrack && videoTrack.enabled) {
                    peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                    tracksAdded = true;
                    console.log('Added video track to existing connection:', userId);
                }
            }
            
            if (!hasAudioSender) {
                const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
                if (audioTrack && audioTrack.enabled) {
                    peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                    tracksAdded = true;
                    console.log('Added audio track to existing connection:', userId);
                }
            }
            
            // Если треки были добавлены, запускаем renegotiation
            if (tracksAdded) {
                console.log('Tracks added to existing connection, triggering renegotiation:', userId);
                // Ждем немного чтобы треки успели добавиться
                setTimeout(() => {
                    if (this.videoCallManager.remoteUsers.has(userId)) {
                        const pc = this.videoCallManager.remoteUsers.get(userId);
                        if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
                            this.createOffer(userId).catch(err => {
                                console.error('Error creating offer after adding tracks:', err);
                            });
                        }
                    }
                }, 200);
            }
        });
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
}

