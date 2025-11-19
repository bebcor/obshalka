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
        
            // Конфигурация ICE-серверов
            const configuration = getPeerConnectionConfig();

            // Создаем новый peer connection
            const peerConnection = new RTCPeerConnection(configuration);
        
            // Добавляем локальные треки, если они есть
            if (this.videoCallManager.localStream) {
                this.videoCallManager.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.videoCallManager.localStream);
                });
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
                    this.videoCallManager.socketHandler.emit('ice_candidate', {
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
                            'Streams count:', event.streams.length);
            
                // Создаем или получаем удаленный поток для этого пользователя
                if (!this.videoCallManager.remoteStreams.has(targetUserId)) {
                    const remoteStream = new MediaStream();
                    this.videoCallManager.remoteStreams.set(targetUserId, remoteStream);
                    this.videoCallManager.uiManager.createRemoteVideoElement(targetUserId, remoteStream);
                }
            
                // Добавляем полученный трек в поток
                const remoteStream = this.videoCallManager.remoteStreams.get(targetUserId);
                event.streams[0].getTracks().forEach(track => {
                    if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                        remoteStream.addTrack(track);
                        console.log('Added track to remote stream:', track.kind);
                    }
                });
            
                this.videoCallManager.uiManager.updateVideoOverlays();
            };
        
            // Обработчик изменения состояния соединения
            peerConnection.onconnectionstatechange = () => {
                const state = peerConnection.connectionState;
                console.log('Connection state with', targetUserId, ':', state);
            
                if (state === 'connected') {
                    this.videoCallManager.notificationManager.show('Call connected', 'success');
                    console.log('✅ WebRTC connection established!');
                } else if (state === 'disconnected') {
                    this.videoCallManager.notificationManager.show('Call disconnected', 'warning');
                } else if (state === 'failed') {
                    console.error('❌ Connection failed - attempting ICE restart...');
                    this.videoCallManager.notificationManager.show('Connection issues detected', 'warning');
                
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
                    console.error('❌ ICE connection failed - will trigger renegotiation');
                }
            };
        
            // Обработчик необходимости переговоров (renegotiation)
            let isNegotiating = false;
            peerConnection.onnegotiationneeded = async () => {
                console.log('Negotiation needed for:', targetUserId);
                if (isNegotiating) {
                    console.log('Already negotiating, skipping...');
                    return;
                }
                isNegotiating = true;
                try {
                    await this.createOffer(targetUserId);
                } catch (error) {
                    console.error('Error during negotiation:', error);
                } finally {
                    // Сбрасываем флаг через небольшую задержку
                    setTimeout(() => {
                        isNegotiating = false;
                    }, 1000);
                }
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
            this.videoCallManager.notificationManager.show('Failed to setup connection: ' + error.message, 'error');
        }
    }

    async createOffer(targetUserId) {
        if (!this.videoCallManager.remoteUsers.has(targetUserId)) {
            console.error('No peer connection for:', targetUserId);
            return;
        }
    
        try {
            const peerConnection = this.videoCallManager.remoteUsers.get(targetUserId);
            
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
                if (transceiver.direction === 'inactive' && transceiver.sender.track) {
                    // Если есть трек, но направление inactive, меняем на sendrecv
                    transceiver.direction = 'sendrecv';
                } else if (transceiver.direction === 'recvonly' && transceiver.sender.track) {
                    // Если есть трек, но направление recvonly, меняем на sendrecv
                    transceiver.direction = 'sendrecv';
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
        
            this.videoCallManager.socketHandler.emit('webrtc_offer', {
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
            this.videoCallManager.socketHandler.emit('webrtc_answer', {
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
                if (videoTrack) {
                    peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                    tracksAdded = true;
                    console.log('Added video track to existing connection:', userId);
                }
            }
            
            if (!hasAudioSender) {
                const audioTrack = this.videoCallManager.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                    tracksAdded = true;
                    console.log('Added audio track to existing connection:', userId);
                }
            }
            
            // Если треки были добавлены и соединение уже установлено, запускаем renegotiation
            if (tracksAdded && peerConnection.signalingState === 'stable') {
                console.log('Tracks added to established connection, triggering renegotiation:', userId);
                // onnegotiationneeded должен сработать автоматически, но на всякий случай запускаем вручную
                setTimeout(() => {
                    if (peerConnection.signalingState === 'stable') {
                        this.createOffer(userId).catch(err => {
                            console.error('Error creating offer after adding tracks:', err);
                        });
                    }
                }, 100);
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

