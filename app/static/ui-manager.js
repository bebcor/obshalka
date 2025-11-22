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
        // ЗАЩИТА ОТ РЕКУРСИИ: если уже выполняется обновление, пропускаем
        if (this._updatingVideoOverlays) {
            return;
        }
        this._updatingVideoOverlays = true;
        
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
                
                // ВАЖНО: НЕ добавляем треки из receivers в updateVideoOverlays
                // Это должно происходить только в ontrack
                // Если мы будем добавлять треки здесь, они будут конфликтовать с checkReceiversForNullTracks
                // который удаляет треки, когда их нет в receivers
                
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
            
            // КРИТИЧНО: Проверяем receivers - это единственный надежный источник истины
            // ВАЖНО: Удаляем неактивные треки из потока ПРЯМО ЗДЕСЬ для более быстрой реакции
            let hasActiveVideo = false;
            if (peerConnection) {
                const receivers = peerConnection.getReceivers();
                
                // КРИТИЧНО: Сначала проверяем, есть ли receiver с null track (replaceTrack(null))
                // Если есть - удаляем ВСЕ видео треки из потока
                const hasNullVideoReceiver = receivers.some(receiver => {
                    const track = receiver.track;
                    // Проверяем через transceivers, чтобы определить тип receiver
                    if (!track || track === null) {
                        const transceivers = peerConnection.getTransceivers();
                        const transceiver = transceivers.find(t => t.receiver === receiver);
                        // Если transceiver существует и receiver.track === null, это может быть видео receiver
                        return transceiver !== undefined;
                    }
                    return false;
                });
                
                if (hasNullVideoReceiver) {
                    // Есть null receiver - удаляем все видео треки из потока
                    const videoTracks = stream.getVideoTracks();
                    videoTracks.forEach(track => {
                        console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем видео трек ${track.id} - есть null receiver (replaceTrack(null))`);
                        stream.removeTrack(track);
                    });
                } else {
                    // Нет null receiver - проверяем каждый трек индивидуально
                    const streamVideoTracks = stream.getVideoTracks();
                    streamVideoTracks.forEach(streamTrack => {
                        // Ищем соответствующий receiver для этого трека
                        const receiver = receivers.find(r => {
                            const rTrack = r.track;
                            return rTrack && rTrack.id === streamTrack.id;
                        });
                        const receiverTrack = receiver?.track;
                        
                        // Удаляем трек если:
                        // 1. Нет receiver для этого трека
                        // 2. Трек неактивен (disabled, muted, или не live)
                        let shouldRemove = false;
                        if (!receiver) {
                            // Нет receiver для этого трека - возможно, он был удален
                            shouldRemove = true;
                            console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем видео трек ${streamTrack.id} - нет receiver`);
                        } else if (receiverTrack && receiverTrack.kind === 'video') {
                            const isActive = receiverTrack.readyState === 'live' && 
                                            receiverTrack.enabled && 
                                            !receiverTrack.muted;
                            if (!isActive) {
                                shouldRemove = true;
                                console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем неактивный видео трек ${streamTrack.id} из потока (enabled=${receiverTrack.enabled}, muted=${receiverTrack.muted}, readyState=${receiverTrack.readyState})`);
                            }
                        }
                        
                        if (shouldRemove && stream.getTracks().includes(streamTrack)) {
                            stream.removeTrack(streamTrack);
                        }
                    });
                }
                
                // Ищем активный видео трек в receivers
                // ВАЖНО: Если hasNullVideoReceiver === true, то активного видео нет
                const videoReceiver = hasNullVideoReceiver ? null : receivers.find(receiver => {
                    const track = receiver.track;
                    return track && track.kind === 'video' && 
                           track.readyState === 'live' && 
                           track.enabled && 
                           !track.muted;
                });
                
                // Если нет активного videoReceiver - камера выключена
                if (!videoReceiver) {
                    // Нет активного видео трека в receivers - камера выключена
                    if (hasNullVideoReceiver) {
                        console.log(`❌ [${userId}] Нет активного видео трека в receivers - есть null receiver (replaceTrack(null))`);
                    } else {
                        console.log(`❌ [${userId}] Нет активного видео трека в receivers`);
                    }
                    hasActiveVideo = false;
                } else {
                    const track = videoReceiver.track;
                    // Трек уже проверен на активность выше
                    hasActiveVideo = true;
                    
                    // ВАЖНО: Если трек активен в receivers, но его нет в потоке - добавляем его
                    const trackInStream = stream.getTracks().find(t => t.id === track.id);
                    if (!trackInStream) {
                        console.log(`✅ [${userId}] Добавляем активный видео трек из receivers в поток`);
                        stream.addTrack(track);
                    }
                }
            } else {
                // Нет peer connection - камера выключена
                console.log(`❌ [${userId}] Нет peer connection - камера выключена`);
                hasActiveVideo = false;
            }
            
            // Получаем актуальные треки ПОСЛЕ удаления неактивных
            const finalVideoTracks = stream.getVideoTracks();
            const finalAudioTracks = stream.getAudioTracks();
            
            // ВАЖНО: Проверяем наличие активного аудио
            const hasActiveAudio = finalAudioTracks.length > 0 && 
                                  finalAudioTracks.some(track => 
                                      track && 
                                      track.readyState === 'live' && 
                                      track.enabled && 
                                      !track.muted
                                  );
            
                // КРИТИЧНО: Финальная проверка - если в потоке нет активных видео треков, камера выключена
                const hasActiveVideoInStream = finalVideoTracks.length > 0 && 
                                          finalVideoTracks.some(track => 
                                              track && 
                                              track.readyState === 'live' && 
                                              track.enabled && 
                                              !track.muted
                                          );
            
            // ВАЖНО: Если трек активен в receivers, но его нет в потоке - добавляем его
            // Это критично для случая, когда трек приходит через ontrack, но еще не добавлен в поток
            // ИЛИ когда трек становится активным после того как был неактивен
            if (hasActiveVideo && !hasActiveVideoInStream && peerConnection) {
                const receivers = peerConnection.getReceivers();
                const videoReceiver = receivers.find(receiver => {
                    const track = receiver.track;
                    return track && track.kind === 'video' && track.readyState === 'live' && track.enabled && !track.muted;
                });
                if (videoReceiver && videoReceiver.track) {
                    const track = videoReceiver.track;
                    const trackInStream = stream.getTracks().find(t => t.id === track.id);
                    if (!trackInStream) {
                        console.log(`✅ [updateVideoOverlays ${userId}] Добавляем активный видео трек из receivers в поток (финальная проверка)`);
                        stream.addTrack(track);
                        // Обновляем hasActiveVideoInStream после добавления
                        hasActiveVideo = true; // Трек добавлен, видео активно
                        // Обновляем finalVideoTracks для дальнейшей проверки
                        const updatedVideoTracks = stream.getVideoTracks();
                        const updatedHasActiveVideoInStream = updatedVideoTracks.length > 0 && 
                                                              updatedVideoTracks.some(t => 
                                                                  t && 
                                                                  t.readyState === 'live' && 
                                                                  t.enabled && 
                                                                  !t.muted
                                                              );
                        if (updatedHasActiveVideoInStream) {
                            hasActiveVideo = true;
                        } else {
                            hasActiveVideo = false;
                        }
                    } else {
                        // Трек уже в потоке - проверяем его активность
                        const isTrackActive = trackInStream.readyState === 'live' && trackInStream.enabled && !trackInStream.muted;
                        hasActiveVideo = isTrackActive;
                    }
                } else {
                    // Нет активного видео receiver - камера выключена
                    hasActiveVideo = false;
                }
            } else if (!hasActiveVideoInStream) {
                // В потоке нет активных видео треков - проверяем receivers еще раз
                if (peerConnection) {
                    const receivers = peerConnection.getReceivers();
                    const videoReceiver = receivers.find(receiver => {
                        const track = receiver.track;
                        return track && track.kind === 'video' && track.readyState === 'live' && track.enabled && !track.muted;
                    });
                    if (videoReceiver && videoReceiver.track) {
                        // Есть активный receiver, но его нет в потоке - добавляем
                        const track = videoReceiver.track;
                        console.log(`✅ [updateVideoOverlays ${userId}] Добавляем активный видео трек из receivers в поток (нет в потоке)`);
                        stream.addTrack(track);
                        hasActiveVideo = true;
                    } else {
                        // Нет активного видео - камера выключена
                        hasActiveVideo = false;
                    }
                } else {
                    // Нет peer connection - камера выключена
                    hasActiveVideo = false;
                }
            }
            
            // КРИТИЧНО: Финальная проверка - видео активно ТОЛЬКО если оно активно И в receivers И в потоке
            // Если в потоке нет активных треков, видео неактивно, независимо от receivers
            // НО если в receivers есть активный трек, который еще не добавлен в поток - добавляем его
            if (!hasActiveVideoInStream && hasActiveVideo) {
                // hasActiveVideo уже установлен выше если трек был добавлен
                // Если трек не был добавлен, hasActiveVideo = false
            }
            
            // КРИТИЧНО: Финальная проверка - видео активно ТОЛЬКО если в потоке есть активные треки
            // Это единственный надежный источник истины для отображения
            // ДОПОЛНИТЕЛЬНО: Проверяем, что треки действительно активны (enabled, не muted, live)
            const finalHasActiveVideo = hasActiveVideoInStream && finalVideoTracks.some(track => 
                track && 
                track.readyState === 'live' && 
                track.enabled && 
                !track.muted
            );
            
            console.log(`🔍 [updateVideoOverlays ${userId}] Проверка: video=${finalHasActiveVideo}, audio=${hasActiveAudio}, tracks=${finalVideoTracks.length}v/${finalAudioTracks.length}a`);
            console.log(`🔍 [updateVideoOverlays ${userId}] Stream tracks:`, stream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
            
            if (finalHasActiveVideo) {
                // Есть активное видео - показываем карточку
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
                    // КРИТИЧНО: Устанавливаем srcObject ТОЛЬКО на remoteStream, НЕ на localStream
                    // Проверяем, что stream это именно remoteStream для этого пользователя
                    const expectedRemoteStream = this.videoCallManager.remoteStreams.get(userId);
                    if (expectedRemoteStream && expectedRemoteStream !== stream) {
                        console.error(`❌ [updateVideoOverlays ${userId}] КРИТИЧЕСКАЯ ОШИБКА: stream не совпадает с remoteStreams!`);
                        console.error(`❌ [updateVideoOverlays ${userId}] stream:`, stream, 'expectedRemoteStream:', expectedRemoteStream);
                        // Используем правильный поток
                        stream = expectedRemoteStream;
                    }
                    
                    // ВАЖНО: Проверяем, что stream НЕ является localStream
                    if (stream === this.videoCallManager.localStream) {
                        console.error(`❌ [updateVideoOverlays ${userId}] КРИТИЧЕСКАЯ ОШИБКА: stream это localStream! Используем remoteStream`);
                        const correctRemoteStream = this.videoCallManager.remoteStreams.get(userId);
                        if (correctRemoteStream) {
                            stream = correctRemoteStream;
                        } else {
                            console.error(`❌ [updateVideoOverlays ${userId}] Нет remoteStream для ${userId}, создаем новый`);
                            const newRemoteStream = new MediaStream();
                            this.videoCallManager.remoteStreams.set(userId, newRemoteStream);
                            stream = newRemoteStream;
                        }
                    }
                    
                    // КРИТИЧНО: Проверяем, что в потоке есть активные видео треки ПЕРЕД установкой srcObject
                    const activeVideoTracks = stream.getVideoTracks().filter(t => 
                        t && t.readyState === 'live' && t.enabled && !t.muted
                    );
                    
                    if (activeVideoTracks.length === 0) {
                        console.warn(`⚠️ [updateVideoOverlays ${userId}] Нет активных видео треков в потоке, не устанавливаем srcObject`);
                        // Не устанавливаем srcObject если нет активных треков
                        return; // Выходим, не показываем карточку
                    }
                    
                    // ВАЖНО: Устанавливаем srcObject если он еще не установлен или отличается
                    if (videoElement.srcObject !== stream) {
                        console.log(`🔄 [updateVideoOverlays ${userId}] Устанавливаем srcObject для videoElement (remoteStream)`);
                        console.log(`🔍 [updateVideoOverlays ${userId}] Stream tracks:`, stream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
                        console.log(`🔍 [updateVideoOverlays ${userId}] Active video tracks:`, activeVideoTracks.map(t => `${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
                        videoElement.srcObject = stream;
                    }
                    
                    // КРИТИЧНО: Убеждаемся что видео воспроизводится
                    // Вызываем play() с задержкой чтобы дать потоку время установиться
                    const playVideo = async () => {
                        try {
                            await videoElement.play();
                            console.log(`✅ [updateVideoOverlays ${userId}] Видео успешно воспроизводится`);
                        } catch (err) {
                            if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                console.warn(`⚠️ [updateVideoOverlays ${userId}] Ошибка play:`, err);
                                // Пробуем еще раз через небольшую задержку
                                setTimeout(() => {
                                    videoElement.play().catch(e => {
                                        console.warn(`⚠️ [updateVideoOverlays ${userId}] Повторная ошибка play:`, e);
                                    });
                                }, 200);
                            }
                        }
                    };
                    
                    // Вызываем play() сразу и с задержкой для надежности
                    playVideo();
                    setTimeout(playVideo, 100);
                    setTimeout(playVideo, 300);
                    
                    // ВАЖНО: Периодически проверяем, что видео действительно активно
                    // Это нужно для случая, когда трек становится неактивным после показа карточки
                    // Но проверка уже выполнена выше, поэтому здесь только дополнительная проверка
                    setTimeout(() => {
                        // Проверяем, что соединение все еще существует
                        const peerConnection = this.videoCallManager.remoteUsers.get(userId);
                        if (!peerConnection) {
                            return; // Соединение закрыто, не проверяем
                        }
                        
                        // Проверяем состояние треков в потоке
                        const videoTracks = stream.getVideoTracks();
                        const hasActiveTracks = videoTracks.some(t => t.enabled && !t.muted && t.readyState === 'live');
                        
                        // Проверяем состояние треков в receivers
                        let hasActiveReceiverVideo = false;
                        const receivers = peerConnection.getReceivers();
                        const videoReceiver = receivers.find(r => {
                            const track = r.track;
                            return track && track.kind === 'video' && track.readyState === 'live' && track.enabled && !track.muted;
                        });
                        if (videoReceiver && videoReceiver.track) {
                            hasActiveReceiverVideo = true;
                            
                            // ВАЖНО: Если трек активен в receivers, но его нет в потоке - добавляем его
                            const track = videoReceiver.track;
                            if (!videoTracks.some(t => t.id === track.id)) {
                                console.log(`✅ [updateVideoOverlays ${userId}] Добавляем активный видео трек из receivers в поток (дополнительная проверка)`);
                                stream.addTrack(track);
                                // Обновляем UI
                                this.videoCallManager.uiManager.updateVideoOverlays();
                                return; // Выходим, не скрываем карточку
                            }
                        }
                        
                        // ВАЖНО: Скрываем карточку ТОЛЬКО если нет активных треков И нет активного видео в receivers
                        if ((!hasActiveTracks || !hasActiveReceiverVideo) && participantCard.style.display !== 'none') {
                            console.log(`🗑️ [updateVideoOverlays ${userId}] Видео неактивно (hasActiveTracks=${hasActiveTracks}, hasActiveReceiverVideo=${hasActiveReceiverVideo}), скрываем карточку`);
                            // Удаляем все видео треки из потока
                            stream.getVideoTracks().forEach(track => stream.removeTrack(track));
                            // Скрываем карточку
                            participantCard.style.setProperty('display', 'none', 'important');
                            participantCard.style.setProperty('visibility', 'hidden', 'important');
                            participantCard.style.setProperty('opacity', '0', 'important');
                            if (videoElement) {
                                videoElement.pause();
                                videoElement.srcObject = null;
                                try {
                                    videoElement.load();
                                } catch (e) {}
                            }
                            this.videoCallManager.checkEmptyState();
                        }
                    }, 300);
                }
                console.log(`✅ [updateVideoOverlays ${userId}] Удаленная карточка: ПОКАЗЫВАЕМ (есть активное видео)`);
                return; // Выходим, не переходим к логике скрытия
            }
            
            // Если дошли сюда - значит нет активного видео в потоке
            // НО ПЕРЕД СКРЫТИЕМ - еще раз проверяем receivers на случай если трек только что пришел
            // Это критично для случая первого подключения
            let foundActiveTrackInReceivers = false;
            if (peerConnection) {
                const receivers = peerConnection.getReceivers();
                const videoReceiver = receivers.find(receiver => {
                    const track = receiver.track;
                    return track && track.kind === 'video' && track.readyState === 'live' && track.enabled && !track.muted;
                });
                if (videoReceiver && videoReceiver.track) {
                    const track = videoReceiver.track;
                    const trackInStream = stream.getTracks().find(t => t.id === track.id);
                    if (!trackInStream) {
                        console.log(`✅ [updateVideoOverlays ${userId}] НАЙДЕН активный видео трек в receivers при финальной проверке, добавляем в поток`);
                        stream.addTrack(track);
                        foundActiveTrackInReceivers = true;
                        // Обновляем UI и выходим - карточка будет показана
                        setTimeout(() => {
                            this.videoCallManager.uiManager.updateVideoOverlays();
                        }, 50);
                        return; // Выходим, не скрываем карточку
                    }
                }
            }
            
            // НЕТ активного видео - СКРЫВАЕМ карточку и ОЧИЩАЕМ srcObject
            // ВАЖНО: Делаем это ТОЛЬКО если не нашли активный трек в receivers выше
            if (foundActiveTrackInReceivers) {
                return; // Уже обработали выше
            }
            
            console.log(`❌ [updateVideoOverlays ${userId}] НЕТ активного видео - скрываем карточку и очищаем srcObject`);
            
            // КРИТИЧНО: СНАЧАЛА очищаем srcObject и скрываем карточку - это предотвращает показ черного экрана
            // ВАЖНО: Делаем это в правильном порядке для предотвращения черных квадратов
            if (videoElement) {
                // СНАЧАЛА скрываем элемент - это предотвращает показ черного экрана
                videoElement.style.setProperty('display', 'none', 'important');
                // Затем останавливаем воспроизведение
                videoElement.pause();
                // Затем очищаем srcObject
                videoElement.srcObject = null;
                // Используем load() для полной очистки
                try {
                    videoElement.load();
                } catch (e) {
                    // Игнорируем ошибки
                }
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
                console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем видео трек ${track.id} из потока (нет активного видео)`);
                stream.removeTrack(track);
            });
            
            console.log(`❌ [updateVideoOverlays ${userId}] Карточка скрыта, srcObject очищен, треки удалены`);
        });
        } finally {
            // Сбрасываем флаг после завершения обновления
            this._updatingVideoOverlays = false;
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
                        if (stream._originalRemoveTrack) {
                            stream._originalRemoveTrack(track);
                        } else {
                            MediaStream.prototype.removeTrack.call(stream, track);
                        }
                    }
                    // ВАЖНО: Обновляем UI через setTimeout чтобы избежать рекурсии
                    setTimeout(() => {
                        if (!this._updatingVideoOverlays) {
                            this.updateVideoOverlays();
                        }
                        this.videoCallManager.checkEmptyState();
                    }, 50);
                };
                
                track.onmute = () => {
                    console.log(`Трек ${track.kind} заглушен для пользователя ${userId}`);
                    // ВАЖНО: Обновляем UI через setTimeout чтобы избежать рекурсии
                    setTimeout(() => {
                        if (!this._updatingVideoOverlays) {
                            this.updateVideoOverlays();
                        }
                        this.videoCallManager.checkEmptyState();
                    }, 50);
                };
                
                track.onunmute = () => {
                    console.log(`Трек ${track.kind} включен для пользователя ${userId}`);
                    this.updateVideoOverlays();
                    this.videoCallManager.checkEmptyState();
                };
            };
            
            stream.getTracks().forEach(setupTrackHandlers);
            
            // Отслеживаем добавление новых треков в поток
            // ВАЖНО: Сохраняем оригинальный метод ПЕРЕД переопределением
            const originalAddTrack = MediaStream.prototype.addTrack.bind(stream);
            stream._originalAddTrack = originalAddTrack; // Сохраняем для использования в updateVideoOverlays
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
                                // Трек стал активным - обновляем UI через setTimeout чтобы избежать рекурсии
                                setTimeout(() => {
                                    if (!this._updatingVideoOverlays) {
                                        this.updateVideoOverlays();
                                    }
                                }, 50);
                            }
                        }
                    }, 500);
                }
                
                // ВАЖНО: НЕ вызываем updateVideoOverlays здесь - это вызывает рекурсию!
                // Обновление UI произойдет автоматически через другие механизмы
                setTimeout(() => {
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
            // ВАЖНО: Сохраняем оригинальный метод ПЕРЕД переопределением
            const originalRemoveTrack = MediaStream.prototype.removeTrack.bind(stream);
            stream._originalRemoveTrack = originalRemoveTrack; // Сохраняем для использования в обработчиках
            stream.removeTrack = (track) => {
                const result = originalRemoveTrack(track);
                console.log(`Трек ${track.kind} удален из потока для пользователя ${userId}`);
                // ВАЖНО: НЕ вызываем updateVideoOverlays здесь - это вызывает рекурсию!
                // Обновление UI произойдет автоматически через другие механизмы
                setTimeout(() => {
                    this.videoCallManager.checkEmptyState();
                }, 100);
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


