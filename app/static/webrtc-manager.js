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
        
            // КРИТИЧНО: ГАРАНТИРУЕМ что локальные треки добавлены
            if (this.videoCallManager.localStream) {
                console.log('✅ Добавляем локальные треки в соединение для:', targetUserId);
                this.videoCallManager.localStream.getTracks().forEach(track => {
                    try {
                        peerConnection.addTrack(track, this.videoCallManager.localStream);
                        console.log(`✅ Добавлен ${track.kind} трек`);
                    } catch (error) {
                        console.error(`❌ Ошибка добавления ${track.kind} трека:`, error);
                    }
                });
            } else {
                console.warn('⚠️ Локальный поток недоступен при создании соединения');
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
        
            // УПРОЩЕНО: Убрана вся сложная логика checkReceiversForNullTracks
            // WebRTC сам управляет треками в потоках
            
            // УПРОЩЕННАЯ обработка ontrack - используем только event.streams[0]
            peerConnection.ontrack = (event) => {
                const track = event.track;
                console.log('🎥 [ontrack] Remote track received:', track.kind, track.id, 'from', targetUserId);
            
                // УПРОЩЕНО: Используем поток из event.streams[0] - WebRTC уже создал его
                const remoteStream = event.streams[0];
                if (!remoteStream) {
                    console.error('❌ [ontrack] Нет потока в event.streams[0]');
                    return;
                }
                
                // Сохраняем поток
                this.videoCallManager.remoteStreams.set(targetUserId, remoteStream);
                
                // ВАЖНО: добавляем трек сразу, даже если muted
                const incomingTrack = event.track;
                if (!remoteStream.getTracks().includes(incomingTrack)) {
                    remoteStream.addTrack(incomingTrack);
                }
                
                // КРИТИЧЕСКИ ВАЖНО: обработчики событий
                incomingTrack.onunmute = () => {
                    console.log(`✅ Трек ${incomingTrack.kind} UNMUTED для ${targetUserId}`);
                    // Принудительно обновляем UI
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
                
                incomingTrack.onmute = () => {
                    console.log(`🔇 Трек ${incomingTrack.kind} MUTED для ${targetUserId}`);
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
                
                incomingTrack.onended = () => {
                    console.log(`❌ Трек ${incomingTrack.kind} ENDED для ${targetUserId}`);
                    if (remoteStream.getTracks().includes(incomingTrack)) {
                        remoteStream.removeTrack(incomingTrack);
                    }
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
                
                // Обновляем UI
                this.videoCallManager.uiManager.updateVideoOverlays();
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
                    this.syncTracksAfterUserJoined(targetUserId);
                } else if (state === 'disconnected' || state === 'failed') {
                    console.log('❌ WebRTC connection lost');
                    this.videoCallManager.notificationManager.show('Соединение потеряно', 'error');
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
                    this.syncTracksAfterUserJoined(targetUserId);
                } else if (iceState === 'disconnected' || iceState === 'failed') {
                    console.log('❌ ICE connection lost');
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
        
            console.log('✅ [setupPeerConnection] Peer connection setup completed for:', targetUserId);
            console.log('✅ [setupPeerConnection] Обработчик ontrack установлен для:', targetUserId);
        
        } catch (error) {
            console.error('❌ Error setting up peer connection:', error);
            this.videoCallManager.notificationManager.show('Не удалось установить соединение: ' + error.message, 'error');
        }
    }

    async createOffer(targetUserId) {
        // Проверяем signaling state - нельзя создавать offer в have-remote-offer
        const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
        if (!peerConnection) {
            console.warn(`⚠️ [createOffer] Нет peer connection для ${targetUserId}`);
            return;
        }
        
        if (peerConnection.signalingState === 'have-remote-offer' || peerConnection.signalingState === 'have-local-pranswer') {
            console.warn(`⚠️ [createOffer] Неправильный signaling state для создания offer: ${peerConnection.signalingState}`);
            return;
        }
        
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
        
            // БАЗОВАЯ настройка - используем стандартные опции WebRTC
            // WebRTC сам правильно настроит transceivers на основе добавленных треков
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
        
            await peerConnection.setLocalDescription(offer);
            console.log(`✅ Local description set for ${targetUserId}`);
        
            console.log('📤 Sending offer to:', targetUserId);
        
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
        
            // КРИТИЧНО: ЕСЛИ нет локального потока - сначала создай его
            if (!this.videoCallManager.localStream) {
                console.log('🔄 Нет локального потока, создаем перед обработкой offer...');
                await this.videoCallManager.mediaController.startAudioOnly();
                
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
            const answer = await peerConnection.createAnswer();
            
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
        
            console.log('📤 [handleWebRTCOffer] Sending answer to:', data.sender_id);
            
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

