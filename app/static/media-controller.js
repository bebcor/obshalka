// Модуль для управления медиа (камера, микрофон, экран)
class MediaController {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        this.audioAnalyzer = null;
    }

    async startVideo() {
        try {
            // ПРОВЕРЯЕМ доступность камер ДО запроса
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(device => device.kind === 'videoinput');
            
            console.log('📹 Доступность камеры:', hasCamera);
            
            if (!hasCamera) {
                console.log('🎯 Камера не найдена, запрашиваем только микрофон');
                
                // СКРЫВАЕМ ВИДЕО-ПЛАШКУ ЕСЛИ КАМЕРЫ НЕТ
                const localOverlay = document.getElementById('localVideoOverlay');
                if (localOverlay) {
                    localOverlay.style.display = 'none';
                }
                
                const audioConstraints = this.videoCallManager.selectedMicrophoneId ? {
                    deviceId: { ideal: this.videoCallManager.selectedMicrophoneId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                };
                
                this.videoCallManager.localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: audioConstraints 
                });
                
                this.videoCallManager.hasVideoTrack = false; // НЕТ ВИДЕОТРЕКА
                
            } else {
                // ЕСЛИ камера есть - запрашиваем оба с ВЫБРАННОЙ КАМЕРОЙ
                const needAdditionalAudio = !this.videoCallManager.localStream || this.videoCallManager.localStream.getAudioTracks().length === 0;
                const audioConstraints = this.videoCallManager.selectedMicrophoneId ? {
                    deviceId: { ideal: this.videoCallManager.selectedMicrophoneId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                };

                const constraints = {
                    video: this.videoCallManager.selectedCameraId ? {
                        deviceId: { exact: this.videoCallManager.selectedCameraId },
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 }, 
                        frameRate: { ideal: 30 }
                    } : {
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 }, 
                        frameRate: { ideal: 30 }
                    },
                    audio: needAdditionalAudio ? audioConstraints : false
                };
                
                console.log('🎥 Запрашиваем медиа с constraints:', constraints);
                
                try {
                    // СОЗДАЕМ ОТДЕЛЬНЫЙ поток для камеры
                    this.videoCallManager.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
                    
                    // ЕСЛИ уже есть локальный поток (от экрана), добавляем в него камеру
            const cameraVideoTracks = this.videoCallManager.cameraStream.getVideoTracks();
            const cameraAudioTracks = this.videoCallManager.cameraStream.getAudioTracks();
            
            if (this.videoCallManager.localStream) {
                const localStream = this.videoCallManager.localStream;
                // Удаляем только существующие видео треки
                const oldVideoTracks = localStream.getVideoTracks();
                oldVideoTracks.forEach(track => {
                    localStream.removeTrack(track);
                    if (!track.label.includes('screen') && !track.label.includes('window') && !track.label.includes('display')) {
                        track.stop();
                    }
                });
                
                // Добавляем новые видео треки камеры в существующий поток (аудио сохраняем из localStream)
                cameraVideoTracks.forEach(track => {
                    localStream.addTrack(track);
                });
                
                // Аудио из cameraStream нам не нужно, выключаем его чтобы не было дубликатов
                cameraAudioTracks.forEach(track => track.stop());
            } else {
                // ЕСЛИ нет локального потока - используем полный поток камеры (аудио+видео)
                this.videoCallManager.localStream = this.videoCallManager.cameraStream;
            }
                    
                    const localVideo = document.getElementById('localVideo');
                    
                    if (localVideo) {
                        localVideo.srcObject = this.videoCallManager.localStream;
                        // НЕ устанавливаем display здесь - это сделает updateVideoOverlays()
                        // который проверит, есть ли активное видео
                    }
                    
                    // НЕ принудительно показываем карточку - это сделает updateVideoOverlays()
                    // Карточка появится только если есть активное видео
                    this.videoCallManager.hasVideoTrack = true; // ЕСТЬ ВИДЕОТРЕК
                    
                } catch (cameraError) {
                    console.error('❌ Ошибка доступа к камере, пробуем только микрофон:', cameraError);
                    // Если камера недоступна, пробуем только микрофон
                    await this.startAudioOnly();
                    return;
                }
            }
            
            // ОБНОВЛЯЕМ UI и соединения
            this.videoCallManager.uiManager.updateControlButtons();
            this.videoCallManager.uiManager.updateVideoOverlays();
            
            // Запускаем анализ аудио
            if (this.videoCallManager.audioAnalyzer) {
                this.videoCallManager.audioAnalyzer.startAnalysis();
            }
            
            console.log('✅ Камера успешно запущена');
            
            // ВАЖНО: После запуска камеры обновляем треки во всех существующих соединениях
            // Это нужно чтобы новые треки были добавлены в peer connections, которые уже были созданы
            // updateVideoTracksInConnections сам добавит треки и создаст offer если нужно
            await this.updateVideoTracksInConnections();
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            if (error.name === 'NotAllowedError') {
                this.videoCallManager.notificationManager.show('Доступ к камере/микрофону запрещен. Вы можете включить их позже.', 'warning');
            } else if (error.name === 'NotFoundError') {
                this.videoCallManager.notificationManager.show('Камера или микрофон не найдены. Вы все еще можете присоединиться к звонку.', 'warning');
            } else {
                this.videoCallManager.notificationManager.show('Не удалось получить доступ к камере/микрофону: ' + error.message, 'error');
            }
            throw error;
        }
    }

    async toggleAudio() {
        // Если локального потока нет - создаем его
        if (!this.videoCallManager.localStream) {
            try {
                await this.startAudioOnly();
                this.videoCallManager.notificationManager.show('Микрофон включен', 'success');
            } catch (error) {
                this.videoCallManager.notificationManager.show('Не удалось включить микрофон', 'error');
                return;
            }
        } else {
            // Если поток есть - переключаем состояние аудио
            const audioTracks = this.videoCallManager.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                const enabled = !audioTracks[0].enabled;
                audioTracks[0].enabled = enabled;
                
                // Обновляем анализ аудио
                if (this.videoCallManager.audioAnalyzer) {
                    if (enabled) {
                        this.videoCallManager.audioAnalyzer.startAnalysis();
                    } else {
                        this.videoCallManager.audioAnalyzer.stopAnalysis();
                    }
                }
                
                this.videoCallManager.uiManager.updateControlButtons();
                this.videoCallManager.notificationManager.show(enabled ? 'Микрофон включен' : 'Микрофон выключен', 'info');
                
                // Обновляем соединения только если трек включен
                if (enabled) {
                    await this.updateAudioTracksInConnections();
                }
            } else {
                // Если аудио-треков нет, но поток есть - добавляем аудио
                await this.startAudioOnly();
            }
        }
    }

    async toggleVideo() {
        console.log(`\n🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥`);
        console.log(`🎥 ========== TOGGLE VIDEO ВЫЗВАН ==========`);
        console.log(`📅 Время: ${new Date().toISOString()}`);
        console.log(`📊 Текущее состояние:`);
        console.log(`   - isSharingScreen: ${this.videoCallManager.isSharingScreen}`);
        console.log(`   - localStream: ${this.videoCallManager.localStream ? 'есть' : 'нет'}`);
        if (this.videoCallManager.localStream) {
            const videoTracks = this.videoCallManager.localStream.getVideoTracks();
            console.log(`   - videoTracks.length: ${videoTracks.length}`);
            if (videoTracks.length > 0) {
                console.log(`   - videoTrack.enabled: ${videoTracks[0].enabled}`);
                console.log(`   - videoTrack.muted: ${videoTracks[0].muted}`);
                console.log(`   - videoTrack.readyState: ${videoTracks[0].readyState}`);
            }
        }
        console.log(`🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥🎥\n`);
        
        // ЕСЛИ демонстрируем экран - не выключаем видео, а переключаем между камерой и экраном
        if (this.videoCallManager.isSharingScreen) {
            this.videoCallManager.notificationManager.show('Остановите демонстрацию экрана чтобы выключить камеру', 'warning');
            return;
        }

        let createdVideoTrack = false;
        const needToCreateVideoTrack = 
            !this.videoCallManager.localStream || 
            this.videoCallManager.localStream.getVideoTracks().length === 0;

        if (needToCreateVideoTrack) {
            try {
                await this.startVideo();
                createdVideoTrack = true;
            } catch (error) {
                this.videoCallManager.notificationManager.show('Не удалось включить камеру без доступа к медиа', 'error');
                return;
            }
        }
        
        const videoTracks = this.videoCallManager.localStream.getVideoTracks();
        if (videoTracks.length === 0) {
            // Не удалось получить видео-трек даже после startVideo
            this.videoCallManager.notificationManager.show('Видео недоступно', 'warning');
            return;
        }

        if (createdVideoTrack) {
            // Камера только что включена — оставляем трек активным
            this.videoCallManager.hasVideoTrack = true;
            
            // КРИТИЧНО: Обновляем локальное состояние камеры
            this.videoCallManager.localCameraEnabled = true;
            this.videoCallManager.cameraStates.set('local', { cameraEnabled: true });
            
            // КРИТИЧНО: Отправляем сигнал о состоянии камеры всем участникам
            console.log(`📤 [toggleVideo] Отправляем сигнал camera_state: true (камера включена)`);
            this.videoCallManager.sendCameraState(true);
            
            this.videoCallManager.uiManager.updateControlButtons();
            this.videoCallManager.uiManager.updateVideoOverlays();
            this.videoCallManager.notificationManager.show('Камера включена', 'info');
            return;
        }

        if (videoTracks.length > 0) {
            const videoTrack = videoTracks[0];
            const oldEnabledState = videoTrack.enabled;
            const newEnabledState = !videoTrack.enabled;
            
            console.log(`\n🎥 ========== TOGGLE VIDEO ==========`);
            console.log(`📊 [toggleVideo] Состояние ДО переключения:`);
            console.log(`   - videoTrack.id: ${videoTrack.id}`);
            console.log(`   - videoTrack.enabled: ${oldEnabledState}`);
            console.log(`   - videoTrack.readyState: ${videoTrack.readyState}`);
            console.log(`   - videoTrack.muted: ${videoTrack.muted}`);
            console.log(`📊 [toggleVideo] Новое состояние:`);
            console.log(`   - newEnabledState: ${newEnabledState}`);
            
            videoTrack.enabled = newEnabledState;
            console.log(`✅ [toggleVideo] videoTrack.enabled установлен в ${newEnabledState}`);
            
            // ОБНОВЛЯЕМ ФЛАГ
            this.videoCallManager.hasVideoTrack = newEnabledState;
            console.log(`✅ [toggleVideo] hasVideoTrack установлен в ${newEnabledState}`);
            
            // КРИТИЧЕСКИ ВАЖНО: вызываем replaceTrack для обновления соединения
            console.log(`🔄 [toggleVideo] Обновляем видео трек в соединениях: ${newEnabledState ? 'ENABLED' : 'DISABLED'}`);
            await this.updateVideoTracksInConnections(newEnabledState ? videoTrack : null);
            console.log(`✅ [toggleVideo] updateVideoTracksInConnections завершен`);
            
            // КРИТИЧНО: Обновляем локальное состояние камеры
            this.videoCallManager.localCameraEnabled = newEnabledState;
            this.videoCallManager.cameraStates.set('local', { cameraEnabled: newEnabledState });
            
            // КРИТИЧНО: Отправляем сигнал о состоянии камеры всем участникам
            console.log(`📤 [toggleVideo] Отправляем сигнал camera_state: ${newEnabledState}`);
            this.videoCallManager.sendCameraState(newEnabledState);
            
            this.videoCallManager.uiManager.updateControlButtons();
            console.log(`✅ [toggleVideo] updateControlButtons вызван`);
            
            // Обновляем UI - WebRTC автоматически обновит треки на другой стороне
            console.log(`🔄 [toggleVideo] Вызываем updateVideoOverlays()...`);
            this.videoCallManager.uiManager.updateVideoOverlays();
            console.log(`✅ [toggleVideo] updateVideoOverlays() завершен`);
            
            this.videoCallManager.checkEmptyState();
            this.videoCallManager.notificationManager.show(newEnabledState ? 'Камера включена' : 'Камера выключена', 'info');
            
            console.log(`\n🎥 ========== КОНЕЦ TOGGLE VIDEO ==========\n`);
        }
    }

    async shareScreen() {
        // ЕСЛИ уже демонстрируем экран - останавливаем
        if (this.videoCallManager.isSharingScreen) {
            await this.stopScreenShare();
            return;
        }

        try {
            console.log('🖥️ Начинаем демонстрацию экрана...');
            
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'window',
                    frameRate: { ideal: 30 }
                },
                audio: false
            });
        
            const screenVideoTrack = screenStream.getVideoTracks()[0];
            
            if (!screenVideoTrack) {
                throw new Error('Не удалось получить видео с экрана');
            }

            // СОХРАНЯЕМ предыдущий поток для восстановления
            this.videoCallManager.previousStream = this.videoCallManager.localStream;
            
            // СОЗДАЕМ НОВЫЙ поток только с экраном
            const newStream = new MediaStream();
            newStream.addTrack(screenVideoTrack);
            
            // ДОБАВЛЯЕМ аудио из предыдущего потока если есть
            if (this.videoCallManager.previousStream) {
                const audioTracks = this.videoCallManager.previousStream.getAudioTracks();
                audioTracks.forEach(track => {
                    newStream.addTrack(track);
                });
            }

            // ОБНОВЛЯЕМ локальный поток
            this.videoCallManager.localStream = newStream;
            this.videoCallManager.screenStream = screenStream;
            this.videoCallManager.hasVideoTrack = true; // ЕСТЬ ВИДЕО (ЭКРАН)

            // ОБНОВЛЯЕМ видео элемент
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.videoCallManager.localStream;
            }

            // ОБНОВЛЯЕМ ОВЕРЛЕИ - показываем видео
            this.videoCallManager.uiManager.updateVideoOverlays();
            
            // ОБНОВЛЯЕМ соединения с новым видео-треком
            await this.updateVideoTracksInConnections(screenVideoTrack);
            
            this.videoCallManager.isSharingScreen = true;
            
            // КРИТИЧНО: Обновляем локальное состояние камеры (демонстрация экрана = есть видео)
            this.videoCallManager.localCameraEnabled = true;
            this.videoCallManager.cameraStates.set('local', { cameraEnabled: true });
            
            // КРИТИЧНО: Отправляем сигнал о состоянии камеры всем участникам
            // Демонстрация экрана = есть видео, поэтому cameraEnabled = true
            console.log(`📤 [shareScreen] Отправляем сигнал camera_state: true (демонстрация экрана)`);
            this.videoCallManager.sendCameraState(true);
            
            this.videoCallManager.uiManager.updateControlButtons();
            
            this.videoCallManager.notificationManager.show('Демонстрация экрана начата', 'success');
            console.log('✅ Демонстрация экрана активна');

            // Обработчик завершения демонстрации пользователем
            screenVideoTrack.onended = () => {
                console.log('Демонстрация экрана завершена пользователем');
                this.stopScreenShare();
            };
            
        } catch (error) {
            console.error('❌ Ошибка демонстрации экрана:', error);
            if (error.name === 'NotAllowedError') {
                this.videoCallManager.notificationManager.show('Демонстрация экрана отменена', 'info');
            } else {
                this.videoCallManager.notificationManager.show('Ошибка демонстрации экрана: ' + error.message, 'error');
            }
        }
    }

    async stopScreenShare() {
        if (!this.videoCallManager.isSharingScreen) return;

        console.log('🖥️ Останавливаем демонстрацию экрана...');
        
        // ОСТАНАВЛИВАЕМ поток экрана
        if (this.videoCallManager.screenStream) {
            this.videoCallManager.screenStream.getTracks().forEach(track => {
                track.stop();
            });
            this.videoCallManager.screenStream = null;
        }
        
        // ВОССТАНАВЛИВАЕМ предыдущий поток
        if (this.videoCallManager.previousStream) {
            this.videoCallManager.localStream = this.videoCallManager.previousStream;
            this.videoCallManager.previousStream = null;
            
            // ПРОВЕРЯЕМ ЕСТЬ ЛИ ВИДЕОТРЕК В ВОССТАНОВЛЕННОМ ПОТОКЕ
            const videoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
            this.videoCallManager.hasVideoTrack = !!(videoTrack && videoTrack.enabled);
        } else {
            this.videoCallManager.localStream = null;
            this.videoCallManager.hasVideoTrack = false;
        }
        
        // ОБНОВЛЯЕМ видео элемент
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = this.videoCallManager.localStream;
        }

        // ОБНОВЛЯЕМ ОВЕРЛЕИ
        this.videoCallManager.uiManager.updateVideoOverlays();
        
        // ОБНОВЛЯЕМ соединения - либо с камерой, либо без видео
        const videoTrack = this.videoCallManager.localStream ? this.videoCallManager.localStream.getVideoTracks()[0] : null;
        await this.updateVideoTracksInConnections(videoTrack);
        
        this.videoCallManager.isSharingScreen = false;
        
        // КРИТИЧНО: Обновляем локальное состояние камеры после остановки демонстрации экрана
        // Проверяем, есть ли активная камера в восстановленном потоке
        const hasActiveCamera = !!(videoTrack && videoTrack.enabled);
        this.videoCallManager.localCameraEnabled = hasActiveCamera;
        this.videoCallManager.cameraStates.set('local', { cameraEnabled: hasActiveCamera });
        
        // КРИТИЧНО: Отправляем сигнал о состоянии камеры всем участникам
        console.log(`📤 [stopScreenShare] Отправляем сигнал camera_state: ${hasActiveCamera} (после остановки демонстрации экрана)`);
        this.videoCallManager.sendCameraState(hasActiveCamera);
        
        this.videoCallManager.uiManager.updateControlButtons();
        
        this.videoCallManager.notificationManager.show('Демонстрация экрана завершена', 'info');
        console.log('✅ Демонстрация экрана остановлена');
    }

    async startAudioOnly() {
        try {
            const audioConstraints = this.videoCallManager.selectedMicrophoneId ? {
                deviceId: { exact: this.videoCallManager.selectedMicrophoneId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };

            console.log('🎤 Запрашиваем аудио с constraints:', audioConstraints);
            const audioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints 
            });

            // ВСЕГДА СОЗДАЕМ НОВЫЙ ПОТОК ДЛЯ АУДИО
            if (this.videoCallManager.localStream) {
                // Удаляем старые аудиотреки если есть
                const oldAudioTracks = this.videoCallManager.localStream.getAudioTracks();
                oldAudioTracks.forEach(track => {
                    this.videoCallManager.localStream.removeTrack(track);
                    track.stop();
                });
                
                // Добавляем новые аудиотреки
                audioStream.getAudioTracks().forEach(track => {
                    this.videoCallManager.localStream.addTrack(track);
                });
            } else {
                // Если потока нет - создаем новый
                this.videoCallManager.localStream = audioStream;
            }

            // НЕ принудительно показываем карточку - это сделает updateVideoOverlays()
            // Карточка появится только если есть активное видео (не только аудио)

            // СКРЫВАЕМ видео элемент если нет видео-треков
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.style.display = 'none';
            }

            this.videoCallManager.hasVideoTrack = false; // НЕТ ВИДЕОТРЕКА

            // ОБНОВЛЯЕМ соединения - добавляем только аудио
            await this.updateAudioTracksInConnections();
            
            // ВАЖНО: Пересоздаем офферы для всех соединений
            if (this.videoCallManager.remoteUsers.size > 0) {
                console.log('🔄 Пересоздаем офферы для всех соединений после обновления аудио');
                this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
                    this.videoCallManager.webrtcManager.createOffer(userId);
                });
            }

            this.videoCallManager.uiManager.updateControlButtons();
            this.videoCallManager.uiManager.updateVideoOverlays();

            return true;
        } catch (error) {
            console.error('❌ Ошибка включения аудио:', error);
            this.videoCallManager.hasVideoTrack = false;
            
            // ЕСЛИ ВЫБРАННЫЙ МИКРОФОН НЕДОСТУПЕН - ПРОБУЕМ ПО УМОЛЧАНИЮ
            if ((error.name === 'OverconstrainedError' || error.name === 'NotFoundError') && this.videoCallManager.selectedMicrophoneId) {
                console.log('🔄 Выбранный микрофон недоступен, пробуем с настройками по умолчанию...');
                this.videoCallManager.selectedMicrophoneId = null;
                return await this.startAudioOnly();
            }
            
            throw error;
        }
    }

    async restartAudioWithSelectedMicrophone() {
        if (!this.videoCallManager.localStream) {
            console.log('❌ Локальный поток не активен');
            this.videoCallManager.notificationManager.show('Сначала включите микрофон', 'warning');
            return;
        }
        
        try {
            console.log('🔄 Переключаем микрофон на:', this.videoCallManager.selectedMicrophoneId);
            
            // СОХРАНЯЕМ текущее состояние аудио
            const wasAudioEnabled = this.videoCallManager.localStream.getAudioTracks()[0]?.enabled || false;
            
            const audioConstraints = this.videoCallManager.selectedMicrophoneId ? {
                deviceId: { exact: this.videoCallManager.selectedMicrophoneId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            };
            
            console.log('🎤 Создаем новый аудиопоток с constraints:', audioConstraints);
            
            // СОЗДАЕМ новый аудио поток
            const newAudioStream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints 
            });
            
            const newAudioTrack = newAudioStream.getAudioTracks()[0];
            
            // ВОССТАНАВЛИВАЕМ предыдущее состояние
            newAudioTrack.enabled = wasAudioEnabled;
            
            // ЗАМЕНА аудио-трека в существующем потоке
            const oldAudioTracks = this.videoCallManager.localStream.getAudioTracks();
            
            // УДАЛЯЕМ старые аудио-треки
            oldAudioTracks.forEach(track => {
                this.videoCallManager.localStream.removeTrack(track);
                track.stop();
            });
            
            // ДОБАВЛЯЕМ новый аудио-трек
            this.videoCallManager.localStream.addTrack(newAudioTrack);
            
            // ОБНОВЛЯЕМ UI
            this.videoCallManager.uiManager.updateControlButtons();
            
            // ОБНОВЛЯЕМ соединения
            await this.updateAudioTracksInConnections();
            
            // ВАЖНО: Пересоздаем офферы для всех соединений
            if (this.videoCallManager.remoteUsers.size > 0) {
                console.log('🔄 Пересоздаем офферы после смены микрофона');
                this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
                    this.videoCallManager.webrtcManager.createOffer(userId);
                });
            }
            
            this.videoCallManager.notificationManager.show('Микрофон переключен', 'success');
            console.log('✅ Микрофон успешно переключен');
            
        } catch (error) {
            console.error('❌ Ошибка переключения микрофона:', error);
            
            if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
                this.videoCallManager.notificationManager.show('Выбранный микрофон недоступен', 'error');
                this.videoCallManager.selectedMicrophoneId = null;
            } else {
                this.videoCallManager.notificationManager.show('Ошибка переключения микрофона: ' + error.message, 'error');
            }
        }
    }

    async restartVideoWithSelectedCamera() {
        if (!this.videoCallManager.localStream) {
            console.log('❌ Локальный поток не активен');
            this.videoCallManager.notificationManager.show('Сначала включите камеру', 'warning');
            return;
        }
        
        try {
            console.log('🔄 Переключаем камеру на:', this.videoCallManager.selectedCameraId);
            
            // СОХРАНЯЕМ текущее состояние видео
            const wasVideoEnabled = this.videoCallManager.localStream.getVideoTracks()[0]?.enabled || false;
            
            const videoConstraints = this.videoCallManager.selectedCameraId ? {
                deviceId: { exact: this.videoCallManager.selectedCameraId },
                width: { ideal: 1280 }, 
                height: { ideal: 720 }, 
                frameRate: { ideal: 30 }
            } : {
                width: { ideal: 1280 }, 
                height: { ideal: 720 }, 
                frameRate: { ideal: 30 }
            };
            
            console.log('📷 Создаем новый видеопоток с constraints:', videoConstraints);
            
            // СОЗДАЕМ новый видео поток
            const newVideoStream = await navigator.mediaDevices.getUserMedia({ 
                video: videoConstraints 
            });
            
            const newVideoTrack = newVideoStream.getVideoTracks()[0];
            
            // ВОССТАНАВЛИВАЕМ предыдущее состояние
            newVideoTrack.enabled = wasVideoEnabled;
            
            // ЗАМЕНА видео-трека в существующем потоке
            const oldVideoTracks = this.videoCallManager.localStream.getVideoTracks();
            
            // УДАЛЯЕМ старые видео-треки
            oldVideoTracks.forEach(track => {
                this.videoCallManager.localStream.removeTrack(track);
                track.stop();
            });
            
            // ДОБАВЛЯЕМ новый видео-трек
            this.videoCallManager.localStream.addTrack(newVideoTrack);
            
            // ОБНОВЛЯЕМ UI
            this.videoCallManager.uiManager.updateControlButtons();
            
            // ОБНОВЛЯЕМ видео элемент
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.videoCallManager.localStream;
            }
            
            // ОБНОВЛЯЕМ соединения
            await this.updateVideoTracksInConnections(newVideoTrack);
            
            this.videoCallManager.notificationManager.show('Камера переключена', 'success');
            console.log('✅ Камера успешно переключена');
            
        } catch (error) {
            console.error('❌ Ошибка переключения камеры:', error);
            
            if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') {
                this.videoCallManager.notificationManager.show('Выбранная камера недоступна', 'error');
                this.videoCallManager.selectedCameraId = null;
            } else {
                this.videoCallManager.notificationManager.show('Ошибка переключения камеры: ' + error.message, 'error');
            }
        }
    }

    async updateVideoTracksInConnections(newVideoTrack = null) {
        console.log(`\n🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄🔄`);
        console.log(`🔄 ========== updateVideoTracksInConnections ВЫЗВАН ==========`);
        console.log(`📅 Время: ${new Date().toISOString()}`);
        console.log(`🔍 Параметры:`);
        console.log(`   - newVideoTrack: ${newVideoTrack ? `есть (enabled: ${newVideoTrack.enabled}, muted: ${newVideoTrack.muted})` : 'null (УДАЛЯЕМ ВИДЕО)'}`);
        console.log(`   - Количество соединений: ${this.videoCallManager.remoteUsers.size}`);
        
        const videoTrack = newVideoTrack || (this.videoCallManager.localStream ? this.videoCallManager.localStream.getVideoTracks()[0] : null);
        console.log(`🔍 Видео трек для обновления: ${videoTrack ? `есть (enabled: ${videoTrack.enabled})` : 'нет'}`);
        
        const updatePromises = [];
        const offerPromises = [];
        
        this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
            const videoSender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            
            console.log(`🔍 Пользователь ${userId}: videoSender=${videoSender ? 'есть' : 'нет'}, videoTrack=${videoTrack ? 'есть' : 'нет'}`);
            
            if (videoSender) {
                console.log(`🔄 Заменяем видео трек для ${userId}`);
                updatePromises.push(
                    videoSender.replaceTrack(videoTrack).then(() => {
                        console.log(`✅ Видео трек заменен для ${userId}`);
                        
                        // КРИТИЧЕСКИ ВАЖНО: запускаем renegotiation после замены трека
                        if (peerConnection.signalingState === 'stable') {
                            console.log(`🔄 Запускаем renegotiation для ${userId}`);
                            this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                                console.error(`❌ Ошибка renegotiation для ${userId}:`, err);
                            });
                        }
                    }).catch(error => {
                        console.error(`❌ Ошибка замены видео трека для ${userId}:`, error);
                    })
                );
            } else if (videoTrack) {
                // ЕСЛИ отправителя нет, но есть трек - добавляем
                console.log(`🎯 Добавляем видео-трек для пользователя: ${userId}`);
                try {
                    peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                    // ВАЖНО: После добавления трека нужно создать новый offer для переговоров
                    // Это нужно чтобы удаленная сторона получила новый трек
                    offerPromises.push(
                        this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                            console.error(`❌ Ошибка создания offer после добавления видео трека для ${userId}:`, err);
                        })
                    );
                } catch (error) {
                    console.error(`❌ Ошибка добавления видео трека для ${userId}:`, error);
                }
            } else {
                // ЕСЛИ трека нет - удаляем видео-отправитель если есть
                console.log(`\n🗑️🗑️🗑️ [updateVideoTracksInConnections] УДАЛЯЕМ ВИДЕО-ТРЕК ДЛЯ ${userId} 🗑️🗑️🗑️`);
                console.log(`   - videoSender: ${videoSender ? 'есть ✅' : 'нет ❌'}`);
                console.log(`   - videoTrack: ${videoTrack ? 'есть' : 'нет (null)'}`);
                if (videoSender) {
                    console.log(`🔄 [updateVideoTracksInConnections] Вызываем replaceTrack(null) для ${userId}...`);
                    updatePromises.push(
                        videoSender.replaceTrack(null).then(() => {
                            console.log(`✅✅✅ [updateVideoTracksInConnections] replaceTrack(null) УСПЕШНО ВЫПОЛНЕН ДЛЯ ${userId} ✅✅✅`);
                            console.log(`   - Это должно вызвать onmute на удаленной стороне`);
                            
                            // КРИТИЧЕСКИ ВАЖНО: запускаем renegotiation после replaceTrack(null)
                            if (peerConnection.signalingState === 'stable') {
                                console.log(`🔄 [updateVideoTracksInConnections] Запускаем renegotiation после replaceTrack(null) для ${userId}`);
                                this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                                    console.error(`❌ [updateVideoTracksInConnections] Ошибка renegotiation для ${userId}:`, err);
                                });
                            } else {
                                console.log(`⚠️ [updateVideoTracksInConnections] signalingState не stable (${peerConnection.signalingState}), пропускаем renegotiation`);
                            }
                        }).catch(err => {
                            console.error(`❌❌❌ [updateVideoTracksInConnections] ОШИБКА replaceTrack(null) ДЛЯ ${userId}:`, err);
                        })
                    );
                } else {
                    console.warn(`⚠️⚠️⚠️ [updateVideoTracksInConnections] НЕТ videoSender ДЛЯ ${userId}, НЕ МОЖЕМ ВЫЗВАТЬ replaceTrack(null) ⚠️⚠️⚠️`);
                }
            }
        });
        
        try {
            await Promise.all(updatePromises);
            console.log('✅ Все видеотреки обновлены (replaceTrack)');
        } catch (error) {
            console.error('❌ Ошибка обновления видеотреков:', error);
        }
        
        // КРИТИЧНО: Принудительно проверяем все receivers для всех участников
        // Это нужно чтобы они увидели новый видео трек сразу
        if (videoTrack && videoTrack.enabled) {
            console.log('🔄 Принудительно проверяем receivers для всех участников после включения камеры');
            this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
                // Принудительно проверяем все receivers и обновляем потоки
                const receivers = peerConnection.getReceivers();
                const remoteStream = this.videoCallManager.remoteStreams.get(userId);
                
                if (remoteStream) {
                    let tracksUpdated = false;
                    receivers.forEach(receiver => {
                        const track = receiver.track;
                        if (track && track.readyState === 'live') {
                            if (!remoteStream.getTracks().some(t => t.id === track.id)) {
                                remoteStream.addTrack(track);
                                tracksUpdated = true;
                                console.log(`✅ [updateVideoTracksInConnections] Добавлен трек ${track.kind} ${track.id} для ${userId}`);
                            }
                            
                            // КРИТИЧНО: НЕ устанавливаем srcObject здесь!
                            // Это создаст черную плашку если карточка скрыта
                            // srcObject устанавливается в updateVideoOverlays когда карточка показывается
                            // Просто обновляем UI чтобы updateVideoOverlays правильно обработал состояние
                        }
                    });
                    
                    if (tracksUpdated) {
                        // Сбрасываем кэш и обновляем UI
                        this.videoCallManager.uiManager.updateVideoOverlays();
                    }
                }
            });
        }
        
        // Ждем немного перед созданием offer, чтобы треки успели добавиться
        if (offerPromises.length > 0) {
            // ВАЖНО: Создаем offer сразу, но с небольшой задержкой чтобы трек успел добавиться
            setTimeout(async () => {
                try {
                    await Promise.all(offerPromises);
                    console.log('✅ Все offer созданы после добавления треков');
                } catch (error) {
                    console.error('❌ Ошибка создания offer:', error);
                }
            }, 200);
        } else if (updatePromises.length > 0) {
            // Если только replaceTrack - тоже нужно создать offer для переговоров
            console.log('🔄 После replaceTrack создаем offer для переговоров...');
            setTimeout(async () => {
                const renegotiationPromises = [];
                this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
                    // Создаем offer только если signaling state stable
                    if (peerConnection.signalingState === 'stable') {
                        renegotiationPromises.push(
                            this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                                console.error(`❌ Ошибка создания offer для переговоров для ${userId}:`, err);
                            })
                        );
                    }
                });
                try {
                    await Promise.all(renegotiationPromises);
                    console.log('✅ Все offer созданы для переговоров');
                } catch (error) {
                    console.error('❌ Ошибка создания offer для переговоров:', error);
                }
            }, 200);
        }
    }

    async updateAudioTracksInConnections() {
        const audioTrack = this.videoCallManager.localStream?.getAudioTracks()[0];
        if (!audioTrack) {
            console.log('❌ Нет аудиотрека для обновления');
            return;
        }
        
        console.log('🔄 Обновляем аудиотреки в соединениях...');
        
        const updatePromises = [];
        
        this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
            let sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'audio'
            );
            
            if (sender) {
                console.log(`🔄 Обновляем аудиотрек для пользователя: ${userId}`);
                updatePromises.push(sender.replaceTrack(audioTrack));
            } else {
                // ЕСЛИ отправителя нет - создаем новый
                console.log(`🎯 Создаем новый аудио-отправитель для пользователя: ${userId}`);
                try {
                    sender = peerConnection.addTrack(audioTrack, this.videoCallManager.localStream);
                    console.log(`✅ Аудио-отправитель создан для: ${userId}`);
                    // ВАЖНО: После добавления аудио-трека нужно создать новый offer для переговоров
                    // Это нужно чтобы удаленная сторона получила новый трек
                    this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                        console.error(`❌ Ошибка создания offer после добавления аудио трека для ${userId}:`, err);
                    });
                } catch (error) {
                    console.error(`❌ Ошибка создания аудио-отправителя: ${error}`);
                }
            }
        });
        
        try {
            await Promise.all(updatePromises);
            console.log('✅ Все аудиотреки обновлены');
        } catch (error) {
            console.error('❌ Ошибка обновления аудиотреков:', error);
        }
    }

    toggleFullscreen() {
        const container = document.querySelector('.container');
    
        if (!document.fullscreenElement) {
            // Вход в полноэкранный режим
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
        
            container.classList.add('fullscreen-mode');
            this.videoCallManager.notificationManager.show('Полноэкранный режим включен', 'info');
        } else {
            // Выход из полноэкранного режима
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        
            container.classList.remove('fullscreen-mode');
            this.videoCallManager.notificationManager.show('Полноэкранный режим выключен', 'info');
        }
    }
}

