// Модуль для управления медиа (камера, микрофон, экран)
class MediaController {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    async startVideo() {
        try {
            this.videoCallManager.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.videoCallManager.localStream;
            }
            
            this.videoCallManager.uiManager.updateControlButtons();
            this.videoCallManager.uiManager.updateVideoOverlays();
            
            // Добавляем треки во все существующие соединения
            this.videoCallManager.webrtcManager.addTracksToExistingConnections();
            
            // Если есть активные соединения, запускаем renegotiation
            if (this.videoCallManager.remoteUsers.size > 0) {
                this.videoCallManager.remoteUsers.forEach((peerConnection, userId) => {
                    this.videoCallManager.webrtcManager.createOffer(userId);
                });
            }
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
            if (error.name === 'NotAllowedError') {
                this.videoCallManager.notificationManager.show('Camera/microphone access was denied. You can enable them later.', 'warning');
            } else if (error.name === 'NotFoundError') {
                this.videoCallManager.notificationManager.show('No camera or microphone found. You can still join the call.', 'warning');
            } else {
                this.videoCallManager.notificationManager.show('Could not access camera/microphone: ' + error.message, 'error');
            }
            throw error;
        }
    }

    async toggleAudio() {
        if (!this.videoCallManager.localStream) {
            try {
                await this.startVideo();
            } catch (error) {
                this.videoCallManager.notificationManager.show('Cannot enable microphone without media access', 'error');
                return;
            }
        }
        
        const audioTracks = this.videoCallManager.localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            const enabled = !audioTracks[0].enabled;
            audioTracks[0].enabled = enabled;
            
            this.videoCallManager.uiManager.updateControlButtons();
            this.videoCallManager.notificationManager.show(enabled ? 'Microphone on' : 'Microphone off', 'info');
        }
    }

    async toggleVideo() {
        if (!this.videoCallManager.localStream) {
            try {
                await this.startVideo();
            } catch (error) {
                this.videoCallManager.notificationManager.show('Cannot enable camera without media access', 'error');
                return;
            }
        }
        
        const videoTracks = this.videoCallManager.localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            const enabled = !videoTracks[0].enabled;
            videoTracks[0].enabled = enabled;
            
            this.videoCallManager.uiManager.updateControlButtons();
            this.videoCallManager.uiManager.updateVideoOverlays();
            this.videoCallManager.notificationManager.show(enabled ? 'Camera on' : 'Camera off', 'info');
        }
    }

    async shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    displaySurface: 'window'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
        
            const videoTrack = screenStream.getVideoTracks()[0];
        
            if (this.videoCallManager.localStream) {
                const oldVideoTrack = this.videoCallManager.localStream.getVideoTracks()[0];
            
                // Останавливаем старый трек
                if (oldVideoTrack) {
                    oldVideoTrack.stop();
                    this.videoCallManager.localStream.removeTrack(oldVideoTrack);
                }
                
                // Добавляем новый трек экрана
                this.videoCallManager.localStream.addTrack(videoTrack);
            
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = this.videoCallManager.localStream;
                }
            
                // Заменяем треки во всех соединениях
                const replacePromises = [];
                for (const [userId, peerConnection] of this.videoCallManager.remoteUsers) {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                
                    if (sender) {
                        console.log('Replacing video track for:', userId);
                        replacePromises.push(
                            sender.replaceTrack(videoTrack).then(() => {
                                console.log('Video track replaced successfully for:', userId);
                            }).catch(err => {
                                console.error('Error replacing track for:', userId, err);
                            })
                        );
                    } else {
                        // Если нет video sender, добавляем трек
                        console.log('Adding video track for:', userId);
                        peerConnection.addTrack(videoTrack, this.videoCallManager.localStream);
                    }
                }
                
                // Ждем замены всех треков
                await Promise.all(replacePromises);
                
                // Запускаем renegotiation для всех соединений
                // onnegotiationneeded должен сработать автоматически, но на всякий случай
                for (const [userId, peerConnection] of this.videoCallManager.remoteUsers) {
                    if (peerConnection.signalingState === 'stable') {
                        console.log('Triggering renegotiation for screen share:', userId);
                        setTimeout(() => {
                            this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                                console.error('Error creating offer for screen share:', err);
                            });
                        }, 100);
                    }
                }
            
                this.videoCallManager.notificationManager.show('Screen sharing started', 'success');
            
                videoTrack.onended = async () => {
                    console.log('Screen sharing ended');
                    this.videoCallManager.notificationManager.show('Screen sharing ended', 'info');
                    
                    // Останавливаем трек экрана
                    videoTrack.stop();
                    
                    // Если есть старая камера, можно попробовать вернуть её
                    // Но проще просто выключить видео
                    const videoTracks = this.videoCallManager.localStream.getVideoTracks();
                    if (videoTracks.length > 0) {
                        videoTracks[0].stop();
                        this.videoCallManager.localStream.removeTrack(videoTracks[0]);
                    }
                    
                    // Обновляем UI
                    this.videoCallManager.uiManager.updateControlButtons();
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
            } else {
                // Если нет локального потока, создаем новый
                this.videoCallManager.localStream = screenStream;
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = this.videoCallManager.localStream;
                }
                
                // Добавляем треки во все соединения
                this.videoCallManager.webrtcManager.addTracksToExistingConnections();
                
                // Запускаем renegotiation
                for (const [userId] of this.videoCallManager.remoteUsers) {
                    setTimeout(() => {
                        this.videoCallManager.webrtcManager.createOffer(userId).catch(err => {
                            console.error('Error creating offer for screen share:', err);
                        });
                    }, 100);
                }
                
                this.videoCallManager.notificationManager.show('Screen sharing started', 'success');
                
                videoTrack.onended = async () => {
                    console.log('Screen sharing ended');
                    this.videoCallManager.notificationManager.show('Screen sharing ended', 'info');
                    videoTrack.stop();
                    if (this.videoCallManager.localStream) {
                        this.videoCallManager.localStream.getTracks().forEach(track => track.stop());
                        this.videoCallManager.localStream = null;
                    }
                    this.videoCallManager.uiManager.updateControlButtons();
                    this.videoCallManager.uiManager.updateVideoOverlays();
                };
            }
        
        } catch (error) {
            console.error('Error sharing screen:', error);
            if (error.name !== 'NotAllowedError') {
                this.videoCallManager.notificationManager.show('Failed to share screen: ' + error.message, 'error');
            }
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
            this.videoCallManager.notificationManager.show('Fullscreen mode enabled', 'info');
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
            this.videoCallManager.notificationManager.show('Fullscreen mode disabled', 'info');
        }
    }
}

