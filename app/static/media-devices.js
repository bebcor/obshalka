// Модуль для работы с медиа-устройствами

class MediaDevicesManager {
    constructor() {
        this.availableMicrophones = [];
        this.availableCameras = [];
        this.selectedMicrophoneId = null;
        this.selectedCameraId = null;
    }

    async checkMediaDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableMicrophones = devices.filter(device => device.kind === 'audioinput');
            this.availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            console.log('Доступные устройства:', {
                микрофоны: this.availableMicrophones.length,
                камеры: this.availableCameras.length
            });
            
            return { 
                microphones: this.availableMicrophones, 
                cameras: this.availableCameras 
            };
        } catch (error) {
            console.error('Ошибка проверки устройств:', error);
            return { microphones: [], cameras: [] };
        }
    }

    async getMicrophones() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableMicrophones = devices.filter(device => 
                device.kind === 'audioinput' && device.deviceId
            );
            return this.availableMicrophones;
        } catch (error) {
            console.error('Ошибка получения списка микрофонов:', error);
            return [];
        }
    }

    async getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableCameras = devices.filter(device => 
                device.kind === 'videoinput' && device.deviceId
            );
            return this.availableCameras;
        } catch (error) {
            console.error('Ошибка получения списка камер:', error);
            return [];
        }
    }

    showMicrophoneSelection(callback) {
        if (this.availableMicrophones.length <= 1) {
            showNotification('Доступен только один микрофон', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'microphone-selection-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3 style="display: flex; align-items: center; gap: 8px;"><img src="/static/images/microphone.png" alt="Микрофон" style="width: 24px; height: 24px; flex-shrink: 0; display: block;"> <span>Выберите микрофон</span></h3>
                    <div class="microphone-list">
                        ${this.availableMicrophones.map((mic, index) => `
                            <div class="microphone-item" data-device-id="${mic.deviceId}">
                                <input type="radio" id="mic-${index}" name="microphone" 
                                       ${this.selectedMicrophoneId === mic.deviceId ? 'checked' : ''}>
                                <label for="mic-${index}">
                                    ${escapeHtml(mic.label || `Микрофон ${index + 1}`)}
                                    ${this.selectedMicrophoneId === mic.deviceId ? ' ✅' : ''}
                                </label>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-buttons">
                        <button id="cancelMicSelect" class="btn btn-secondary">Отмена</button>
                        <button id="confirmMicSelect" class="btn btn-primary">Выбрать</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        document.getElementById('confirmMicSelect').addEventListener('click', () => {
            const selected = modal.querySelector('input[name="microphone"]:checked');
            if (!selected) {
                showNotification('Выберите микрофон', 'warning');
                return;
            }

            const selectedItem = selected.closest('.microphone-item');
            const deviceId = selectedItem.dataset.deviceId;
            this.selectedMicrophoneId = deviceId;
            document.body.removeChild(modal);
            
            if (callback) callback(deviceId);
        });

        document.getElementById('cancelMicSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    showCameraSelection(callback) {
        if (this.availableCameras.length <= 1) {
            showNotification('Доступна только одна камера', 'info');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'camera-selection-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3 style="display: flex; align-items: center; gap: 8px;"><img src="/static/images/camera.png" alt="Камера" style="width: 24px; height: 24px; flex-shrink: 0; display: block;"> <span>Выберите камеру</span></h3>
                    <div class="camera-list">
                        ${this.availableCameras.map((camera, index) => `
                            <div class="camera-item" data-device-id="${camera.deviceId}">
                                <input type="radio" id="camera-${index}" name="camera" 
                                       ${this.selectedCameraId === camera.deviceId ? 'checked' : ''}>
                                <label for="camera-${index}">
                                    ${escapeHtml(camera.label || `Камера ${index + 1}`)}
                                    ${this.selectedCameraId === camera.deviceId ? ' ✅' : ''}
                                </label>
                            </div>
                        `).join('')}
                    </div>
                    <div class="modal-buttons">
                        <button id="cancelCameraSelect" class="btn btn-secondary">Отмена</button>
                        <button id="confirmCameraSelect" class="btn btn-primary">Выбрать</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        document.getElementById('confirmCameraSelect').addEventListener('click', () => {
            const selected = modal.querySelector('input[name="camera"]:checked');
            if (!selected) {
                showNotification('Выберите камеру', 'warning');
                return;
            }

            const selectedItem = selected.closest('.camera-item');
            const deviceId = selectedItem.dataset.deviceId;
            this.selectedCameraId = deviceId;
            document.body.removeChild(modal);
            
            if (callback) callback(deviceId);
        });

        document.getElementById('cancelCameraSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
}

