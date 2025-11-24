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
        // КРИТИЧНО: muted не влияет на активность - это временное состояние браузера
        if (!receiverTrack) {
            console.log(`🔍 [checkAndSyncTrackWithReceivers ${targetUserId}] Трек ${track.kind} (${track.id}) не найден в receivers`);
            return { 
                hasActiveVideo: track.kind === 'video' && track.enabled && track.readyState === 'live',
                hasActiveAudio: track.kind === 'audio' && track.enabled && track.readyState === 'live',
                shouldRemove: false 
            };
        }
        
        // Проверяем состояние трека в receivers
        // ВАЖНО: muted - это временное состояние браузера, не влияет на активность
        const isActive = receiverTrack.enabled && 
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
        console.log(`🟠 [setupPeerConnection] ========== НАЧАЛО СОЗДАНИЯ СОЕДИНЕНИЯ для ${targetUserId} ==========`);
        
        // Проверяем, нет ли уже соединения с этим пользователем
        if (this.videoCallManager.remoteUsers.has(targetUserId)) {
            console.log(`⚠️ [setupPeerConnection] Peer connection already exists for: ${targetUserId}`);
            const existingPC = this.videoCallManager.remoteUsers.get(targetUserId);
            console.log(`📊 [setupPeerConnection] Существующее соединение:`);
            console.log(`   - signalingState: ${existingPC.signalingState}`);
            console.log(`   - connectionState: ${existingPC.connectionState}`);
            console.log(`   - iceConnectionState: ${existingPC.iceConnectionState}`);
            console.log(`🟠 [setupPeerConnection] ========== КОНЕЦ (уже существует) ==========`);
            return;
        }
        console.log(`🔄 [setupPeerConnection] Создаем peer connection для: ${targetUserId}`);

        try {
            console.log(`🔄 [setupPeerConnection] Setting up peer connection for: ${targetUserId}`);
        
            // Конфигурация ICE-серверов - используем this.configuration из VideoCallManager
            const configuration = this.videoCallManager.configuration;
            console.log(`📊 [setupPeerConnection] ICE серверы:`, configuration.iceServers?.length || 0);
            configuration.iceServers?.forEach((server, idx) => {
                console.log(`   ICE Server ${idx}: ${server.urls}`);
            });

            // Создаем новый peer connection
            const peerConnection = new RTCPeerConnection(configuration);
            console.log(`✅ [setupPeerConnection] RTCPeerConnection создан для ${targetUserId}`);
        
            // КРИТИЧНО: ГАРАНТИРУЕМ что локальные треки добавлены
            console.log(`🔍 [setupPeerConnection] Проверка локального потока для ${targetUserId}:`);
            console.log(`   - localStream exists: ${!!this.videoCallManager.localStream}`);
            
            if (this.videoCallManager.localStream) {
                const tracks = this.videoCallManager.localStream.getTracks();
                console.log(`   - Треков в локальном потоке: ${tracks.length}`);
                tracks.forEach((track, idx) => {
                    console.log(`     Track ${idx}: kind=${track.kind}, enabled=${track.enabled}, readyState=${track.readyState}, id=${track.id}`);
                });
                
                console.log(`✅ [setupPeerConnection] Добавляем локальные треки в соединение для: ${targetUserId}`);
                let addedCount = 0;
                this.videoCallManager.localStream.getTracks().forEach(track => {
                    try {
                        peerConnection.addTrack(track, this.videoCallManager.localStream);
                        addedCount++;
                        console.log(`✅ [setupPeerConnection] Добавлен ${track.kind} трек (id=${track.id}, enabled=${track.enabled})`);
                    } catch (error) {
                        console.error(`❌ [setupPeerConnection] Ошибка добавления ${track.kind} трека:`, error);
                        console.error(`   - Error name: ${error.name}`);
                        console.error(`   - Error message: ${error.message}`);
                    }
                });
                console.log(`📊 [setupPeerConnection] Всего добавлено треков: ${addedCount}`);
                
                // Проверяем senders после добавления
                const senders = peerConnection.getSenders();
                console.log(`📊 [setupPeerConnection] Senders после добавления треков: ${senders.length}`);
                senders.forEach((sender, idx) => {
                    console.log(`   Sender ${idx}: kind=${sender.track?.kind}, enabled=${sender.track?.enabled}, id=${sender.track?.id}`);
                });
            } else {
                console.warn(`⚠️ [setupPeerConnection] Локальный поток недоступен при создании соединения для ${targetUserId}`);
            }
        
            // Обработчик ICE-кандидатов
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log(`📡 [ICE] New ICE candidate for ${targetUserId}:`, {
                        type: event.candidate.type,
                        protocol: event.candidate.protocol,
                        address: event.candidate.address,
                        port: event.candidate.port,
                        candidate: event.candidate.candidate?.substring(0, 100) || 'no candidate string'
                    });
                    console.log(`📡 [ICE] Socket connected: ${this.videoCallManager.socket?.connected}, id: ${this.videoCallManager.socket?.id}`);
                
                    // Отправляем кандидат через signaling-сервер
                    this.videoCallManager.socket.emit('ice_candidate', {
                        target_user_id: targetUserId,
                        candidate: event.candidate
                    });
                    console.log(`✅ [ICE] ICE candidate отправлен для ${targetUserId}`);
                } else {
                    console.log(`✅ [ICE] ICE gathering complete for ${targetUserId}`);
                    console.log(`📊 [ICE] Final ICE gathering state: ${peerConnection.iceGatheringState}`);
                    console.log(`📊 [ICE] Local SDP description length: ${peerConnection.localDescription?.sdp?.length || 0}`);
                }
            };
        
            // УПРОЩЕНО: Убрана вся сложная логика checkReceiversForNullTracks
            // WebRTC сам управляет треками в потоках
            
            // УПРОЩЕННАЯ обработка ontrack - используем только event.streams[0]
            peerConnection.ontrack = (event) => {
                console.log(`🟣 [ontrack] ========== ПОЛУЧЕН ТРЕК от ${targetUserId} ==========`);
                const track = event.track;
                console.log(`🎥 [ontrack] Remote track received от ${targetUserId}:`);
                console.log(`   - kind: ${track.kind}`);
                console.log(`   - id: ${track.id}`);
                console.log(`   - enabled: ${track.enabled}`);
                console.log(`   - muted: ${track.muted}`);
                console.log(`   - readyState: ${track.readyState}`);
                console.log(`   - label: ${track.label}`);
                console.log(`📊 [ontrack] Event streams count: ${event.streams.length}`);
                event.streams.forEach((stream, idx) => {
                    console.log(`   Stream ${idx}: id=${stream.id}, tracks=${stream.getTracks().length}`);
                });
            
                // УПРОЩЕНО: Используем поток из event.streams[0] - WebRTC уже создал его
                const remoteStream = event.streams[0];
                if (!remoteStream) {
                    console.error(`❌ [ontrack] Нет потока в event.streams[0] для ${targetUserId}`);
                    console.log(`🟣 [ontrack] ========== КОНЕЦ (нет потока) ==========`);
                    return;
                }
                
                console.log(`📊 [ontrack] Используем поток ${remoteStream.id} для ${targetUserId}`);
                console.log(`   - Треков в потоке до добавления: ${remoteStream.getTracks().length}`);
                
                // Сохраняем поток
                const hadStream = this.videoCallManager.remoteStreams.has(targetUserId);
                this.videoCallManager.remoteStreams.set(targetUserId, remoteStream);
                console.log(`💾 [ontrack] Поток ${hadStream ? 'обновлен' : 'создан'} для ${targetUserId}`);
                
                // ВАЖНО: добавляем трек сразу, даже если muted
                const incomingTrack = event.track;
                const trackAlreadyInStream = remoteStream.getTracks().includes(incomingTrack);
                console.log(`🔍 [ontrack] Трек уже в потоке: ${trackAlreadyInStream}`);
                
                if (!trackAlreadyInStream) {
                    remoteStream.addTrack(incomingTrack);
                    console.log(`✅ [ontrack] Трек ${incomingTrack.kind} добавлен в поток для ${targetUserId}`);
                } else {
                    console.log(`ℹ️ [ontrack] Трек ${incomingTrack.kind} уже в потоке для ${targetUserId}`);
                }
                
                console.log(`   - Треков в потоке после добавления: ${remoteStream.getTracks().length}`);
                
                // КРИТИЧЕСКИ ВАЖНО: обработчики событий
                incomingTrack.onunmute = () => {
                    console.log(`✅ [ontrack] Трек ${incomingTrack.kind} UNMUTED для ${targetUserId}`);
                    console.log(`   - enabled: ${incomingTrack.enabled}`);
                    console.log(`   - muted: ${incomingTrack.muted}`);
                    console.log(`   - readyState: ${incomingTrack.readyState}`);
                    // Принудительно обновляем UI и пытаемся воспроизвести
                    this.videoCallManager.uiManager.updateVideoOverlays();
                    
                    const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                    if (videoElement && incomingTrack.kind === 'video') {
                        console.log(`🔄 [ontrack] Пытаемся воспроизвести видео для ${targetUserId} после unmute`);
                        videoElement.play().catch((err) => {
                            console.warn(`⚠️ [ontrack] Ошибка play после unmute для ${targetUserId}:`, err);
                        });
                    }
                };
                
                incomingTrack.onmute = () => {
                    console.log(`🔇 [ontrack] Трек ${incomingTrack.kind} MUTED для ${targetUserId}`);
                    console.log(`   - enabled: ${incomingTrack.enabled}`);
                    console.log(`   - muted: ${incomingTrack.muted}`);
                    console.log(`   - readyState: ${incomingTrack.readyState}`);
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
                
                incomingTrack.onended = () => {
                    console.log(`❌ [ontrack] Трек ${incomingTrack.kind} ENDED для ${targetUserId}`);
                    if (remoteStream.getTracks().includes(incomingTrack)) {
                        remoteStream.removeTrack(incomingTrack);
                        console.log(`🗑️ [ontrack] Трек ${incomingTrack.kind} удален из потока для ${targetUserId}`);
                    }
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
                
                // Обновляем UI
                console.log(`🔄 [ontrack] Обновляем UI для ${targetUserId}`);
                this.videoCallManager.uiManager.updateVideoOverlays();
                console.log(`🟣 [ontrack] ========== КОНЕЦ ОБРАБОТКИ ТРЕКА ==========`);
            };
        
            // Обработчик изменения состояния соединения
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log(`🔄 [ConnectionState] Изменение состояния соединения для ${targetUserId}: ${state}`);
                console.log(`📊 [ConnectionState] Полное состояние для ${targetUserId}:`);
                console.log(`   - connectionState: ${peerConnection.connectionState}`);
                console.log(`   - signalingState: ${peerConnection.signalingState}`);
                console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
                console.log(`   - iceGatheringState: ${peerConnection.iceGatheringState}`);
            
                if (state === 'connected') {
                    this.videoCallManager.notificationManager.show('Звонок подключен', 'success');
                    console.log(`✅ [ConnectionState] WebRTC connection established для ${targetUserId}!`);
                    // КРИТИЧНО: После установки соединения синхронизируем треки
                    // Это нужно чтобы увидеть видео другого пользователя
                    this.syncTracksAfterUserJoined(targetUserId);
                } else if (state === 'disconnected' || state === 'failed') {
                    console.log(`❌ [ConnectionState] WebRTC connection lost для ${targetUserId}`);
                    this.videoCallManager.notificationManager.show('Соединение потеряно', 'error');
                }
            };
        
            // Обработчик изменения состояния ICE-соединения
            peerConnection.oniceconnectionstatechange = () => {
                const iceState = peerConnection.iceConnectionState;
                console.log(`🔄 [ICEConnectionState] Изменение ICE состояния для ${targetUserId}: ${iceState}`);
                console.log(`📊 [ICEConnectionState] Полное состояние для ${targetUserId}:`);
                console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
                console.log(`   - connectionState: ${peerConnection.connectionState}`);
                console.log(`   - signalingState: ${peerConnection.signalingState}`);
                console.log(`   - iceGatheringState: ${peerConnection.iceGatheringState}`);
            
                if (iceState === 'connected' || iceState === 'completed') {
                    console.log(`✅ [ICEConnectionState] ICE connection successful для ${targetUserId}!`);
                    // КРИТИЧНО: После установки ICE соединения синхронизируем треки
                    // Это нужно чтобы увидеть видео другого пользователя
                    this.syncTracksAfterUserJoined(targetUserId);
                } else if (iceState === 'disconnected' || iceState === 'failed') {
                    console.log(`❌ [ICEConnectionState] ICE connection lost для ${targetUserId}`);
                }
            };
        
            // Обработчик необходимости переговоров (renegotiation)
            peerConnection.onnegotiationneeded = () => {
                // Не запускаем автоматически, чтобы избежать конфликтов
                // Будем запускать вручную когда нужно
            };
        
            // Обработчик изменения состояния ICE gathering
            peerConnection.onicegatheringstatechange = () => {
                console.log('ICE gathering state for', targetUserId, ':', 
                            peerConnection.iceGatheringState);
            };
        
            // Сохраняем соединение в Map
        
            // Обработчик изменения состояния ICE gathering
            peerConnection.onicegatheringstatechange = () => {
                console.log('ICE gathering state for', targetUserId, ':', 
                            peerConnection.iceGatheringState);
            };
        
            // Сохраняем соединение в Map
            this.videoCallManager.remoteUsers.set(targetUserId, peerConnection);
            console.log(`💾 [setupPeerConnection] Соединение сохранено в Map для ${targetUserId}`);
            console.log(`📊 [setupPeerConnection] Всего соединений в Map: ${this.videoCallManager.remoteUsers.size}`);
        
            console.log(`✅ [setupPeerConnection] Peer connection setup completed for: ${targetUserId}`);
            console.log(`✅ [setupPeerConnection] Обработчик ontrack установлен для: ${targetUserId}`);
            console.log(`📊 [setupPeerConnection] Начальное состояние соединения:`);
            console.log(`   - signalingState: ${peerConnection.signalingState}`);
            console.log(`   - connectionState: ${peerConnection.connectionState}`);
            console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
            console.log(`   - iceGatheringState: ${peerConnection.iceGatheringState}`);
            console.log(`🟠 [setupPeerConnection] ========== КОНЕЦ СОЗДАНИЯ СОЕДИНЕНИЯ ==========`);
        
        } catch (error) {
            console.error(`❌ [setupPeerConnection] Error setting up peer connection для ${targetUserId}:`, error);
            console.error(`   - Error name: ${error.name}`);
            console.error(`   - Error message: ${error.message}`);
            console.error(`   - Error stack: ${error.stack}`);
            this.videoCallManager.notificationManager.show('Не удалось установить соединение: ' + error.message, 'error');
            console.log(`🟠 [setupPeerConnection] ========== КОНЕЦ (ОШИБКА) ==========`);
        }
    }

    async createOffer(targetUserId) {
        console.log(`🔵 [createOffer] ========== НАЧАЛО СОЗДАНИЯ OFFER для ${targetUserId} ==========`);
        
        // Проверяем signaling state - нельзя создавать offer в have-remote-offer
        const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
        if (!peerConnection) {
            console.error(`❌ [createOffer] Нет peer connection для ${targetUserId}`);
            console.log(`🔵 [createOffer] ========== КОНЕЦ (нет соединения) ==========`);
            return;
        }
        
        console.log(`📊 [createOffer] Текущее состояние соединения для ${targetUserId}:`);
        console.log(`   - signalingState: ${peerConnection.signalingState}`);
        console.log(`   - connectionState: ${peerConnection.connectionState}`);
        console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
        console.log(`   - iceGatheringState: ${peerConnection.iceGatheringState}`);
        console.log(`   - localDescription: ${peerConnection.localDescription ? peerConnection.localDescription.type : 'null'}`);
        console.log(`   - remoteDescription: ${peerConnection.remoteDescription ? peerConnection.remoteDescription.type : 'null'}`);
        
        if (peerConnection.signalingState === 'have-remote-offer' || peerConnection.signalingState === 'have-local-pranswer') {
            console.warn(`⚠️ [createOffer] Неправильный signaling state для создания offer: ${peerConnection.signalingState}`);
            console.log(`🔵 [createOffer] ========== КОНЕЦ (неправильное состояние) ==========`);
            return;
        }
        
        if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
            console.error(`❌ [createOffer] No peer connection for: ${targetUserId}`);
            console.log(`🔵 [createOffer] ========== КОНЕЦ (нет соединения в Map) ==========`);
            return;
        }
    
        try {
            const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
            
            // ВАЖНО: Проверяем состояние соединения перед созданием offer
            const currentState = peerConnection.signalingState;
            console.log(`📊 [createOffer] Signaling state before offer for ${targetUserId}:`, currentState);
            
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
            console.log(`🔍 [createOffer] Проверка локального потока для ${targetUserId}:`);
            console.log(`   - localStream exists: ${!!this.videoCallManager.localStream}`);
            
            if (this.videoCallManager.localStream) {
                const existingSenders = peerConnection.getSenders();
                console.log(`   - Existing senders count: ${existingSenders.length}`);
                existingSenders.forEach((sender, idx) => {
                    console.log(`     Sender ${idx}: kind=${sender.track?.kind}, enabled=${sender.track?.enabled}, id=${sender.track?.id}`);
                });
                
                const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
                const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
                
                console.log(`   - Video track: ${videoTrack ? `exists (enabled=${videoTrack.enabled}, readyState=${videoTrack.readyState})` : 'null'}`);
                console.log(`   - Audio track: ${audioTrack ? `exists (enabled=${audioTrack.enabled}, readyState=${audioTrack.readyState})` : 'null'}`);
                
                // ВАЖНО: Добавляем видео трек если он есть, enabled и еще не добавлен
                if (videoTrack && videoTrack.enabled && !existingSenders.some(s => s.track?.kind === 'video')) {
                    console.log(`🎯 [createOffer] Adding missing video track to ${targetUserId} before offer`);
                    try {
                        peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                        console.log(`✅ [createOffer] Video track added before offer for ${targetUserId}`);
                    } catch (error) {
                        console.error(`❌ [createOffer] Error adding video track before offer:`, error);
                    }
                } else {
                    console.log(`ℹ️ [createOffer] Video track not added: track=${!!videoTrack}, enabled=${videoTrack?.enabled}, hasSender=${existingSenders.some(s => s.track?.kind === 'video')}`);
                }
                
                // ВАЖНО: Добавляем аудио трек если он есть, enabled и еще не добавлен
                if (audioTrack && audioTrack.enabled && !existingSenders.some(s => s.track?.kind === 'audio')) {
                    console.log(`🎯 [createOffer] Adding missing audio track to ${targetUserId} before offer`);
                    try {
                        peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                        console.log(`✅ [createOffer] Audio track added before offer for ${targetUserId}`);
                    } catch (error) {
                        console.error(`❌ [createOffer] Error adding audio track before offer:`, error);
                    }
                } else {
                    console.log(`ℹ️ [createOffer] Audio track not added: track=${!!audioTrack}, enabled=${audioTrack?.enabled}, hasSender=${existingSenders.some(s => s.track?.kind === 'audio')}`);
                }
            } else {
                console.warn(`⚠️ [createOffer] Нет локального потока для ${targetUserId}`);
            }
        
            // Проверяем senders после добавления треков
            const finalSenders = peerConnection.getSenders();
            console.log(`🔍 [createOffer] Senders после проверки: ${finalSenders.length}`);
            finalSenders.forEach((sender, idx) => {
                console.log(`   Final Sender ${idx}: kind=${sender.track?.kind}, enabled=${sender.track?.enabled}, id=${sender.track?.id}`);
            });
        
            // БАЗОВАЯ настройка - используем стандартные опции WebRTC
            // WebRTC сам правильно настроит transceivers на основе добавленных треков
            console.log(`🔄 [createOffer] Создаем offer для ${targetUserId}...`);
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            
            console.log(`✅ [createOffer] Offer создан для ${targetUserId}:`);
            console.log(`   - type: ${offer.type}`);
            console.log(`   - SDP length: ${offer.sdp?.length || 0}`);
            console.log(`   - SDP preview: ${offer.sdp?.substring(0, 200)}...`);
        
            console.log(`🔄 [createOffer] Устанавливаем local description для ${targetUserId}...`);
            await peerConnection.setLocalDescription(offer);
            console.log(`✅ [createOffer] Local description set for ${targetUserId}`);
            console.log(`📊 [createOffer] Signaling state after setLocalDescription: ${peerConnection.signalingState}`);
            console.log(`📊 [createOffer] ICE gathering state: ${peerConnection.iceGatheringState}`);
            
            // Логируем transceivers
            const transceivers = peerConnection.getTransceivers();
            console.log(`📊 [createOffer] Transceivers count: ${transceivers.length}`);
            transceivers.forEach((transceiver, idx) => {
                console.log(`   Transceiver ${idx}: kind=${transceiver.receiver.track?.kind || 'no track'}, direction=${transceiver.direction}, currentDirection=${transceiver.currentDirection}`);
            });
        
            console.log(`📤 [createOffer] Отправляем offer через socket для ${targetUserId}...`);
            console.log(`   - Socket connected: ${this.videoCallManager.socket?.connected}`);
            console.log(`   - Socket id: ${this.videoCallManager.socket?.id}`);
        
            this.videoCallManager.socket.emit('webrtc_offer', {
                target_user_id: targetUserId,
                offer: offer
            });
            console.log(`✅ [createOffer] Offer отправлен через socket для ${targetUserId}`);
            console.log(`📊 [createOffer] Ожидаем answer от ${targetUserId}...`);
            console.log(`🔵 [createOffer] ========== КОНЕЦ СОЗДАНИЯ OFFER ==========`);
        
        } catch (error) {
            console.error(`❌ [createOffer] Ошибка создания offer для ${targetUserId}:`, error);
            console.error(`   - Error name: ${error.name}`);
            console.error(`   - Error message: ${error.message}`);
            console.error(`   - Error stack: ${error.stack}`);
            console.log(`🔵 [createOffer] ========== КОНЕЦ (ОШИБКА) ==========`);
        }
    }

    async handleWebRTCOffer(data) {
        try {
            console.log(`🟢 [handleWebRTCOffer] ========== НАЧАЛО ОБРАБОТКИ OFFER от ${data.sender_id} ==========`);
            console.log(`📥 [handleWebRTCOffer] Received offer from: ${data.sender_id}`);
            console.log(`📥 [handleWebRTCOffer] Offer data:`, {
                hasOffer: !!data.offer,
                offerType: data.offer?.type,
                offerSdpLength: data.offer?.sdp?.length || 0,
                offerSdpPreview: data.offer?.sdp?.substring(0, 200) || 'no SDP'
            });
            
            const hasConnection = this.videoCallManager.remoteUsers.has(data.sender_id);
            console.log(`📥 [handleWebRTCOffer] Peer connection exists: ${hasConnection}`);
            if (hasConnection) {
                const pc = this.videoCallManager.remoteUsers.get(data.sender_id);
                console.log(`📥 [handleWebRTCOffer] Current signaling state: ${pc.signalingState}`);
                console.log(`📥 [handleWebRTCOffer] Current connection state: ${pc.connectionState}`);
                console.log(`📥 [handleWebRTCOffer] Current ICE state: ${pc.iceConnectionState}`);
                console.log(`📥 [handleWebRTCOffer] Local description: ${pc.localDescription ? pc.localDescription.type : 'null'}`);
                console.log(`📥 [handleWebRTCOffer] Remote description: ${pc.remoteDescription ? pc.remoteDescription.type : 'null'}`);
            }
        
            // КРИТИЧНО: ЕСЛИ нет локального потока - сначала создай его
            if (!this.videoCallManager.localStream) {
                console.log('🔄 Нет локального потока, создаем перед обработкой offer...');
                await this.videoCallManager.mediaController.startVideo();
                
                // ПЕРЕСОЗДАЙ соединение с правильными треками
                if (this.videoCallManager.remoteUsers.has(data.sender_id)) {
                    this.videoCallManager.remoteUsers.get(data.sender_id).close();
                    this.videoCallManager.remoteUsers.delete(data.sender_id);
                }
                this.setupPeerConnection(data.sender_id);
            }
            
            // Если соединение с этим пользователем еще не создано, создаем его
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.log('🔄 Peer connection не существует для', data.sender_id, ', создаем...');
                this.setupPeerConnection(data.sender_id);
            }
            
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            
            // ВАЖНО: Проверяем текущее состояние signaling
            const currentSignalingState = peerConnection.signalingState;
            console.log('📥 Current signaling state before setting remote description:', currentSignalingState);
            
            // ВАЖНО: Проверяем, что remote description еще не установлен
            if (peerConnection.remoteDescription) {
                console.warn('⚠️ [handleWebRTCOffer] Remote description already set, skipping');
                return;
            }
            
            // Если уже есть локальный offer, значит мы уже отправили offer этому пользователю
            // В этом случае нужно обработать race condition
            if (currentSignalingState === 'have-local-offer') {
                console.log('⚠️ Уже есть локальный offer для', data.sender_id, ', обрабатываем race condition...');
                // Устанавливаем remote description - это может вызвать renegotiation
                await peerConnection.setRemoteDescription(data.offer);
                // БАЗОВАЯ настройка - используем стандартные опции WebRTC
                const answer = await peerConnection.createAnswer();
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
        
            // БАЗОВАЯ настройка - используем стандартные опции WebRTC
            console.log(`🔄 [handleWebRTCOffer] Создаем answer для ${data.sender_id}...`);
            const answer = await peerConnection.createAnswer();
            
            console.log(`✅ [handleWebRTCOffer] Answer создан для ${data.sender_id}:`);
            console.log(`   - type: ${answer.type}`);
            console.log(`   - SDP length: ${answer.sdp?.length || 0}`);
            console.log(`   - SDP preview: ${answer.sdp?.substring(0, 200)}...`);
            
            // Логируем transceivers перед установкой local description
            const transceiversBefore = peerConnection.getTransceivers();
            console.log(`📊 [handleWebRTCOffer] Transceivers before setLocalDescription: ${transceiversBefore.length}`);
            transceiversBefore.forEach((transceiver, idx) => {
                console.log(`   Transceiver ${idx}: kind=${transceiver.receiver.track?.kind || 'no track'}, direction=${transceiver.direction}, currentDirection=${transceiver.currentDirection}`);
            });
            
            // Устанавливаем созданный ответ как локальное описание
            console.log(`🔄 [handleWebRTCOffer] Устанавливаем local description для ${data.sender_id}...`);
            await peerConnection.setLocalDescription(answer);
            console.log('✅ [handleWebRTCOffer] Local description set, signalingState:', peerConnection.signalingState);
            console.log(`📊 [handleWebRTCOffer] ICE gathering state: ${peerConnection.iceGatheringState}`);
            
            // Логируем transceivers после установки local description
            const transceiversAfter = peerConnection.getTransceivers();
            console.log(`📊 [handleWebRTCOffer] Transceivers after setLocalDescription: ${transceiversAfter.length}`);
            transceiversAfter.forEach((transceiver, idx) => {
                console.log(`   Transceiver ${idx}: kind=${transceiver.receiver.track?.kind || 'no track'}, direction=${transceiver.direction}, currentDirection=${transceiver.currentDirection}`);
            });
            
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
                        // ВАЖНО: НЕ создаем карточку сразу - она будет создана только когда появится активный видео трек
                        // this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                    }
                    const remoteStream = this.videoCallManager.remoteStreams.get(data.sender_id);
                    
                    let tracksUpdated = false;
                    receivers.forEach((receiver, index) => {
                        const track = receiver.track;
                        console.log(`  [handleWebRTCOffer] Receiver ${index}: kind=${receiver.track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                        
                        // ВАЖНО: Если track null, не обрабатываем его
                        if (!track) {
                            console.log(`⚠️ [handleWebRTCOffer] Receiver ${index} имеет null track, пропускаем`);
                            return;
                        }
                        
                        // КРИТИЧНО: Добавляем треки ТОЛЬКО если enabled=true (камера/микрофон включены)
                        // Если enabled=false, устройство выключено пользователем - не добавляем
                        // ВАЖНО: muted - это временное состояние браузера, не влияет на добавление трека
                        if (track.kind === 'video') {
                        // Для видео: добавляем ТОЛЬКО если enabled=true и live
                        // Если enabled=false - камера выключена пользователем
                        // muted - временное состояние, не блокируем добавление
                        if (track.readyState === 'live' && track.enabled) {
                            // ВАЖНО: Создаем карточку только когда появляется активный видео трек (enabled=true)
                            const participantCard = document.getElementById(`participant-${data.sender_id}`);
                            if (!participantCard) {
                                console.log(`✅ [handleWebRTCOffer] Создаем карточку для ${data.sender_id} - появился активный видео трек (enabled=true)`);
                                this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                            }
                                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                                if (!existingTrack) {
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`✅ [handleWebRTCOffer] Видео трек ${track.id} для ${data.sender_id} добавлен в поток (delay=${delay}ms, enabled=${track.enabled}, muted=${track.muted})`);
                                } else if (existingTrack !== track) {
                                    // Трек заменен - обновляем
                                    remoteStream.removeTrack(existingTrack);
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`🔄 [handleWebRTCOffer] Видео трек ${track.id} для ${data.sender_id} заменен в потоке`);
                                }
                                
                                // КРИТИЧНО: Убеждаемся, что videoElement существует и обновляем его srcObject
                                const videoElement = document.getElementById(`remoteVideo-${data.sender_id}`);
                                if (videoElement) {
                                    if (videoElement.srcObject !== remoteStream) {
                                        console.log(`🔄 [handleWebRTCOffer] Устанавливаем srcObject для videoElement ${data.sender_id}`);
                                        videoElement.srcObject = remoteStream;
                                    }
                                    // Пробуем воспроизвести видео
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                            console.warn(`⚠️ [handleWebRTCOffer] Ошибка play для ${data.sender_id}:`, err);
                                        }
                                    });
                                }
                            } else {
                                console.log(`❌ [handleWebRTCOffer] НЕ создаем карточку и НЕ добавляем трек для ${data.sender_id} - видео трек неактивен (enabled=${track.enabled}, readyState=${track.readyState})`);
                            }
                        } else if (track.kind === 'audio') {
                            // Для аудио: добавляем если live
                            if (track.readyState === 'live') {
                                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                                if (!existingTrack) {
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`✅ [handleWebRTCOffer] Аудио трек ${track.id} для ${data.sender_id} добавлен в поток`);
                                } else if (existingTrack !== track) {
                                    // Трек заменен - обновляем
                                    remoteStream.removeTrack(existingTrack);
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`🔄 [handleWebRTCOffer] Аудио трек ${track.id} для ${data.sender_id} заменен в потоке`);
                                }
                            }
                        }
                    });
                    
                    // КРИТИЧНО: Всегда сбрасываем кэш и обновляем UI
                    // Это нужно чтобы UI обновился даже если треки уже были в потоке
                    if (tracksUpdated || delay >= 500) {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }
                }, delay);
            };
            
            // Проверяем несколько раз с разными задержками для надежности
            checkReceivers(100);
            checkReceivers(300);
            checkReceivers(500);
            
            // КРИТИЧНО: После создания answer принудительно синхронизируем треки
            // Это нужно чтобы увидеть треки нового пользователя сразу
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 300);
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 1000);
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 2000);
        
            console.log(`📤 [handleWebRTCOffer] Отправляем answer через socket для ${data.sender_id}...`);
            console.log(`   - Socket connected: ${this.videoCallManager.socket?.connected}`);
            console.log(`   - Socket id: ${this.videoCallManager.socket?.id}`);
            console.log(`   - Answer type: ${answer.type}`);
            console.log(`   - Answer SDP length: ${answer.sdp ? answer.sdp.length : 0}`);
            
            // Отправляем ответ обратно инициатору через signaling-сервер
            this.videoCallManager.socket.emit('webrtc_answer', {
                target_user_id: data.sender_id,
                answer: answer
            });
            
            console.log(`✅ [handleWebRTCOffer] Answer отправлен через socket для ${data.sender_id}`);
            console.log(`🟢 [handleWebRTCOffer] ========== КОНЕЦ ОБРАБОТКИ OFFER ==========`);
        
        } catch (error) {
            console.error('Error handling WebRTC offer:', error);
        }
    }

    async handleWebRTCAnswer(data) {
        try {
            console.log(`🟡 [handleWebRTCAnswer] ========== НАЧАЛО ОБРАБОТКИ ANSWER от ${data.sender_id} ==========`);
            console.log(`📥 [handleWebRTCAnswer] Received ANSWER from: ${data.sender_id}`);
            console.log(`📥 [handleWebRTCAnswer] Answer data:`, {
                hasAnswer: !!data.answer,
                answerType: data.answer?.type,
                answerSdpLength: data.answer?.sdp?.length || 0,
                answerSdpPreview: data.answer?.sdp?.substring(0, 200) || 'no SDP'
            });
        
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.error('❌ [handleWebRTCAnswer] No peer connection for:', data.sender_id);
                return;
            }
        
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            console.log(`📥 [handleWebRTCAnswer] Текущее состояние соединения для ${data.sender_id}:`);
            console.log(`   - signalingState: ${peerConnection.signalingState}`);
            console.log(`   - connectionState: ${peerConnection.connectionState}`);
            console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
            console.log(`   - iceGatheringState: ${peerConnection.iceGatheringState}`);
            console.log(`   - localDescription: ${peerConnection.localDescription ? peerConnection.localDescription.type : 'null'}`);
            console.log(`   - remoteDescription: ${peerConnection.remoteDescription ? peerConnection.remoteDescription.type : 'null'}`);
            
            // ВАЖНО: Проверяем signalingState - answer можно устанавливать только в have-local-offer
            if (peerConnection.signalingState !== 'have-local-offer') {
                console.warn(`⚠️ [handleWebRTCAnswer] SignalingState is ${peerConnection.signalingState}, expected have-local-offer, skipping`);
                // Если состояние stable, возможно answer уже был установлен
                if (peerConnection.signalingState === 'stable') {
                    console.log('✅ [handleWebRTCAnswer] Connection already stable, answer was already processed');
                }
                return;
            }
            
            // ВАЖНО: Проверяем, что remote description еще не установлен (или это старый offer)
            if (peerConnection.remoteDescription) {
                // Если remoteDescription уже установлен и это answer - пропускаем
                if (peerConnection.remoteDescription.type === 'answer') {
                    console.warn('⚠️ [handleWebRTCAnswer] Answer already set, skipping');
                    return;
                }
                // Если это старый offer - заменяем на answer
                console.log('🔄 [handleWebRTCAnswer] Replacing old remote description with answer');
            }
            
            try {
                console.log(`🔄 [handleWebRTCAnswer] Устанавливаем remote description для ${data.sender_id}...`);
                await peerConnection.setRemoteDescription(data.answer);
                console.log(`✅ [handleWebRTCAnswer] Remote description set successfully для ${data.sender_id}`);
                console.log(`📊 [handleWebRTCAnswer] Новое состояние после setRemoteDescription:`);
                console.log(`   - signalingState: ${peerConnection.signalingState}`);
                console.log(`   - connectionState: ${peerConnection.connectionState}`);
                console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
                
                // Логируем transceivers
                const transceivers = peerConnection.getTransceivers();
                console.log(`📊 [handleWebRTCAnswer] Transceivers count: ${transceivers.length}`);
                transceivers.forEach((transceiver, idx) => {
                    console.log(`   Transceiver ${idx}: kind=${transceiver.receiver.track?.kind || 'no track'}, direction=${transceiver.direction}, currentDirection=${transceiver.currentDirection}`);
                });
                
                console.log(`🟡 [handleWebRTCAnswer] ========== КОНЕЦ ОБРАБОТКИ ANSWER ==========`);
            } catch (error) {
                console.error(`❌ [handleWebRTCAnswer] Ошибка установки remote description для ${data.sender_id}:`, error);
                console.error(`   - Error name: ${error.name}`);
                console.error(`   - Error message: ${error.message}`);
                console.error(`   - Error stack: ${error.stack}`);
                console.log(`🟡 [handleWebRTCAnswer] ========== КОНЕЦ (ОШИБКА) ==========`);
                throw error;
            }
            
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
                        // ВАЖНО: НЕ создаем карточку сразу - она будет создана только когда появится активный видео трек
                        // this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                    }
                    const remoteStream = this.videoCallManager.remoteStreams.get(data.sender_id);
                    
                    let tracksUpdated = false;
                    receivers.forEach((receiver, index) => {
                        const track = receiver.track;
                        console.log(`  [handleWebRTCAnswer] Receiver ${index}: kind=${receiver.track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                        // ВАЖНО: Если track null, не обрабатываем его
                        if (!track) {
                            console.log(`⚠️ [handleWebRTCAnswer] Receiver ${index} имеет null track, пропускаем`);
                            return;
                        }
                        
                        // КРИТИЧНО: Добавляем треки ТОЛЬКО если enabled=true (камера/микрофон включены)
                        // Если enabled=false, устройство выключено пользователем - не добавляем
                        // ВАЖНО: muted - это временное состояние браузера, не влияет на добавление трека
                        if (track.kind === 'video') {
                        // Для видео: добавляем ТОЛЬКО если enabled=true и live
                        // Если enabled=false - камера выключена пользователем
                        // muted - временное состояние, не блокируем добавление
                        if (track.readyState === 'live' && track.enabled) {
                            // ВАЖНО: Создаем карточку только когда появляется активный видео трек (enabled=true)
                            const participantCard = document.getElementById(`participant-${data.sender_id}`);
                            if (!participantCard) {
                                console.log(`✅ [handleWebRTCAnswer] Создаем карточку для ${data.sender_id} - появился активный видео трек (enabled=true)`);
                                this.videoCallManager.uiManager.createRemoteVideoElement(data.sender_id, remoteStream);
                            }
                                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                                if (!existingTrack) {
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`✅ [handleWebRTCAnswer] Видео трек ${track.id} для ${data.sender_id} добавлен в поток (delay=${delay}ms, enabled=${track.enabled}, muted=${track.muted})`);
                                } else if (existingTrack !== track) {
                                    // Трек заменен - обновляем
                                    remoteStream.removeTrack(existingTrack);
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`🔄 [handleWebRTCAnswer] Видео трек ${track.id} для ${data.sender_id} заменен в потоке`);
                                }
                                
                                // КРИТИЧНО: Убеждаемся, что videoElement существует и обновляем его srcObject
                                const videoElement = document.getElementById(`remoteVideo-${data.sender_id}`);
                                if (videoElement) {
                                    if (videoElement.srcObject !== remoteStream) {
                                        console.log(`🔄 [handleWebRTCAnswer] Устанавливаем srcObject для videoElement ${data.sender_id}`);
                                        videoElement.srcObject = remoteStream;
                                    }
                                    // Пробуем воспроизвести видео
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                            console.warn(`⚠️ [handleWebRTCAnswer] Ошибка play для ${data.sender_id}:`, err);
                                        }
                                    });
                                }
                            } else {
                                console.log(`❌ [handleWebRTCAnswer] НЕ создаем карточку и НЕ добавляем трек для ${data.sender_id} - видео трек неактивен (enabled=${track.enabled}, readyState=${track.readyState})`);
                            }
                        } else if (track.kind === 'audio') {
                            // Для аудио: добавляем если live
                            if (track.readyState === 'live') {
                                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                                if (!existingTrack) {
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`✅ [handleWebRTCAnswer] Аудио трек ${track.id} для ${data.sender_id} добавлен в поток`);
                                } else if (existingTrack !== track) {
                                    // Трек заменен - обновляем
                                    remoteStream.removeTrack(existingTrack);
                                    remoteStream.addTrack(track);
                                    tracksUpdated = true;
                                    console.log(`🔄 [handleWebRTCAnswer] Аудио трек ${track.id} для ${data.sender_id} заменен в потоке`);
                                }
                            }
                        }
                    });
                    
                    // КРИТИЧНО: Всегда сбрасываем кэш и обновляем UI
                    // Это нужно чтобы UI обновился даже если треки уже были в потоке
                    if (tracksUpdated || delay >= 500) {
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }
                }, delay);
            };
            
            // Проверяем несколько раз с разными задержками для надежности
            checkReceivers(100);
            checkReceivers(300);
            checkReceivers(500);
            
            // КРИТИЧНО: После получения answer принудительно синхронизируем треки
            // Это нужно чтобы увидеть треки существующего пользователя сразу
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 300);
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 1000);
            setTimeout(() => {
                this.syncTracksAfterUserJoined(data.sender_id);
            }, 2000);
        
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
                    // ВАЖНО: НЕ создаем карточку сразу - она будет создана только когда появится активный видео трек
                    // this.videoCallManager.uiManager.createRemoteVideoElement(targetUserId, remoteStream);
                }
                const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                
                // КРИТИЧНО: Принудительно проверяем все receivers и обновляем поток
                let tracksUpdated = false;
                receivers.forEach((receiver, index) => {
                    const track = receiver.track;
                    if (!track) {
                        console.log(`⚠️ [syncTracksAfterUserJoined ${targetUserId}] Receiver ${index} имеет null track`);
                        return;
                    }
                    
                    console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] Receiver ${index}: kind=${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
                    
                    // КРИТИЧНО: Добавляем треки ТОЛЬКО если enabled=true
                    // Если enabled=false - устройство выключено пользователем
                    // ВАЖНО: muted - это временное состояние браузера, не влияет на добавление трека
                    if (track.readyState === 'live' && track.enabled) {
                        // ВАЖНО: Создаем карточку только когда появляется активный видео трек (enabled=true)
                        if (track.kind === 'video') {
                            const participantCard = document.getElementById(`participant-${targetUserId}`);
                            if (!participantCard) {
                                console.log(`✅ [syncTracksAfterUserJoined] Создаем карточку для ${targetUserId} - появился активный видео трек (enabled=true)`);
                                this.videoCallManager.uiManager.createRemoteVideoElement(targetUserId, remoteStream);
                            }
                            // Добавляем трек в поток только если enabled
                            const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                            if (!existingTrack) {
                                remoteStream.addTrack(track);
                                tracksUpdated = true;
                                console.log(`✅ [syncTracksAfterUserJoined ${targetUserId}] Трек ${track.kind} ${track.id} добавлен в поток (enabled=${track.enabled}, muted=${track.muted})`);
                            } else if (existingTrack !== track) {
                                // Трек заменен - обновляем
                                remoteStream.removeTrack(existingTrack);
                                remoteStream.addTrack(track);
                                tracksUpdated = true;
                                console.log(`🔄 [syncTracksAfterUserJoined ${targetUserId}] Трек ${track.kind} ${track.id} заменен в потоке`);
                            } else {
                                console.log(`✅ [syncTracksAfterUserJoined ${targetUserId}] Трек ${track.kind} ${track.id} уже в потоке (enabled=${track.enabled}, muted=${track.muted})`);
                            }
                        } else {
                            // Для аудио просто добавляем в поток
                            const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                            if (!existingTrack) {
                                remoteStream.addTrack(track);
                                tracksUpdated = true;
                                console.log(`✅ [syncTracksAfterUserJoined ${targetUserId}] Трек ${track.kind} ${track.id} добавлен в поток`);
                            } else if (existingTrack !== track) {
                                // Трек заменен - обновляем
                                remoteStream.removeTrack(existingTrack);
                                remoteStream.addTrack(track);
                                tracksUpdated = true;
                                console.log(`🔄 [syncTracksAfterUserJoined ${targetUserId}] Трек ${track.kind} ${track.id} заменен в потоке`);
                            }
                        }
                        
                        // Для видео треков устанавливаем srcObject
                        if (track.kind === 'video') {
                            const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                            if (videoElement) {
                                // КРИТИЧНО: Проверяем что в потоке есть активные видео треки
                                const activeVideoTracks = remoteStream.getVideoTracks().filter(t => t.enabled);
                                if (activeVideoTracks.length > 0) {
                                    if (videoElement.srcObject !== remoteStream) {
                                        console.log(`🔄 [syncTracksAfterUserJoined ${targetUserId}] Устанавливаем srcObject для videoElement`);
                                        videoElement.srcObject = remoteStream;
                                    }
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                            console.warn(`⚠️ [syncTracksAfterUserJoined ${targetUserId}] Ошибка play:`, err);
                                        }
                                    });
                                } else {
                                    // Нет активных видео треков - очищаем srcObject
                                    console.log(`🗑️ [syncTracksAfterUserJoined ${targetUserId}] Нет активных видео треков - очищаем srcObject`);
                                    videoElement.srcObject = null;
                                    videoElement.pause();
                                }
                            }
                        }
                    }
                });
                
                // КРИТИЧНО: Всегда сбрасываем кэш и обновляем UI
                // Это нужно чтобы UI обновился даже если треки уже были в потоке
                
                // Логируем состояние потока перед обновлением UI
                const streamTracks = remoteStream.getTracks();
                console.log(`🔍 [syncTracksAfterUserJoined ${targetUserId}] Состояние потока перед обновлением UI:`, {
                    tracksCount: streamTracks.length,
                    tracks: streamTracks.map(t => ({
                        kind: t.kind,
                        id: t.id,
                        enabled: t.enabled,
                        muted: t.muted,
                        readyState: t.readyState
                    })),
                    tracksUpdated: tracksUpdated
                });
                
                // Обновляем UI принудительно
                this.videoCallManager.uiManager.updateVideoOverlays();
                
                // Еще раз через небольшую задержку для надежности
                setTimeout(() => {
                    this.videoCallManager.uiManager.updateVideoOverlays();
                }, 50);
                setTimeout(() => {
                    this.videoCallManager.uiManager.updateVideoOverlays();
                }, 200);
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
                        // КРИТИЧНО: Для видео треков проверяем что трек enabled
                        // Если enabled=false - камера выключена пользователем
                        // ВАЖНО: muted - это временное состояние браузера, не влияет на добавление трека
                        if (track.kind === 'video' && !track.enabled) {
                            console.log(`❌ [syncTracksAfterUserJoined periodic] НЕ добавляем видео трек ${track.id} для ${targetUserId} - enabled=${track.enabled} (камера выключена)`);
                            return; // Пропускаем этот трек
                        }
                        
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
        
        // КРИТИЧЕСКИ ВАЖНО: принудительно запускаем renegotiation
        setTimeout(() => {
            if (this.videoCallManager.remoteUsers.has(targetUserId)) {
                const pc = this.videoCallManager.remoteUsers.get(targetUserId);
                if (pc.signalingState === 'stable') {
                    console.log(`🔄 Принудительный renegotiation для ${targetUserId}`);
                    this.createOffer(targetUserId).catch(err => {
                        console.error(`❌ Ошибка принудительного renegotiation для ${targetUserId}:`, err);
                    });
                }
            }
        }, 1000);
    }

    async handleICECandidate(data) {
        try {
            console.log(`🔵 [handleICECandidate] ========== ОБРАБОТКА ICE КАНДИДАТА от ${data.sender_id} ==========`);
            console.log(`📥 [handleICECandidate] Received ICE candidate from: ${data.sender_id}`);
            console.log(`📥 [handleICECandidate] Candidate data:`, {
                hasCandidate: !!data.candidate,
                candidateType: data.candidate?.type,
                candidateProtocol: data.candidate?.protocol,
                candidateAddress: data.candidate?.address,
                candidatePort: data.candidate?.port,
                candidateString: data.candidate?.candidate?.substring(0, 100) || 'no candidate string'
            });
            
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.error(`❌ [handleICECandidate] No peer connection for: ${data.sender_id}`);
                console.log(`🔵 [handleICECandidate] ========== КОНЕЦ (нет соединения) ==========`);
                return;
            }
            
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            console.log(`📊 [handleICECandidate] Текущее состояние соединения для ${data.sender_id}:`);
            console.log(`   - signalingState: ${peerConnection.signalingState}`);
            console.log(`   - connectionState: ${peerConnection.connectionState}`);
            console.log(`   - iceConnectionState: ${peerConnection.iceConnectionState}`);
            console.log(`   - remoteDescription: ${peerConnection.remoteDescription ? peerConnection.remoteDescription.type : 'null'}`);
            
            // ВАЖНО: Проверяем, что remote description установлен перед добавлением ICE кандидатов
            if (!peerConnection.remoteDescription) {
                console.warn(`⚠️ [handleICECandidate] Remote description not set yet, storing candidate for later`);
                // Сохраняем кандидата для добавления позже
                if (!peerConnection._pendingIceCandidates) {
                    peerConnection._pendingIceCandidates = [];
                }
                peerConnection._pendingIceCandidates.push(data.candidate);
                console.log(`📦 [handleICECandidate] Кандидат сохранен для последующего добавления. Всего отложенных: ${peerConnection._pendingIceCandidates.length}`);
                console.log(`🔵 [handleICECandidate] ========== КОНЕЦ (отложено) ==========`);
                return;
            }
            
            // ВАЖНО: Проверяем, что кандидат не null
            if (!data.candidate) {
                console.log(`✅ [handleICECandidate] End of ICE candidates для ${data.sender_id}`);
                console.log(`🔵 [handleICECandidate] ========== КОНЕЦ (конец кандидатов) ==========`);
                return;
            }
            
            console.log(`🔄 [handleICECandidate] Добавляем ICE кандидат для ${data.sender_id}...`);
            await peerConnection.addIceCandidate(data.candidate);
            console.log(`✅ [handleICECandidate] ICE кандидат добавлен для ${data.sender_id}`);
            console.log(`📊 [handleICECandidate] Новое ICE состояние: ${peerConnection.iceConnectionState}`);
            console.log(`🔵 [handleICECandidate] ========== КОНЕЦ ==========`);
            
        } catch (error) {
            console.error(`❌ [handleICECandidate] Ошибка обработки ICE кандидата для ${data.sender_id}:`, error);
            console.error(`   - Error name: ${error.name}`);
            console.error(`   - Error message: ${error.message}`);
            console.log(`🔵 [handleICECandidate] ========== КОНЕЦ (ОШИБКА) ==========`);
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

