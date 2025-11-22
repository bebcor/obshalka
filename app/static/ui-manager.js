// Модуль для управления UI
class UIManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        // Debounce для updateVideoOverlays
        this._updateVideoOverlaysTimeout = null;
        this._lastVideoOverlaysState = new Map(); // Сохраняем последнее состояние для каждого userId
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
        // DEBOUNCE: отменяем предыдущий вызов если он еще не выполнился
        if (this._updateVideoOverlaysTimeout) {
            clearTimeout(this._updateVideoOverlaysTimeout);
        }
        
        // ЗАЩИТА ОТ РЕКУРСИИ: если уже выполняется обновление, пропускаем
        if (this._updatingVideoOverlays) {
            // Планируем повторный вызов после завершения текущего
            this._updateVideoOverlaysTimeout = setTimeout(() => {
                this.updateVideoOverlays();
            }, 100);
            return;
        }
        
        // DEBOUNCE: выполняем обновление с небольшой задержкой
        this._updateVideoOverlaysTimeout = setTimeout(() => {
            this._updateVideoOverlaysInternal();
        }, 50);
    }
    
    _updateVideoOverlaysInternal() {
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
            const hasActiveVideo = (videoTrack && videoTrack.enabled && videoTrack.readyState === 'live') || isSharingScreen;
            
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
                    const hasVideoTracks = currentStream.getVideoTracks().some(t => t.enabled && t.readyState === 'live');
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
                    if (track && track.enabled && track.readyState === 'live') {
                        activeReceiverTrackIds.add(track.id);
                    }
                });
                
                // ВАЖНО: НЕ добавляем треки из receivers в updateVideoOverlays
                // Это должно происходить только в ontrack
                // Если мы будем добавлять треки здесь, они будут конфликтовать с checkReceiversForNullTracks
                // который удаляет треки, когда их нет в receivers
                
                // КРИТИЧНО: НЕ удаляем треки из потока если они просто muted или disabled!
                // Удаляем ТОЛЬКО если трек ended или его нет в receivers
                const streamTracks = stream.getTracks();
                streamTracks.forEach(track => {
                    const receiverTrack = receivers.find(r => r.track && r.track.id === track.id)?.track;
                    // Удаляем трек ТОЛЬКО если:
                    // 1. Трека нет в receivers вообще
                    // 2. Трек ended
                    // НЕ удаляем если трек просто muted или disabled - он может стать активным!
                    if (!receiverTrack || receiverTrack.readyState === 'ended') {
                        console.log(`🗑️ [updateVideoOverlays] Трек ${track.kind} (${track.id}) удаляем из потока для ${userId}`, {
                            hasReceiver: !!receiverTrack,
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
            
            // КРИТИЧНО: НЕ удаляем треки из потока если они просто disabled или muted!
            // Удаляем ТОЛЬКО если трек ended
            // Треки могут быть muted временно и стать активными позже
            videoTracks.forEach(track => {
                if (track.readyState === 'ended') {
                    console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем ended видео трек:`, {
                        id: track.id,
                        readyState: track.readyState
                    });
                    stream.removeTrack(track);
                }
                // НЕ удаляем если трек просто disabled или muted - он может стать активным!
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
                        // Если transceiver существует и receiver.track === null, проверяем что это видео transceiver
                        if (transceiver) {
                            // Проверяем, что это видео transceiver (по mid или по sender track)
                            const isVideoTransceiver = transceiver.receiver.track === null && 
                                                      (transceiver.mid === '1' || // Обычно видео имеет mid='1'
                                                       (transceiver.sender && transceiver.sender.track && transceiver.sender.track.kind === 'video'));
                            return isVideoTransceiver;
                        }
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
                    // ВАЖНО: НЕ удаляем треки если они просто disabled - оставляем их в потоке!
                    const streamVideoTracks = stream.getVideoTracks();
                    streamVideoTracks.forEach(streamTrack => {
                        // Ищем соответствующий receiver для этого трека
                        const receiver = receivers.find(r => {
                            const rTrack = r.track;
                            return rTrack && rTrack.id === streamTrack.id;
                        });
                        const receiverTrack = receiver?.track;
                        
                        // Удаляем трек ТОЛЬКО если:
                        // 1. Трек ended (полностью завершен)
                        // 2. Нет receiver И трек ended
                        let shouldRemove = false;
                        if (streamTrack.readyState === 'ended') {
                            shouldRemove = true;
                            console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем видео трек ${streamTrack.id} - ended`);
                        } else if (!receiver && streamTrack.readyState === 'ended') {
                            // Нет receiver для этого трека И трек ended
                            shouldRemove = true;
                            console.log(`🗑️ [updateVideoOverlays ${userId}] Удаляем видео трек ${streamTrack.id} - нет receiver и ended`);
                        } else {
                            // Трек live (даже если disabled) - НЕ УДАЛЯЕМ!
                            console.log(`✅ [updateVideoOverlays ${userId}] Оставляем видео трек ${streamTrack.id} в потоке (enabled=${streamTrack.enabled}, muted=${streamTrack.muted}, readyState=${streamTrack.readyState})`);
                        }
                        
                        if (shouldRemove && stream.getTracks().includes(streamTrack)) {
                            stream.removeTrack(streamTrack);
                        }
                    });
                }
                
                // КРИТИЧНО: Если в потоке нет треков, но есть receivers - проверяем все receivers
                // Это важно для случая первого подключения, когда ontrack может не сработать
                const streamTracksCount = stream.getTracks().length;
                if (streamTracksCount === 0 && receivers.length > 0) {
                    console.log(`🔍 [updateVideoOverlays ${userId}] Поток пустой, но есть ${receivers.length} receivers - проверяем все receivers`);
                    receivers.forEach((receiver, index) => {
                        const track = receiver.track;
                        console.log(`🔍 [updateVideoOverlays ${userId}] Receiver ${index}: kind=${track?.kind}, track=${track ? 'exists' : 'null'}, enabled=${track?.enabled}, muted=${track?.muted}, readyState=${track?.readyState}`);
                        if (track && track.readyState === 'live') {
                            // Для видео: добавляем ВСЕГДА если live (даже если disabled!)
                            if (track.kind === 'video') {
                                console.log(`✅ [updateVideoOverlays ${userId}] Добавляем видео трек ${track.id} из receiver ${index} в поток (поток был пустой, enabled=${track.enabled}, muted=${track.muted})`);
                                stream.addTrack(track);
                                // КРИТИЧНО: Устанавливаем srcObject и вызываем play() сразу
                                const videoElement = document.getElementById(`remoteVideo-${userId}`);
                                if (videoElement) {
                                    if (videoElement.srcObject !== stream) {
                                        console.log(`🔄 [updateVideoOverlays ${userId}] Устанавливаем srcObject для videoElement (трек добавлен из receivers)`);
                                        videoElement.srcObject = stream;
                                    }
                                    videoElement.play().catch(err => {
                                        if (err.name !== 'AbortError' && err.message && !err.message.includes('aborted')) {
                                            console.warn(`⚠️ [updateVideoOverlays ${userId}] Ошибка play после добавления трека:`, err);
                                        }
                                    });
                                }
                            } else if (track.kind === 'audio') {
                                // Для аудио: добавляем если live
                                console.log(`✅ [updateVideoOverlays ${userId}] Добавляем аудио трек ${track.id} из receiver ${index} в поток (поток был пустой)`);
                                stream.addTrack(track);
                            }
                        } else if (!track) {
                            console.log(`⚠️ [updateVideoOverlays ${userId}] Receiver ${index} имеет null track`);
                        } else {
                            console.log(`⚠️ [updateVideoOverlays ${userId}] Трек в receiver ${index} не live (readyState=${track.readyState})`);
                        }
                    });
                }
                
                // УПРОЩЕННАЯ ЛОГИКА: Ищем видео трек в receivers (даже если disabled)
                // Показываем карточку если есть трек, а активность проверяем отдельно
                const videoReceiver = hasNullVideoReceiver ? null : receivers.find(receiver => {
                    const track = receiver.track;
                    return track && track.kind === 'video' && track.readyState === 'live';
                });
                
                if (!videoReceiver) {
                    // Нет видео трека в receivers - камера полностью отключена (replaceTrack(null))
                    if (hasNullVideoReceiver) {
                        console.log(`❌ [${userId}] Нет видео трека в receivers - есть null receiver (replaceTrack(null))`);
                    } else {
                        console.log(`❌ [${userId}] Нет видео трека в receivers`);
                    }
                    hasActiveVideo = false;
                } else {
                    const track = videoReceiver.track;
                    // Есть видео трек - проверяем активность
                    const isActive = track.enabled;
                    hasActiveVideo = isActive; // hasActiveVideo = true только если трек активен
                    
                    // ВАЖНО: Если трек есть в receivers, но его нет в потоке - добавляем его (даже если disabled!)
                    const trackInStream = stream.getTracks().find(t => t.id === track.id);
                    if (!trackInStream) {
                        console.log(`✅ [${userId}] Добавляем видео трек из receivers в поток (enabled=${track.enabled}, muted=${track.muted})`);
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
                                      track.enabled
                                  );
            
                // КРИТИЧНО: Финальная проверка - если в потоке нет активных видео треков, камера выключена
                const hasActiveVideoInStream = finalVideoTracks.length > 0 && 
                                          finalVideoTracks.some(track => 
                                              track && 
                                              track.readyState === 'live' && 
                                              track.enabled
                                          );
            
            // ВАЖНО: Если трек активен в receivers, но его нет в потоке - добавляем его
            // Это критично для случая, когда трек приходит через ontrack, но еще не добавлен в поток
            // ИЛИ когда трек становится активным после того как был неактивен
            if (hasActiveVideo && !hasActiveVideoInStream && peerConnection) {
                const receivers = peerConnection.getReceivers();
                const videoReceiver = receivers.find(receiver => {
                    const track = receiver.track;
                    return track && track.kind === 'video' && track.readyState === 'live' && track.enabled;
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
                                                                  t.enabled
                                                              );
                        if (updatedHasActiveVideoInStream) {
                            hasActiveVideo = true;
                        } else {
                            hasActiveVideo = false;
                        }
                    } else {
                        // Трек уже в потоке - проверяем его активность
                        const isTrackActive = trackInStream.readyState === 'live' && trackInStream.enabled;
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
                        return track && track.kind === 'video' && track.readyState === 'live' && track.enabled;
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
                                      track.enabled
            );
            
            // КРИТИЧНО: Показываем карточку ТОЛЬКО если есть АКТИВНЫЙ видео трек
            // Если камера выключена - карточка полностью скрывается (не показываем оверлей)
            // ВАЖНО: Получаем receivers перед использованием
            const receivers = peerConnection ? peerConnection.getReceivers() : [];
            const hasActiveVideoTrackInReceivers = peerConnection && receivers.some(r => {
                const track = r.track;
                return track && 
                       track.kind === 'video' && 
                       track.readyState === 'live' && 
                       track.enabled;
            });
            
            // ПРОВЕРКА ИЗМЕНЕНИЯ СОСТОЯНИЯ: обновляем UI только если состояние изменилось
            // КРИТИЧНО: Проверяем также активность треков в потоке (muted/enabled)
            const activeVideoTracksInStream = finalVideoTracks.filter(t => 
                t && t.readyState === 'live' && t.enabled
            );
            const videoTrackIds = finalVideoTracks.map(t => t ? t.id : null);
            const audioTrackIds = finalAudioTracks.map(t => t ? t.id : null);
            const currentState = {
                hasActiveVideoTrackInReceivers,
                finalHasActiveVideo,
                hasActiveAudio,
                videoTracksCount: finalVideoTracks.length,
                audioTracksCount: finalAudioTracks.length,
                activeVideoTracksCount: activeVideoTracksInStream.length,
                cardDisplay: participantCard.style.display,
                // КРИТИЧНО: Сохраняем состояние muted/enabled треков для точной проверки
                videoTracksMuted: finalVideoTracks.map(t => t ? t.muted : null),
                videoTracksEnabled: finalVideoTracks.map(t => t ? t.enabled : null)
            };
            const lastState = this._lastVideoOverlaysState.get(userId);
            
            // Если состояние не изменилось, пропускаем обновление UI
            // НО проверяем также изменение muted/enabled состояния треков
            if (lastState && 
                lastState.hasActiveVideoTrackInReceivers === currentState.hasActiveVideoTrackInReceivers &&
                lastState.finalHasActiveVideo === currentState.finalHasActiveVideo &&
                lastState.activeVideoTracksCount === currentState.activeVideoTracksCount &&
                lastState.cardDisplay === currentState.cardDisplay) {
                // Дополнительная проверка: изменилось ли muted/enabled состояние треков
                const tracksStateChanged = !lastState.videoTracksMuted || 
                    lastState.videoTracksMuted.length !== currentState.videoTracksMuted.length ||
                    lastState.videoTracksMuted.some((muted, i) => muted !== currentState.videoTracksMuted[i]) ||
                    lastState.videoTracksEnabled.some((enabled, i) => enabled !== currentState.videoTracksEnabled[i]);
                
                // КРИТИЧНО: Проверяем, стал ли трек активным (muted изменился с true на false)
                const trackBecameActive = lastState.videoTracksMuted && currentState.videoTracksMuted &&
                    lastState.videoTracksMuted.some((wasMuted, i) => 
                        wasMuted === true && 
                        currentState.videoTracksMuted[i] === false &&
                        currentState.videoTracksEnabled[i] === true
                    );
                
                if (!tracksStateChanged && !trackBecameActive) {
                    console.log(`⏭️ [updateVideoOverlays ${userId}] Состояние не изменилось, пропускаем обновление UI`);
                    return; // Выходим, не обновляем UI
                } else {
                    if (trackBecameActive) {
                        console.log(`✅ [updateVideoOverlays ${userId}] Трек стал активным (muted: true -> false), принудительно обновляем UI`);
                    } else {
                        console.log(`🔄 [updateVideoOverlays ${userId}] Состояние треков изменилось (muted/enabled), обновляем UI`);
                    }
                }
            }
            
            // Сохраняем текущее состояние
            this._lastVideoOverlaysState.set(userId, currentState);
            
            console.log(`🔍 [updateVideoOverlays ${userId}] Проверка: hasActiveVideoTrackInReceivers=${hasActiveVideoTrackInReceivers}, finalHasActiveVideo=${finalHasActiveVideo}, audio=${hasActiveAudio}, tracks=${finalVideoTracks.length}v/${finalAudioTracks.length}a`);
            console.log(`🔍 [updateVideoOverlays ${userId}] Stream tracks:`, stream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
            
            // КРИТИЧНО: Показываем карточку ТОЛЬКО если есть АКТИВНЫЙ видео трек
            if (hasActiveVideoTrackInReceivers && finalHasActiveVideo) {
                // Есть видео трек в receivers - показываем карточку
                participantCard.style.setProperty('display', 'block', 'important');
                participantCard.style.removeProperty('visibility');
                participantCard.style.removeProperty('opacity');
                participantCard.style.removeProperty('width');
                participantCard.style.removeProperty('height');
                participantCard.style.removeProperty('overflow');
                participantCard.style.removeProperty('pointer-events');
                
                if (videoElement) {
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
                    
                    // КРИТИЧНО: Проверяем, что в потоке есть АКТИВНЫЕ видео треки
                    const activeVideoTracks = stream.getVideoTracks().filter(t => 
                        t && 
                        t.readyState === 'live' && 
                        t.enabled
                    );
                    
                    if (activeVideoTracks.length === 0) {
                        // Нет активных видео треков - СКРЫВАЕМ карточку полностью
                        console.log(`❌ [updateVideoOverlays ${userId}] Нет активных видео треков - скрываем карточку`);
                        participantCard.style.setProperty('display', 'none', 'important');
                        if (videoElement) {
                            videoElement.pause();
                            videoElement.srcObject = null;
                            try {
                                videoElement.load();
                            } catch (e) {}
                        }
                        return; // Выходим, карточка скрыта
                    }
                    
                    // ВАЖНО: Устанавливаем srcObject если он еще не установлен или отличается
                    if (videoElement.srcObject !== stream) {
                        console.log(`🔄 [updateVideoOverlays ${userId}] Устанавливаем srcObject для videoElement (remoteStream)`);
                        console.log(`🔍 [updateVideoOverlays ${userId}] Stream tracks:`, stream.getTracks().map(t => `${t.kind}:${t.id}:enabled=${t.enabled}:muted=${t.muted}:readyState=${t.readyState}`));
                        videoElement.srcObject = stream;
                    }
                    
                    // Трек активен - показываем видео
                    videoElement.style.setProperty('display', 'block', 'important');
                    if (overlay) overlay.style.display = 'none';
                    
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
                    
                    // УБРАНО: Периодическая проверка вызывала бесконечные обновления
                    // Проверка состояния выполняется через checkReceiversForNullTracks в webrtc-manager.js
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
                    return track && track.kind === 'video' && track.readyState === 'live' && track.enabled;
                });
                if (videoReceiver && videoReceiver.track) {
                    const track = videoReceiver.track;
                    const trackInStream = stream.getTracks().find(t => t.id === track.id);
                    if (!trackInStream) {
                        console.log(`✅ [updateVideoOverlays ${userId}] НАЙДЕН активный видео трек в receivers при финальной проверке, добавляем в поток`);
                        stream.addTrack(track);
                        foundActiveTrackInReceivers = true;
                        // НЕ вызываем updateVideoOverlays здесь - это вызовет бесконечный цикл
                        // Сбрасываем состояние для следующего обновления
                        this._lastVideoOverlaysState.delete(userId);
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
        if (!participantCard || !videoElement) return;
    
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


