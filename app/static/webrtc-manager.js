// Модуль для управления WebRTC соединениями
class WebRTCManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    setupPeerConnection(targetUserId) {
        // Проверяем, нет ли уже соединения с этим пользователем
        if (this.videoCallManager.remoteUsers.has(targetUserId)) {
            console.log('Peer connection already exists for:', targetUserId);
            return;
        }

        try {
            console.log('Setting up peer connection for:', targetUserId);
        
            // Конфигурация ICE-серверов - используем this.configuration из VideoCallManager
            const configuration = this.videoCallManager.configuration;

            // Создаем новый peer connection
            const peerConnection = new RTCPeerConnection(configuration);
        
            // ДОБАВЛЯЕМ ТОЛЬКО АКТИВНЫЕ ТРЕКИ из текущего локального потока (ТОЧНАЯ КОПИЯ ОРИГИНАЛА)
            if (this.videoCallManager.localStream) {
                this.videoCallManager.localStream.getTracks().forEach(track => {
                    // ДОБАВЛЯЕМ только если трек включен ИЛИ это аудио (аудио всегда добавляем)
                    // В оригинале проверялось !this.isSharingScreen для видео
                    const isSharingScreen = this.videoCallManager.isSharingScreen || false;
                    if (track.kind === 'audio' || (track.kind === 'video' && track.enabled && !isSharingScreen)) {
                        console.log(`Adding ${track.kind} track to connection for ${targetUserId}`);
                        try {
                            peerConnection.addTrack(track, this.videoCallManager.localStream);
                            console.log(`✅ ${track.kind} track added successfully`);
                        } catch (error) {
                            console.error(`❌ Error adding ${track.kind} track:`, error);
                        }
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
        
            // Обработчик получения удаленных треков
            peerConnection.ontrack = (event) => {
                console.log('Remote track received from:', targetUserId, 
                            'Track kind:', event.track.kind, 
                            'Track readyState:', event.track.readyState,
                            'Track enabled:', event.track.enabled,
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
                
                // Если трек уже есть в потоке, обновляем его
                const existingTrack = remoteStream.getTracks().find(t => t.id === track.id);
                if (existingTrack && existingTrack !== track) {
                    remoteStream.removeTrack(existingTrack);
                }
                
                if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                    remoteStream.addTrack(track);
                    console.log('Added track to remote stream:', track.kind, track.id, 'enabled:', track.enabled, 'readyState:', track.readyState, 'muted:', track.muted);
                    
                    // ВАЖНО: Если видео трек неактивен при добавлении (disabled или muted), сразу скрываем карточку
                    if (track.kind === 'video' && (!track.enabled || track.muted)) {
                        console.log(`⚠️ Видео трек добавлен как неактивный для ${targetUserId}, enabled: ${track.enabled}, muted: ${track.muted}`);
                        const participantCard = document.getElementById(`participant-${targetUserId}`);
                        if (participantCard) {
                            participantCard.style.setProperty('display', 'none', 'important');
                            const videoElement = document.getElementById(`remoteVideo-${targetUserId}`);
                            if (videoElement) {
                                videoElement.style.setProperty('display', 'none', 'important');
                                // Очищаем srcObject если трек неактивен
                                if (!track.enabled || track.muted) {
                                    videoElement.srcObject = null;
                                }
                            }
                        }
                    }
                    
                    // Всегда обновляем UI после добавления трека
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
                        console.log(`Трек ${track.kind} заглушен для пользователя ${targetUserId}`);
                        previousMuted = true; // Обновляем previousMuted
                        this.videoCallManager.uiManager.updateVideoOverlays();
                        this.videoCallManager.checkEmptyState();
                    };
                    
                    track.onunmute = () => {
                        console.log(`Трек ${track.kind} включен для пользователя ${targetUserId}, muted: ${track.muted}, enabled: ${track.enabled}`);
                        previousMuted = false; // Обновляем previousMuted
                        // ВАЖНО: Обновляем UI с небольшой задержкой, чтобы дать браузеру время обновить состояние трека
                        setTimeout(() => {
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                        }, 50);
                    };
                    
                    const checkTrackState = () => {
                        if (track.readyState === 'ended') {
                            remoteStream.removeTrack(track);
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                            return;
                        }
                        
                        // Проверяем изменения enabled
                        if (track.enabled !== previousEnabled) {
                            console.log(`Трек ${track.kind} enabled изменился для пользователя ${targetUserId}: ${previousEnabled} -> ${track.enabled}`);
                            previousEnabled = track.enabled;
                            this.videoCallManager.uiManager.updateVideoOverlays();
                            this.videoCallManager.checkEmptyState();
                        }
                        
                        // Проверяем изменения muted
                        if (track.muted !== previousMuted) {
                            console.log(`Трек ${track.kind} muted изменился для пользователя ${targetUserId}: ${previousMuted} -> ${track.muted}`);
                            previousMuted = track.muted;
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
                            console.error('Error playing audio:', err);
                        });
                    }
                }
            
            // ВАЖНО: Проверяем состояние треков перед установкой srcObject
            // Если видео трек неактивен, НЕ устанавливаем srcObject и скрываем карточку
            const videoTracks = remoteStream.getVideoTracks();
            const hasActiveVideo = videoTracks.length > 0 && 
                                  videoTracks.some(t => t && t.readyState === 'live' && t.enabled && !t.muted);
            
            if (videoElement) {
                if (hasActiveVideo) {
                    // Если есть активное видео - устанавливаем srcObject
                    if (videoElement.srcObject !== remoteStream) {
                        videoElement.srcObject = remoteStream;
                    }
                } else {
                    // Если нет активного видео - НЕ устанавливаем srcObject и скрываем карточку
                    videoElement.srcObject = null;
                    const participantCard = document.getElementById(`participant-${targetUserId}`);
                    if (participantCard) {
                        participantCard.style.setProperty('display', 'none', 'important');
                    }
                    videoElement.style.setProperty('display', 'none', 'important');
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
        
            console.log('✅ Peer connection setup completed for:', targetUserId);
        
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
            
            // Проверяем состояние signaling
            if (peerConnection.signalingState === 'have-local-offer') {
                console.log('Already have local offer, waiting...');
                return;
            }
        
            // Используем стандартные опции, но с правильными настройками для медиа
            const offerOptions = {
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            };
            
            const offer = await peerConnection.createOffer(offerOptions);
        
            // Убеждаемся, что все transceivers правильно настроены
            peerConnection.getTransceivers().forEach((transceiver) => {
                if (transceiver.sender.track) {
                    // Если есть отправляемый трек, должно быть sendrecv или sendonly
                    if (transceiver.direction === 'inactive' || transceiver.direction === 'recvonly') {
                        transceiver.direction = 'sendrecv';
                        console.log('Fixed transceiver direction for', transceiver.sender.track.kind);
                    }
                }
            });
        
            await peerConnection.setLocalDescription(offer);
        
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
        
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleWebRTCOffer(data) {
        try {
            console.log('Received offer from:', data.sender_id);
        
            // Если соединение с этим пользователем еще не создано, создаем его
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                this.setupPeerConnection(data.sender_id);
            }
        
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            
            // Устанавливаем полученное предложение (offer) как удаленное описание
            await peerConnection.setRemoteDescription(data.offer);
            
            // Убеждаемся, что локальные треки добавлены перед созданием answer
            if (this.videoCallManager.localStream) {
                const existingSenders = peerConnection.getSenders();
                const hasVideoSender = existingSenders.some(s => s.track && s.track.kind === 'video');
                const hasAudioSender = existingSenders.some(s => s.track && s.track.kind === 'audio');
                
                if (!hasVideoSender) {
                    const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
                    if (videoTrack) {
                        peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                        console.log('Added video track when handling offer');
                    }
                }
                
                if (!hasAudioSender) {
                    const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
                    if (audioTrack) {
                        peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                        console.log('Added audio track when handling offer');
                    }
                }
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
        
            console.log('Sending answer to:', data.sender_id);
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
            console.log('📥 Received ANSWER from:', data.sender_id);
            console.log('Answer SDP:', data.answer.sdp.substring(0, 100) + '...');
        
            if (!this.videoCallManager.remoteUsers.has(data.sender_id)) {
                console.error('No peer connection for:', data.sender_id);
                return;
            }
        
            const peerConnection = this.videoCallManager.remoteUsers.get(data.sender_id);
            await peerConnection.setRemoteDescription(data.answer);
            console.log('✅ Remote description set successfully');
        
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

