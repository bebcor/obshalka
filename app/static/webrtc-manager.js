// Модуль для управления WebRTC соединениями
class WebRTCManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    /**
     * Проверяет состояние трека в receivers и синхронизирует с потоком
     * @param {string} targetUserId - ID удаленного пользователя
     * @param {MediaStreamTrack} track - Трек для проверки
     * @returns {Object} { hasActiveVideo: boolean, hasActiveAudio: boolean, shouldRemove: boolean }
     */
    checkAndSyncTrackWithReceivers(targetUserId, track) {
        const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
        const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
        
        if (!peerConnection || !remoteStream) {
            console.log(`⚠️ [checkAndSyncTrackWithReceivers ${targetUserId}] Нет peerConnection или remoteStream`);
            return { hasActiveVideo: false, hasActiveAudio: false, shouldRemove: false };
        }
        
        const receivers = peerConnection.getReceivers();
        const receiverTrack = receivers.find(r => r.track && r.track.id === track.id)?.track;
        
        // Если трека нет в receivers - это может быть временное состояние, не удаляем сразу
        if (!receiverTrack) {
            console.log(`🔍 [checkAndSyncTrackWithReceivers ${targetUserId}] Трек ${track.kind} (${track.id}) не найден в receivers`);
            return { 
                hasActiveVideo: track.kind === 'video' && track.enabled && !track.muted && track.readyState === 'live',
                hasActiveAudio: track.kind === 'audio' && track.enabled && !track.muted && track.readyState === 'live',
                shouldRemove: false 
            };
        }
        
        // Проверяем состояние трека в receivers
        const isActive = receiverTrack.enabled && 
                        !receiverTrack.muted && 
                        receiverTrack.readyState === 'live';
        
        console.log(`🔍 [checkAndSyncTrackWithReceivers ${targetUserId}] Трек ${track.kind} (${track.id}):`, {
            receiverEnabled: receiverTrack.enabled,
            receiverMuted: receiverTrack.muted,
            receiverReadyState: receiverTrack.readyState,
            streamEnabled: track.enabled,
            streamMuted: track.muted,
            streamReadyState: track.readyState,
            isActive: isActive
        });
        
        // Для видео треков: если трек неактивен в receivers, удаляем из потока
        if (track.kind === 'video') {
            if (!isActive) {
                // Трек неактивен - удаляем из потока
                if (remoteStream.getTracks().includes(track)) {
                    console.log(`🗑️ [checkAndSyncTrackWithReceivers ${targetUserId}] Удаляем неактивный видео трек из потока`);
                    remoteStream.removeTrack(track);
                    return { hasActiveVideo: false, hasActiveAudio: false, shouldRemove: true };
                }
            }
            return { hasActiveVideo: isActive, hasActiveAudio: false, shouldRemove: false };
        }
        
        // Для аудио треков
        if (track.kind === 'audio') {
            if (!isActive && remoteStream.getTracks().includes(track)) {
                console.log(`🗑️ [checkAndSyncTrackWithReceivers ${targetUserId}] Удаляем неактивный аудио трек из потока`);
                remoteStream.removeTrack(track);
                return { hasActiveVideo: false, hasActiveAudio: false, shouldRemove: true };
            }
            return { hasActiveVideo: false, hasActiveAudio: isActive, shouldRemove: false };
        }
        
        return { hasActiveVideo: false, hasActiveAudio: false, shouldRemove: false };
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
                    const receiver = receivers.find(r => r.track && r.track.id === streamTrack.id);
                    const receiverTrack = receiver?.track;
                    
                    console.log(`🔍 [checkReceiversForNullTracks ${targetUserId}] Проверка трека ${streamTrack.kind} (${streamTrack.id}):`, {
                        hasReceiver: !!receiver,
                        receiverTrackIsNull: receiver && !receiverTrack,
                        receiverEnabled: receiverTrack?.enabled,
                        receiverMuted: receiverTrack?.muted,
                        receiverReadyState: receiverTrack?.readyState,
                        streamEnabled: streamTrack.enabled,
                        streamMuted: streamTrack.muted,
                        streamReadyState: streamTrack.readyState
                    });
                    
                    // КРИТИЧНО: Для видео треков удаляем если:
                    // 1. Receiver существует, но track === null (replaceTrack(null) был вызван)
                    // 2. Трек есть в receivers, но неактивен (disabled, muted, или не live)
                    // НЕ удаляем если receivers пустые (receiversCount === 0) - это может быть временное состояние при переподключении
                    let shouldRemove = false;
                    let reason = '';
                    
                    if (streamTrack.kind === 'video') {
                        // ВАЖНО: Если receivers пустые, не удаляем трек - это может быть временное состояние
                        if (receivers.length === 0) {
                            shouldRemove = false;
                            reason = 'receivers empty (temporary state, skipping)';
                        } else if (receiver && !receiverTrack) {
                            // КРИТИЧНО: Receiver существует, но track === null - это означает replaceTrack(null)
                            // ЭТО ЕДИНСТВЕННЫЙ СЛУЧАЙ когда удаляем трек - камера полностью отключена
                            shouldRemove = true;
                            reason = 'receiver track is null (replaceTrack(null))';
                        } else if (receiverTrack) {
                            // Трек есть в receivers - НЕ УДАЛЯЕМ даже если disabled!
                            // Удаляем ТОЛЬКО если трек ended (полностью завершен)
                            if (receiverTrack.readyState === 'ended') {
                                shouldRemove = true;
                                reason = 'receiver track ended';
                            } else {
                                // Трек live, но может быть disabled - НЕ УДАЛЯЕМ!
                                // Оставляем трек в потоке, управление через enabled/muted
                                shouldRemove = false;
                                reason = 'receiver track exists (keeping in stream, managed by enabled/muted)';
                            }
                        } else {
                            // Нет receiver для этого трека, но receivers не пустые
                            // ВАЖНО: Не удаляем сразу - возможно трек еще не был добавлен в receivers
                            // Удаляем только если трек ended
                            if (streamTrack.readyState === 'ended') {
                                shouldRemove = true;
                                reason = 'no receiver found and stream track ended';
                            } else {
                                // Трек live, но нет receiver - возможно временное состояние
                                shouldRemove = false;
                                reason = 'no receiver found but stream track live (temporary state, skipping)';
                            }
                        }
                    }
                    
                    if (shouldRemove) {
                        console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] УДАЛЯЕМ трек ${streamTrack.kind} (${streamTrack.id}) из потока: ${reason}`, {
                            hasReceiver: !!receiver,
                            receiverTrackIsNull: receiver && !receiverTrack,
                            receiverEnabled: receiverTrack?.enabled,
                            receiverMuted: receiverTrack?.muted,
                            receiverReadyState: receiverTrack?.readyState,
                            streamEnabled: streamTrack.enabled,
                            streamMuted: streamTrack.muted,
                            streamReadyState: streamTrack.readyState
                        });
                        remoteStream.removeTrack(streamTrack);
                        hasChanges = true;
                    } else {
                        console.log(`✅ [checkReceiversForNullTracks ${targetUserId}] Трек ${streamTrack.kind} (${streamTrack.id}) активен или временное состояние, оставляем`);
                    }
                });
                
                // ВАЖНО: Также проверяем, что receivers с null track не имеют соответствующих треков в потоке
                // Это критично для обработки replaceTrack(null)
                receivers.forEach((receiver, index) => {
                    const currentTrack = receiver.track;
                    const previousTrackId = previousReceiverTracks.get(index);
                    
                    // КРИТИЧНО: Если receiver.track === null для видео receiver - это означает replaceTrack(null)
                    // Удаляем все видео треки из потока, которые могут соответствовать этому receiver
                    if (!currentTrack && receiver.track === null) {
                        // Проверяем, есть ли видео треки в потоке, которые могут быть от этого receiver
                        // Если previousTrackId известен - удаляем конкретный трек
                        if (previousTrackId) {
                            const tracksToRemove = remoteStream.getTracks().filter(t => t.id === previousTrackId && t.kind === 'video');
                            if (tracksToRemove.length > 0) {
                                tracksToRemove.forEach(track => {
                                    console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] Receiver ${index} трек ${previousTrackId} заменен на null (replaceTrack(null)), удаляем из потока`);
                                    remoteStream.removeTrack(track);
                                    hasChanges = true;
                                });
                            }
                        } else {
                            // Если previousTrackId неизвестен, но receiver.track === null и это видео receiver
                            // Удаляем все видео треки из потока (более агрессивный подход)
                            const videoTracks = remoteStream.getVideoTracks();
                            if (videoTracks.length > 0) {
                                console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] Receiver ${index} track === null (replaceTrack(null)), удаляем все видео треки из потока`);
                                videoTracks.forEach(track => {
                                    remoteStream.removeTrack(track);
                                    hasChanges = true;
                                });
                            }
                        }
                    }
                    
                    // ВАЖНО: НЕ удаляем треки если они просто muted или disabled!
                    // Удаляем ТОЛЬКО если трек ended (полностью завершен)
                    // Управление отображением через enabled/muted, а не через удаление треков
                    if (currentTrack && currentTrack.kind === 'video') {
                        // Удаляем ТОЛЬКО если трек ended
                        if (currentTrack.readyState === 'ended') {
                            const tracksToRemove = remoteStream.getTracks().filter(t => t.id === currentTrack.id && t.kind === 'video');
                            if (tracksToRemove.length > 0) {
                                tracksToRemove.forEach(track => {
                                    console.log(`🗑️ [checkReceiversForNullTracks ${targetUserId}] Receiver ${index} трек ${currentTrack.id} ended, удаляем из потока`);
                                    remoteStream.removeTrack(track);
                                    hasChanges = true;
                                });
                            }
                        } else {
                            // Трек live (даже если muted или disabled) - НЕ УДАЛЯЕМ!
                            // Оставляем трек в потоке, управление через enabled/muted
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
            
                // КРИТИЧНО: После получения трека через ontrack, проверяем все receivers
                // Это нужно чтобы убедиться что все треки добавлены в поток
                setTimeout(() => {
                    const allReceivers = peerConnection.getReceivers();
                    console.log(`🔍 [ontrack] Проверяем все receivers для ${targetUserId}:`, allReceivers.length);
                    allReceivers.forEach((receiver, index) => {
                        const track = receiver.track;
                        if (track && track.readyState === 'live') {
                            const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                            if (remoteStream && !remoteStream.getTracks().some(t => t.id === track.id)) {
                                console.log(`✅ [ontrack] Добавляем пропущенный трек ${track.kind} ${track.id} для ${targetUserId}`);
                                remoteStream.addTrack(track);
                                if (track.kind === 'video') {
                                    const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                                    if (videoElement && videoElement.srcObject !== remoteStream) {
                                        videoElement.srcObject = remoteStream;
                                    }
                                }
                                // Сбрасываем кэш и обновляем UI
                                if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                    this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                                }
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            }
                        }
                    });
                }, 500);
            
                // Создаем или получаем удаленный поток для этого пользователя
                // КРИТИЧНО: remoteStream должен быть ОТДЕЛЬНЫМ потоком, НЕ localStream
                if (!this.videoCallManager.remoteStreams.has(targetUserId)) {
                    const remoteStream = new MediaStream();
                    // ВАЖНО: Проверяем, что remoteStream не содержит треков из localStream
                    console.log(`✅ [ontrack] Создан новый remoteStream для ${targetUserId}`);
                    this.videoCallManager.remoteStreams.set(targetUserId, remoteStream);
                    this.videoCallManager.uiManager.createRemoteVideoElement(targetUserId, remoteStream);
                }
            
                // УПРОЩЕННАЯ ЛОГИКА: ontrack только добавляет трек в поток
                // Вся логика скрытия/показа карточек и управления srcObject - в updateVideoOverlays()
                const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                
                // КРИТИЧНО: Проверяем, что remoteStream НЕ является localStream
                if (remoteStream === this.videoCallManager.localStream) {
                    console.error(`❌ [ontrack] КРИТИЧЕСКАЯ ОШИБКА: remoteStream это localStream для ${targetUserId}!`);
                    // Создаем новый правильный remoteStream
                    const newRemoteStream = new MediaStream();
                    this.videoCallManager.remoteStreams.set(targetUserId, newRemoteStream);
                    // Обновляем videoElement
                    const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                    if (videoElement) {
                        videoElement.srcObject = newRemoteStream;
                    }
                    return; // Выходим, не обрабатываем трек с неправильным потоком
                }
                const track = event.track;
                
                // Если трек null (replaceTrack(null) был вызван), удаляем все видео треки из потока
                if (!track) {
                    console.log(`🗑️ [ontrack] Трек null получен для ${targetUserId}, удаляем все видео треки из потока`);
                    const videoTracks = remoteStream.getVideoTracks();
                    videoTracks.forEach(vt => remoteStream.removeTrack(vt));
                    // Обновляем UI - updateVideoOverlays скроет карточку
                    this.videoCallManager.uiManager.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                    return;
                }
                
                // Если трек уже есть в потоке, обновляем его
                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                if (existingTrack && existingTrack !== track) {
                    remoteStream.removeTrack(existingTrack);
                }
                
                // УПРОЩЕННАЯ ЛОГИКА: Добавляем треки в поток ВСЕГДА если live (даже если disabled!)
                // Управление отображением через enabled/muted, а не через удаление треков
                if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                    if (track.kind === 'video') {
                        // Для видео: добавляем ВСЕГДА если live (даже если disabled!)
                        if (track.readyState === 'live') {
                            remoteStream.addTrack(track);
                            console.log(`✅ [ontrack] Видео трек ${track.id} для ${targetUserId} добавлен в поток (enabled=${track.enabled}, muted=${track.muted})`);
                            console.log(`✅ [ontrack] RemoteStream теперь имеет ${remoteStream.getTracks().length} треков:`, remoteStream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
                            
                            // КРИТИЧНО: Убеждаемся, что videoElement существует и обновляем его srcObject
                            const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                            if (videoElement) {
                                if (videoElement.srcObject !== remoteStream) {
                                    console.log(`🔄 [ontrack] Устанавливаем srcObject для videoElement ${targetUserId}`);
                                    videoElement.srcObject = remoteStream;
                                }
                                // Пробуем воспроизвести видео (даже если disabled - для будущей активации)
                                videoElement.play().catch(err => {
                                    if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                        console.warn(`⚠️ [ontrack] Ошибка play для ${targetUserId}:`, err);
                                    }
                                });
                            }
                            
                            // КРИТИЧНО: Сбрасываем кэш состояния для принудительного обновления UI
                            // Это нужно чтобы UI обновился даже если трек пришел с muted=true
                            if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                            }
                            
                            // Обновляем UI сразу и через небольшую задержку для надежности
                            // Это нужно чтобы зафиксировать изменение состояния трека
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            setTimeout(() => {
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            }, 300);
                            
                            // КРИТИЧНО: Если трек пришел с muted=true, проверяем его периодически
                            // Когда он станет активным (muted=false), обновим UI
                            if (track.muted) {
                                console.log(`⏳ [ontrack] Видео трек пришел с muted=true для ${targetUserId}, будет проверяться периодически`);
                                const checkMutedState = () => {
                                    if (track.readyState === 'ended') {
                                        return; // Трек завершился
                                    }
                                    if (!track.muted && track.enabled) {
                                        // Трек стал активным - принудительно обновляем UI
                                        console.log(`✅ [ontrack] Видео трек стал активным для ${targetUserId}, обновляем UI`);
                                        if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                            this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                                        }
                                        this.videoCallManager.uiManager.updateVideoOverlays();
                                        setTimeout(() => {
                                            this.videoCallManager.uiManager.updateVideoOverlays();
                                        }, 100);
                                    } else if (track.readyState === 'live') {
                                        // Продолжаем проверять пока трек live
                                        setTimeout(checkMutedState, 500);
                                    }
                                };
                                // Начинаем проверку через небольшую задержку
                                setTimeout(checkMutedState, 500);
                            }
                        } else {
                            console.log(`⚠️ [ontrack] Видео трек ${track.id} для ${targetUserId} не live (readyState=${track.readyState}), не добавляем в поток`);
                        }
                    } else if (track.kind === 'audio') {
                        // Для аудио: добавляем если live
                        if (track.readyState === 'live') {
                            remoteStream.addTrack(track);
                            console.log(`✅ [ontrack] Аудио трек ${track.id} для ${targetUserId} добавлен в поток`);
                            // Обновляем UI
                            setTimeout(() => {
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            }, 100);
                        } else {
                            console.log(`⚠️ [ontrack] Аудио трек ${track.id} для ${targetUserId} не live (readyState=${track.readyState}), не добавляем в поток`);
                        }
                    }
                    
                    // Простые обработчики: только добавляют/удаляют треки из потока
                    track.onended = () => {
                        console.log(`🗑️ [ontrack] Трек ${track.kind} завершился для ${targetUserId}`);
                        if (remoteStream.getTracks().includes(track)) {
                            remoteStream.removeTrack(track);
                        }
                        this.videoCallManager.uiManager.updateVideoOverlays();
                        this.videoCallManager.checkEmptyState();
                    };
                    
                    track.onmute = () => {
                        console.log(`🔇 [ontrack] Трек ${track.kind} muted для ${targetUserId}`);
                        // НЕ удаляем трек из потока при mute - просто обновляем UI
                        // Трек остается в потоке, управление через enabled/muted
                        if (track.kind === 'video') {
                            // Обновляем UI чтобы показать оверлей "камера выключена"
                            this.videoCallManager.uiManager.updateVideoOverlays();
                        }
                    };
                    
                    track.onunmute = () => {
                        console.log(`🔊 [ontrack] Трек ${track.kind} unmuted для ${targetUserId}`);
                        // Для видео треков: убеждаемся что трек в потоке (он должен быть там, так как мы не удаляем при mute)
                        if (track.kind === 'video' && track.readyState === 'live') {
                            // Если трека нет в потоке - добавляем его
                            if (!remoteStream.getTracks().includes(track)) {
                                console.log(`✅ [ontrack] Добавляем видео трек в поток после unmute для ${targetUserId}`);
                                remoteStream.addTrack(track);
                            }
                            // КРИТИЧНО: Сбрасываем кэш состояния для принудительного обновления UI
                            if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                            }
                            // Обновляем UI чтобы показать видео
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            // Еще раз через небольшую задержку для надежности
                            setTimeout(() => {
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            }, 100);
                        }
                    };
                    
                    // КРИТИЧНО: Периодическая проверка для треков с muted=true
                    // Это нужно на случай если onunmute не сработает сразу
                    if (track.kind === 'video' && track.muted && track.readyState === 'live') {
                        console.log(`⏳ [ontrack] Видео трек пришел с muted=true для ${targetUserId}, запускаем периодическую проверку`);
                        let checkCount = 0;
                        const maxChecks = 20; // Проверяем 20 раз (10 секунд)
                        const checkMutedState = () => {
                            if (track.readyState === 'ended') {
                                return; // Трек завершился
                            }
                            if (checkCount >= maxChecks) {
                                return; // Прекращаем проверку
                            }
                            checkCount++;
                            
                            // Если трек стал активным (unmuted)
                            if (!track.muted && track.enabled) {
                                console.log(`✅ [ontrack periodic] Видео трек стал активным для ${targetUserId}, обновляем UI`);
                                // Убеждаемся что трек в потоке
                                if (!remoteStream.getTracks().includes(track)) {
                                    remoteStream.addTrack(track);
                                }
                                // Сбрасываем кэш и обновляем UI
                                if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                    this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                                }
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                setTimeout(() => {
                                    this.videoCallManager.uiManager.updateVideoOverlays();
                                }, 100);
                                return; // Прекращаем проверку
                            }
                            
                            // Продолжаем проверять
                            setTimeout(checkMutedState, 500);
                        };
                        // Начинаем проверку через небольшую задержку
                        setTimeout(checkMutedState, 500);
                    }
                    
                    // Отслеживаем изменения enabled через периодическую проверку
                    // ВАЖНО: Работает для всех треков, даже если они не были добавлены в поток
                    let lastEnabled = track.enabled;
                    let lastMuted = track.muted;
                    const checkEnabled = () => {
                        // Проверяем, что трек все еще существует (не ended)
                        if (track.readyState === 'ended') {
                            return; // Трек завершился
                        }
                        
                        // Проверяем изменения enabled и muted
                        if (track.enabled !== lastEnabled || track.muted !== lastMuted) {
                            console.log(`🔄 [ontrack] Трек ${track.kind} состояние изменилось для ${targetUserId}: enabled ${lastEnabled}->${track.enabled}, muted ${lastMuted}->${track.muted}`);
                            const wasMuted = lastMuted;
                            const isNowActive = track.enabled && !track.muted;
                            lastEnabled = track.enabled;
                            lastMuted = track.muted;
                            
                            // Проверяем состояние в receivers и синхронизируем
                            const checkResult = this.checkAndSyncTrackWithReceivers(targetUserId, track);
                            
                            // ВАЖНО: НЕ удаляем треки если они просто disabled или muted!
                            // Удаляем ТОЛЬКО если трек ended
                            // Управление отображением через enabled/muted, а не через удаление треков
                            if (track.readyState === 'ended') {
                                // Трек ended - удаляем из потока
                                if (track.kind === 'video' && remoteStream.getTracks().includes(track)) {
                                    remoteStream.removeTrack(track);
                                    this.videoCallManager.uiManager.updateVideoOverlays();
                                    this.videoCallManager.checkEmptyState();
                                }
                            } else if (track.kind === 'video' && track.readyState === 'live') {
                                // Трек live - убеждаемся что он в потоке
                                if (!remoteStream.getTracks().includes(track)) {
                                    // Трека нет в потоке - добавляем его
                                    remoteStream.addTrack(track);
                                }
                                
                                // КРИТИЧНО: Если трек стал активным (muted изменился с true на false) - принудительно обновляем UI
                                if (wasMuted && !track.muted && isNowActive) {
                                    console.log(`✅ [ontrack] Видео трек стал активным для ${targetUserId}, принудительно обновляем UI`);
                                    // Сбрасываем кэш состояния для принудительного обновления
                                    if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                        this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                                    }
                                }
                                
                                // КРИТИЧНО: Обновляем UI при ЛЮБОМ изменении состояния (enabled/muted)
                                // Это нужно чтобы показывать/скрывать видео или оверлей
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                // Еще раз через небольшую задержку для надежности
                                setTimeout(() => {
                                    this.videoCallManager.uiManager.updateVideoOverlays();
                                }, 100);
                            }
                        }
                        
                        // Продолжаем проверять пока трек live (независимо от того, в потоке он или нет)
                        if (track.readyState === 'live') {
                            setTimeout(checkEnabled, 200);
                        }
                    };
                    
                    // Запускаем проверку enabled для всех треков
                    if (track.readyState === 'live') {
                        setTimeout(checkEnabled, 200);
                    }
                    
                    // ВАЖНО: Периодически проверяем состояние трека и обновляем UI
                    // Это нужно для синхронизации когда трек становится активным/неактивным
                    let lastPeriodicEnabled = track.enabled;
                    let lastPeriodicMuted = track.muted;
                    const periodicCheck = () => {
                        // Проверяем, что трек все еще существует (не ended)
                        if (track.readyState === 'ended') {
                            return; // Трек завершился
                        }
                        
                        // Проверяем изменения enabled/muted
                        if (track.enabled !== lastPeriodicEnabled || track.muted !== lastPeriodicMuted) {
                            console.log(`🔄 [periodicCheck] Состояние трека ${track.kind} изменилось для ${targetUserId}: enabled ${lastPeriodicEnabled}->${track.enabled}, muted ${lastPeriodicMuted}->${track.muted}`);
                            const wasMuted = lastPeriodicMuted;
                            const isNowActive = track.enabled && !track.muted;
                            lastPeriodicEnabled = track.enabled;
                            lastPeriodicMuted = track.muted;
                            
                            // Убеждаемся что трек в потоке (если live)
                            if (track.kind === 'video' && track.readyState === 'live' && !remoteStream.getTracks().includes(track)) {
                                remoteStream.addTrack(track);
                            }
                            
                            // КРИТИЧНО: Если трек стал активным (muted изменился с true на false) - принудительно обновляем UI
                            if (track.kind === 'video' && wasMuted && !track.muted && isNowActive) {
                                console.log(`✅ [periodicCheck] Видео трек стал активным для ${targetUserId}, принудительно обновляем UI`);
                                // Сбрасываем кэш состояния для принудительного обновления
                                if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                    this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                                }
                            }
                            
                            // Обновляем UI при изменении состояния
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            // Еще раз через небольшую задержку для надежности
                            setTimeout(() => {
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            }, 100);
                        }
                        
                        // Продолжаем проверять пока трек live
                        if (track.readyState === 'live') {
                            setTimeout(periodicCheck, 500);
                        }
                    };
                    
                    // Запускаем периодическую проверку для всех треков
                    if (track.readyState === 'live') {
                        setTimeout(periodicCheck, 500);
                    }
                }
                
                // ВАЖНО: Обновляем UI - updateVideoOverlays проверит receivers и покажет/скроет карточку
                // ВАЖНО: Для видео треков обновляем UI с небольшой задержкой, чтобы трек успел активироваться
                if (track.kind === 'video') {
                    // Для видео треков - обновляем сразу и с задержкой
                    // ВАЖНО: Если трек был добавлен в поток, сразу обновляем UI
                    const wasAdded = remoteStream.getTracks().some(t => t.id === track.id);
                    if (wasAdded) {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }
                    
                    setTimeout(() => {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                        this.videoCallManager.checkEmptyState();
                    }, 200);
                    // Дополнительная проверка через 500мс для случая первого подключения
                    setTimeout(() => {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }, 500);
                    // Еще одна проверка через 1000мс для надежности
                    setTimeout(() => {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }, 1000);
                } else {
                    // Для аудио треков - обновляем сразу
                    this.videoCallManager.uiManager.updateVideoOverlays();
                    setTimeout(() => {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                        this.videoCallManager.checkEmptyState();
                    }, 100);
                }
            };
        
            // Обработчик изменения состояния соединения
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log('Connection state with', targetUserId, ':', state);
            
                if (state === 'connected') {
                    this.videoCallManager.notificationManager.show('Звонок подключен', 'success');
                    console.log('✅ WebRTC connection established!');
                    // КРИТИЧНО: После установки соединения синхронизируем треки
                    // Это нужно чтобы увидеть видео другого пользователя
                    // Делаем это несколько раз с разными задержками для надежности
                    setTimeout(() => {
                        this.syncTracksAfterUserJoined(targetUserId);
                    }, 200);
                    setTimeout(() => {
                        this.syncTracksAfterUserJoined(targetUserId);
                    }, 1000);
                    setTimeout(() => {
                        this.syncTracksAfterUserJoined(targetUserId);
                    }, 3000);
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
                    // КРИТИЧНО: После установки ICE соединения синхронизируем треки
                    // Это нужно чтобы увидеть видео другого пользователя
                    // Делаем это несколько раз с разными задержками для надежности
                    setTimeout(() => {
                        this.syncTracksAfterUserJoined(targetUserId);
                    }, 200);
                    setTimeout(() => {
                        this.syncTracksAfterUserJoined(targetUserId);
                    }, 1000);
                    setTimeout(() => {
                        this.syncTracksAfterUserJoined(targetUserId);
                    }, 3000);
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
        
            // Перед созданием offer убеждаемся, что transceiver'ы имеют корректное направление
            let transceiversAdjusted = false;
            peerConnection.getTransceivers().forEach((transceiver, index) => {
                if (transceiver.sender.track) {
                    // Если есть отправляемый трек, должно быть sendrecv или sendonly
                    if (transceiver.direction === 'inactive' || transceiver.direction === 'recvonly') {
                        transceiver.direction = 'sendrecv';
                        transceiversAdjusted = true;
                        console.log(`🔄 Fixed transceiver ${index} direction to sendrecv BEFORE offer`);
                    }
                }
            });
            
            // Используем стандартные опции, но с правильными настройками для медиа
            const offerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            };
            
            console.log(`📤 Creating offer for ${targetUserId}...`);
            const offer = await peerConnection.createOffer(offerOptions);
        
            if (transceiversAdjusted) {
                console.log('♻️ Transceiver directions were updated prior to offer generation');
            }
        
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
            
            // ВАЖНО: Проверяем, что remote description еще не установлен
            if (peerConnection.remoteDescription) {
                console.warn('⚠️ [handleWebRTCOffer] Remote description already set, skipping');
                // Если remote description уже установлен, возможно нужно пересоздать соединение
                return;
            }
            
            // Устанавливаем полученное предложение (offer) как удаленное описание
            try {
                await peerConnection.setRemoteDescription(data.offer);
                console.log('✅ Remote description установлено для', data.sender_id);
                
                // ВАЖНО: Добавляем отложенные ICE кандидаты после установки remote description
                if (peerConnection._pendingIceCandidates && peerConnection._pendingIceCandidates.length > 0) {
                    console.log(`🔄 [handleWebRTCOffer] Adding ${peerConnection._pendingIceCandidates.length} pending ICE candidates`);
                    for (const candidate of peerConnection._pendingIceCandidates) {
                        try {
                            await peerConnection.addIceCandidate(candidate);
                        } catch (err) {
                            console.warn('⚠️ [handleWebRTCOffer] Error adding pending ICE candidate:', err);
                        }
                    }
                    peerConnection._pendingIceCandidates = [];
                }
            } catch (error) {
                // Обрабатываем ошибку "Remote description changes the media type"
                if (error.message && error.message.includes('changes the media type')) {
                    console.warn('⚠️ [handleWebRTCOffer] Remote description changes media type, recreating connection');
                    // Пересоздаем соединение
                    peerConnection.close();
                    this.videoCallManager.remoteUsers.delete(data.sender_id);
                    // Создаем новое соединение
                    this.setupPeerConnection(data.sender_id);
                    // Повторяем обработку offer
                    return this.handleWebRTCOffer(data);
                }
                throw error;
            }
        
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
            // КРИТИЧНО: Добавляем треки из receivers в поток, если их там еще нет
            // ВАЖНО: Делаем несколько проверок с задержками для надежности
            const checkReceivers = (delay) => {
                setTimeout(() => {
                    const receivers = peerConnection.getReceivers();
                    console.log(`🔍 [handleWebRTCOffer] Проверка receivers после установки local description для ${data.sender_id} (delay=${delay}ms):`, receivers.length);
                    console.log(`🔍 [handleWebRTCOffer] Текущие remoteStreams:`, Array.from(this.videoCallManager.remoteStreams.keys()));
                    
                    // ВАЖНО: Проверяем, есть ли уже remoteStream для этого пользователя
                    if (!this.videoCallManager.remoteStreams.has(data.sender_id)) {
                        const remoteStream = new MediaStream();
                        this.videoCallManager.remoteStreams.set(data.sender_id, remoteStream);
                        this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                    }
                    const remoteStream = this.videoCallManager.remoteStreams.get(data.sender_id);
                    
                    receivers.forEach((receiver, index) => {
                        const track = receiver.track;
                        console.log(`  [handleWebRTCOffer] Receiver ${index}: kind=${receiver.track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                        
                        // ВАЖНО: Если track null, не обрабатываем его
                        if (!track) {
                            console.log(`⚠️ [handleWebRTCOffer] Receiver ${index} имеет null track, пропускаем`);
                            return;
                        }
                        
                        // УПРОЩЕННАЯ ЛОГИКА: Для видео треков добавляем ВСЕГДА если live (даже если disabled!)
                        // Для аудио треков добавляем всегда если live
                        if (track.kind === 'video') {
                            // Для видео: добавляем ВСЕГДА если live (даже если disabled!)
                            if (track.readyState === 'live' && !remoteStream.getTracks().some(t => t.id === track.id)) {
                                remoteStream.addTrack(track);
                                console.log(`✅ [handleWebRTCOffer] Видео трек ${track.id} для ${data.sender_id} добавлен в поток (delay=${delay}ms, enabled=${track.enabled}, muted=${track.muted})`);
                                console.log(`✅ [handleWebRTCOffer] RemoteStream теперь имеет ${remoteStream.getTracks().length} треков:`, remoteStream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
                                
                                // КРИТИЧНО: Убеждаемся, что videoElement существует и обновляем его srcObject
                                const videoElement = document.getElementById(`remoteVideo-${data.sender_id}`);
                                if (videoElement) {
                                    if (videoElement.srcObject !== remoteStream) {
                                        console.log(`🔄 [handleWebRTCOffer] Устанавливаем srcObject для videoElement ${data.sender_id}`);
                                        videoElement.srcObject = remoteStream;
                                    }
                                    // Пробуем воспроизвести видео (даже если disabled - для будущей активации)
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                            console.warn(`⚠️ [handleWebRTCOffer] Ошибка play для ${data.sender_id}:`, err);
                                        }
                                    });
                                }
                                
                                // Обновляем UI
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            } else if (track.readyState !== 'live') {
                                console.log(`⚠️ [handleWebRTCOffer] Видео трек ${track.id} не live (readyState=${track.readyState}), не добавляем в поток`);
                            }
                        } else if (track.kind === 'audio') {
                            // Для аудио: добавляем если live
                            if (track.readyState === 'live' && !remoteStream.getTracks().some(t => t.id === track.id)) {
                                remoteStream.addTrack(track);
                                console.log(`✅ [handleWebRTCOffer] Аудио трек ${track.id} для ${data.sender_id} добавлен в поток`);
                                // Обновляем UI
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            } else if (track.readyState !== 'live') {
                                console.log(`⚠️ [handleWebRTCOffer] Аудио трек ${track.id} не live (readyState=${track.readyState}), не добавляем в поток`);
                            }
                        }
                    });
                }, delay);
            };
            
            // Проверяем несколько раз с разными задержками для надежности
            checkReceivers(100);
            checkReceivers(300);
            checkReceivers(500);
            
            // КРИТИЧНО: После создания answer также синхронизируем треки
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 600);
        
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
            
            // ВАЖНО: Проверяем signalingState - нельзя устанавливать answer в stable
            if (peerConnection.signalingState === 'stable') {
                console.warn('⚠️ [handleWebRTCAnswer] SignalingState is stable, skipping setRemoteDescription');
                return;
            }
            
            // ВАЖНО: Проверяем, что remote description еще не установлен
            if (peerConnection.remoteDescription) {
                console.warn('⚠️ [handleWebRTCAnswer] Remote description already set, skipping');
                return;
            }
            
            await peerConnection.setRemoteDescription(data.answer);
            console.log('✅ [handleWebRTCAnswer] Remote description set successfully, new signalingState:', peerConnection.signalingState);
            
            // ВАЖНО: Добавляем отложенные ICE кандидаты после установки remote description
            if (peerConnection._pendingIceCandidates && peerConnection._pendingIceCandidates.length > 0) {
                console.log(`🔄 [handleWebRTCAnswer] Adding ${peerConnection._pendingIceCandidates.length} pending ICE candidates`);
                for (const candidate of peerConnection._pendingIceCandidates) {
                    try {
                        await peerConnection.addIceCandidate(candidate);
                    } catch (err) {
                        console.warn('⚠️ [handleWebRTCAnswer] Error adding pending ICE candidate:', err);
                    }
                }
                peerConnection._pendingIceCandidates = [];
            }
            
            // ВАЖНО: Проверяем, есть ли уже треки в соединении после установки remote description
            
            // ВАЖНО: После установки remote description треки должны прийти через ontrack
            // Но иногда они уже есть в receivers, поэтому проверяем их тоже
            // ВАЖНО: Делаем несколько проверок с задержками для надежности
            const checkReceivers = (delay) => {
                setTimeout(() => {
                    const receivers = peerConnection.getReceivers();
                    console.log(`🔍 [handleWebRTCAnswer] Проверка receivers после установки remote description для ${data.sender_id} (delay=${delay}ms):`, receivers.length);
                    console.log(`🔍 [handleWebRTCAnswer] Текущие remoteStreams:`, Array.from(this.videoCallManager.remoteStreams.keys()));
                    
                    // ВАЖНО: Проверяем, есть ли уже remoteStream для этого пользователя
                    if (!this.videoCallManager.remoteStreams.has(data.sender_id)) {
                        const remoteStream = new MediaStream();
                        this.videoCallManager.remoteStreams.set(data.sender_id, remoteStream);
                        this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                    }
                    const remoteStream = this.videoCallManager.remoteStreams.get(data.sender_id);
                    
                    receivers.forEach((receiver, index) => {
                        const track = receiver.track;
                        console.log(`  [handleWebRTCAnswer] Receiver ${index}: kind=${receiver.track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                        // ВАЖНО: Если track null, не обрабатываем его
                        if (!track) {
                            console.log(`⚠️ [handleWebRTCAnswer] Receiver ${index} имеет null track, пропускаем`);
                            return;
                        }
                        
                        // УПРОЩЕННАЯ ЛОГИКА: Для видео треков добавляем ВСЕГДА если live (даже если disabled!)
                        // Для аудио треков добавляем всегда если live
                        if (track.kind === 'video') {
                            // Для видео: добавляем ВСЕГДА если live (даже если disabled!)
                            if (track.readyState === 'live' && !remoteStream.getTracks().some(t => t.id === track.id)) {
                                remoteStream.addTrack(track);
                                console.log(`✅ [handleWebRTCAnswer] Видео трек ${track.id} для ${data.sender_id} добавлен в поток (delay=${delay}ms, enabled=${track.enabled}, muted=${track.muted})`);
                                console.log(`✅ [handleWebRTCAnswer] RemoteStream теперь имеет ${remoteStream.getTracks().length} треков:`, remoteStream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
                                
                                // КРИТИЧНО: Убеждаемся, что videoElement существует и обновляем его srcObject
                                const videoElement = document.getElementById(`remoteVideo-${data.sender_id}`);
                                if (videoElement) {
                                    if (videoElement.srcObject !== remoteStream) {
                                        console.log(`🔄 [handleWebRTCAnswer] Устанавливаем srcObject для videoElement ${data.sender_id}`);
                                        videoElement.srcObject = remoteStream;
                                    }
                                    // Пробуем воспроизвести видео (даже если disabled - для будущей активации)
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                            console.warn(`⚠️ [handleWebRTCAnswer] Ошибка play для ${data.sender_id}:`, err);
                                        }
                                    });
                                }
                                
                                // Обновляем UI
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            } else if (track.readyState !== 'live') {
                                console.log(`⚠️ [handleWebRTCAnswer] Видео трек ${track.id} не live (readyState=${track.readyState}), не добавляем в поток`);
                            }
                        } else if (track.kind === 'audio') {
                            // Для аудио: добавляем если live
                            if (track.readyState === 'live' && !remoteStream.getTracks().some(t => t.id === track.id)) {
                                remoteStream.addTrack(track);
                                console.log(`✅ [handleWebRTCAnswer] Аудио трек ${track.id} для ${data.sender_id} добавлен в поток`);
                                // Обновляем UI
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            } else if (track.readyState !== 'live') {
                                console.log(`⚠️ [handleWebRTCAnswer] Аудио трек ${track.id} не live (readyState=${track.readyState}), не добавляем в поток`);
                            }
                        }
                    });
                }, delay);
            };
            
            // Проверяем несколько раз с разными задержками для надежности
            checkReceivers(100);
            checkReceivers(300);
            checkReceivers(500);
            
            // КРИТИЧНО: После получения answer также синхронизируем треки
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 600);
        
        } catch (error) {
            console.error('Error handling WebRTC answer:', error);
        }
    }
    
    // КРИТИЧНО: Синхронизация треков после подключения пользователя
    // Вызывается при событии user_joined для проверки receivers и обновления треков
    syncTracksAfterUserJoined(targetUserId) {
        console.log(`🔄 [syncTracksAfterUserJoined] Синхронизация треков для ${targetUserId}`);
        
        const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
        if (!peerConnection) {
            console.warn(`⚠️ [syncTracksAfterUserJoined] Нет peer connection для ${targetUserId}`);
            return;
        }
        
        // КРИТИЧНО: Проверяем connectionState - если соединение не установлено, ждем
        const connectionState = peerConnection.connectionState;
        if (connectionState !== 'connected' && connectionState !== 'completed') {
            console.log(`⏳ [syncTracksAfterUserJoined] Соединение для ${targetUserId} еще не установлено (${connectionState}), ждем...`);
            // Ждем установления соединения и пробуем снова
            const checkConnection = () => {
                if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
                    return; // Соединение закрыто
                }
                const newState = this.videoCallManager.remoteUsers.get(targetUserId).connectionState;
                if (newState === 'connected' || newState === 'completed') {
                    console.log(`✅ [syncTracksAfterUserJoined] Соединение для ${targetUserId} установлено, синхронизируем треки`);
                    this.syncTracksAfterUserJoined(targetUserId);
                } else if (newState !== 'disconnected' && newState !== 'failed') {
                    // Продолжаем ждать если соединение еще устанавливается
                    setTimeout(checkConnection, 500);
                }
            };
            setTimeout(checkConnection, 500);
            return;
        }
        
        // Проверяем receivers с несколькими задержками для надежности
        const checkAndSync = (delay) => {
            setTimeout(() => {
                if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
                    return; // Соединение закрыто
                }
                
                const receivers = peerConnection.getReceivers();
                console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] Проверка receivers (delay=${delay}ms):`, receivers.length);
                console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] ConnectionState:`, peerConnection.connectionState);
                console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] SignalingState:`, peerConnection.signalingState);
                console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] ICEConnectionState:`, peerConnection.iceConnectionState);
                
                // Убеждаемся что remoteStream существует
                if (!this.videoCallManager.remoteStreams.has(targetUserId)) {
                    const remoteStream = new MediaStream();
                    this.videoCallManager.remoteStreams.set(targetUserId, remoteStream);
                    this.videoCallManager.uiManager.createRemoteVideoElement(targetUserId, remoteStream);
                }
                const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                
                // Проверяем все receivers и добавляем треки в поток
                let tracksAdded = false;
                let hasMutedVideoTracks = false;
                receivers.forEach((receiver, index) => {
                    const track = receiver.track;
                    if (!track) {
                        console.log(`⚠️ [syncTracksAfterUserJoined ${targetUserId}] Receiver ${index} имеет null track`);
                        return;
                    }
                    
                    console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] Receiver ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
                    
                    // Добавляем треки в поток если они live (даже если disabled или muted)
                    if (track.readyState === 'live' && !remoteStream.getTracks().some(t => t.id === track.id)) {
                        remoteStream.addTrack(track);
                        tracksAdded = true;
                        console.log(`✅ [syncTracksAfterUserJoined ${targetUserId}] Трек ${track.kind} ${track.id} добавлен в поток`);
                        
                        // Для видео треков устанавливаем srcObject
                        if (track.kind === 'video') {
                            const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                            if (videoElement) {
                                if (videoElement.srcObject !== remoteStream) {
                                    console.log(`🔄 [syncTracksAfterUserJoined ${targetUserId}] Устанавливаем srcObject для videoElement`);
                                    videoElement.srcObject = remoteStream;
                                }
                                videoElement.play().catch(err => {
                                    if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                        console.warn(`⚠️ [syncTracksAfterUserJoined ${targetUserId}] Ошибка play:`, err);
                                    }
                                });
                            }
                            
                            // Отмечаем если есть muted видео треки
                            if (track.muted) {
                                hasMutedVideoTracks = true;
                            }
                        }
                    } else if (track.kind === 'video' && track.readyState === 'live' && track.muted) {
                        // Трек уже в потоке, но muted - отмечаем для периодической проверки
                        hasMutedVideoTracks = true;
                    }
                });
                
                // КРИТИЧНО: Если есть muted видео треки, запускаем периодическую проверку
                if (hasMutedVideoTracks) {
                    console.log(`⏳ [syncTracksAfterUserJoined ${targetUserId}] Есть muted видео треки, запускаем периодическую проверку`);
                    let checkCount = 0;
                    const maxChecks = 20; // Проверяем 20 раз (10 секунд)
                    const checkMutedTracks = () => {
                        if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
                            return; // Соединение закрыто
                        }
                        if (checkCount >= maxChecks) {
                            return; // Прекращаем проверку
                        }
                        checkCount++;
                        
                        const currentReceivers = peerConnection.getReceivers();
                        let foundActiveVideo = false;
                        currentReceivers.forEach(receiver => {
                            const track = receiver.track;
                            if (track && track.kind === 'video' && track.readyState === 'live' && !track.muted && track.enabled) {
                                foundActiveVideo = true;
                                // Убеждаемся что трек в потоке
                                if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                                    remoteStream.addTrack(track);
                                }
                            }
                        });
                        
                        if (foundActiveVideo) {
                            console.log(`✅ [syncTracksAfterUserJoined periodic] Видео трек стал активным для ${targetUserId}, обновляем UI`);
                            // Сбрасываем кэш и обновляем UI
                            if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                                this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                            }
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            setTimeout(() => {
                                this.videoCallManager.uiManager.updateVideoOverlays();
                            }, 100);
                            return; // Прекращаем проверку
                        }
                        
                        // Продолжаем проверять
                        setTimeout(checkMutedTracks, 500);
                    };
                    // Начинаем проверку через небольшую задержку
                    setTimeout(checkMutedTracks, 500);
                }
                
                // КРИТИЧНО: Если треки были добавлены, сбрасываем кэш состояния и обновляем UI
                if (tracksAdded) {
                    // Сбрасываем кэш состояния для этого пользователя
                    if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                        this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                    }
                    // Принудительно обновляем UI
                    this.videoCallManager.uiManager.updateVideoOverlays();
                    // Еще раз через небольшую задержку для надежности
                    setTimeout(() => {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }, 100);
                } else {
                    // Даже если треки не добавлены, обновляем UI (может быть треки уже были в потоке)
                    this.videoCallManager.uiManager.updateVideoOverlays();
                }
            }, delay);
        };
        
        // Проверяем с несколькими задержками для надежности
        // Увеличиваем задержки чтобы треки успели прийти через ontrack
        // КРИТИЧНО: Проверяем сразу и с большими задержками для надежности
        checkAndSync(100);
        checkAndSync(300);
        checkAndSync(500);
        checkAndSync(1000);
        checkAndSync(2000);
        checkAndSync(3000);
        checkAndSync(5000);
        
        // КРИТИЧНО: Также запускаем периодическую проверку для этого пользователя
        // Это нужно на случай если треки придут позже
        let checkCount = 0;
        const maxChecks = 10; // Проверяем 10 раз
        const periodicCheck = () => {
            if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
                return; // Соединение закрыто
            }
            if (checkCount >= maxChecks) {
                return; // Прекращаем проверку
            }
            checkCount++;
            
            const receivers = peerConnection.getReceivers();
            const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
            
            if (remoteStream) {
                const streamTracks = remoteStream.getTracks();
                const receiverTracks = receivers.map(r => r.track).filter(t => t && t.readyState === 'live');
                
                // Проверяем есть ли треки в receivers которых нет в потоке
                let tracksAdded = false;
                receiverTracks.forEach(track => {
                    if (!streamTracks.some(t => t.id === track.id)) {
                        console.log(`🔄 [syncTracksAfterUserJoined periodic] Добавляем трек ${track.kind} ${track.id} для ${targetUserId}`);
                        remoteStream.addTrack(track);
                        tracksAdded = true;
                        
                        if (track.kind === 'video') {
                            const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                            if (videoElement && videoElement.srcObject !== remoteStream) {
                                videoElement.srcObject = remoteStream;
                            }
                        }
                    }
                });
                
                if (tracksAdded) {
                    // Сбрасываем кэш и обновляем UI
                    if (this.videoCallManager.uiManager._lastVideoOverlaysState) {
                        this.videoCallManager.uiManager._lastVideoOverlaysState.delete(targetUserId);
                    }
                    this.videoCallManager.uiManager.updateVideoOverlays();
                }
            }
            
            // Продолжаем проверку
            setTimeout(periodicCheck, 1000);
        };
        
        // Начинаем периодическую проверку через 2 секунды
        setTimeout(periodicCheck, 2000);
    }

    async handleICECandidate(data) {
        try {
            console.log('Received ICE candidate from:', data.sender_id);
            
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.error('No peer connection for:', data.sender_id);
                return;
            }
            
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            
            // ВАЖНО: Проверяем, что remote description установлен перед добавлением ICE кандидатов
            if (!peerConnection.remoteDescription) {
                console.warn('⚠️ [handleICECandidate] Remote description not set yet, storing candidate for later');
                // Сохраняем кандидата для добавления позже
                if (!peerConnection._pendingIceCandidates) {
                    peerConnection._pendingIceCandidates = [];
                }
                peerConnection._pendingIceCandidates.push(data.candidate);
                return;
            }
            
            // ВАЖНО: Проверяем, что кандидат не null
            if (!data.candidate) {
                console.log('✅ [handleICECandidate] End of ICE candidates');
                return;
            }
            
            await peerConnection.addIceCandidate(data.candidate);
            
        } catch (error) {
            // Игнорируем ошибки "Unknown ufrag" - это нормально если кандидат пришел до установки remote description
            if (error.message && error.message.includes('Unknown ufrag')) {
                console.warn('⚠️ [handleICECandidate] Unknown ufrag (candidate arrived before remote description), ignoring');
            } else {
                console.error('Error adding ICE candidate:', error);
            }
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

