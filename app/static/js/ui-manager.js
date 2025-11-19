// Модуль для управления UI
class UIManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
    }

    updateUI() {
        // Update connection status
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            const isConnected = this.videoCallManager.socketHandler.getIsConnected();
            statusElement.textContent = isConnected ? 'Connected' : 'Disconnected';
            statusElement.className = isConnected ? 'status-connected' : 'status-disconnected';
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
        const localVideo = document.getElementById('localVideo');
        const localOverlay = document.getElementById('localVideoOverlay');
        
        // Local video overlay
        if (localVideo && localOverlay) {
            const videoTrack = this.videoCallManager.localStream?.getVideoTracks()[0];
            if (videoTrack && videoTrack.enabled && this.videoCallManager.localStream) {
                localOverlay.style.display = 'none';
            } else {
                localOverlay.style.display = 'flex';
            }
        }
        
        // Remote video overlays для всех пользователей
        this.videoCallManager.remoteStreams.forEach((stream, userId) => {
            const remoteVideo = document.getElementById(`remoteVideo-${userId}`);
            const remoteOverlay = remoteVideo?.parentElement.querySelector('.video-overlay');
            
            if (remoteVideo && remoteOverlay) {
                if (stream && remoteVideo.srcObject) {
                    const videoTracks = stream.getVideoTracks();
                    if (videoTracks.length > 0 && videoTracks[0].readyState === 'live') {
                        remoteOverlay.style.display = 'none';
                    } else {
                        remoteOverlay.style.display = 'flex';
                    }
                } else {
                    remoteOverlay.style.display = 'flex';
                }
            }
        });
    }

    updateControlButtons() {
        const audioBtn = document.getElementById('toggleAudio');
        const videoBtn = document.getElementById('toggleVideo');
        
        if (this.videoCallManager.localStream) {
            const audioEnabled = this.videoCallManager.localStream.getAudioTracks()[0]?.enabled;
            const videoEnabled = this.videoCallManager.localStream.getVideoTracks()[0]?.enabled;
            
            if (audioBtn) {
                audioBtn.classList.toggle('active', audioEnabled);
                audioBtn.classList.toggle('muted', !audioEnabled);
            }
            
            if (videoBtn) {
                videoBtn.classList.toggle('active', videoEnabled);
                videoBtn.classList.toggle('muted', !videoEnabled);
            }
            this.updateBadges();
        } else {
            if (audioBtn) {
                audioBtn.classList.remove('active');
                audioBtn.classList.add('muted');
            }
            if (videoBtn) {
                videoBtn.classList.remove('active');
                videoBtn.classList.add('muted');
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
        const videoContainer = document.querySelector('.video-container');
        
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper remote';
        videoWrapper.id = `remoteWrapper-${userId}`;
        
        videoWrapper.innerHTML = `
            <video id="remoteVideo-${userId}" autoplay playsinline></video>
            <div class="video-label">User ${userId.substring(0, 8)}
                <span class="badge-group">
                    <span class="badge badge-audio on" title="Микрофон включен">🎤</span>
                    <span class="badge badge-video on" title="Камера включена">📹</span>
                </span>
            </div>
            <div class="video-overlay">
                <div class="overlay-icon">👤</div>
                <p>Waiting for video...</p>
            </div>
        `;
        
        videoContainer.appendChild(videoWrapper);
        
        const videoElement = document.getElementById(`remoteVideo-${userId}`);
        videoElement.srcObject = stream;
    }
}

