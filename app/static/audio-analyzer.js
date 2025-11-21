// Модуль для анализа уровня аудио
class AudioAnalyzer {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.animationFrameId = null;
        this.isAnalyzing = false;
    }

    async startAnalysis() {
        if (!this.videoCallManager.localStream) {
            return;
        }

        const audioTracks = this.videoCallManager.localStream.getAudioTracks();
        if (audioTracks.length === 0 || !audioTracks[0].enabled) {
            this.stopAnalysis();
            return;
        }

        try {
            // Создаем AudioContext если его нет
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Создаем AnalyserNode
            if (!this.analyser) {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                this.analyser.smoothingTimeConstant = 0.8;
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            }

            // Подключаем микрофон к анализатору
            if (!this.microphone) {
                this.microphone = this.audioContext.createMediaStreamSource(this.videoCallManager.localStream);
                this.microphone.connect(this.analyser);
            }

            // Запускаем анализ
            if (!this.isAnalyzing) {
                this.isAnalyzing = true;
                this.analyze();
            }
        } catch (error) {
            console.error('Error starting audio analysis:', error);
        }
    }

    analyze() {
        if (!this.isAnalyzing || !this.analyser) {
            return;
        }

        // Получаем данные о частотах
        this.analyser.getByteFrequencyData(this.dataArray);

        // Вычисляем средний уровень
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        
        // Нормализуем от 0 до 100
        const level = Math.min(100, (average / 255) * 100);

        // Обновляем UI кнопки микрофона
        this.updateMicrophoneButton(level);

        // Продолжаем анализ
        this.animationFrameId = requestAnimationFrame(() => this.analyze());
    }

    updateMicrophoneButton(level) {
        const micButton = document.getElementById('toggleAudio');
        if (!micButton) return;

        const audioTracks = this.videoCallManager.localStream?.getAudioTracks();
        const isEnabled = audioTracks && audioTracks.length > 0 && audioTracks[0].enabled;

        // Удаляем все классы состояний и старые стили
        micButton.classList.remove('mic-idle', 'mic-speaking', 'mic-muted', 
            'audio-level-0', 'audio-level-1', 'audio-level-2', 'audio-level-3', 'audio-level-4');
        micButton.style.background = '';
        micButton.style.backgroundImage = '';
        micButton.style.backgroundSize = '';

        if (!isEnabled) {
            // Микрофон выключен - красный
            micButton.classList.add('mic-muted');
            micButton.style.background = `var(--error)`;
        } else if (level > 5) {
            // Говорит - зеленое закрашивание снизу-вверх
            micButton.classList.add('mic-speaking');
            const intensity = Math.min(1, level / 100); // Нормализуем до 0-1 (0-100%)
            
            // Создаем градиент снизу-вверх: зеленый только снизу, белый сверху
            const greenPercent = Math.floor(intensity * 100);
            // Используем два слоя: белый базовый фон и зеленый градиент поверх него
            // Градиент идет от 0% (снизу) до greenPercent%, остальное прозрачное
            // Важно: градиент должен начинаться снизу и идти вверх
            micButton.style.background = `
                linear-gradient(to top, 
                    rgba(16, 185, 129, 1) 0%, 
                    rgba(16, 185, 129, 1) ${greenPercent}%, 
                    transparent ${greenPercent}%, 
                    transparent 100%
                ),
                rgba(255, 255, 255, 0.8)
            `;
            micButton.style.backgroundSize = '100% 100%';
            micButton.style.backgroundRepeat = 'no-repeat';
        } else {
            // Молчит - серый
            micButton.classList.add('mic-idle');
            micButton.style.background = `rgba(255, 255, 255, 0.8)`;
        }
    }

    stopAnalysis() {
        this.isAnalyzing = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Обновляем кнопку в состояние "молчит" или "выключен"
        const micButton = document.getElementById('toggleAudio');
        if (micButton) {
            const audioTracks = this.videoCallManager.localStream?.getAudioTracks();
            const isEnabled = audioTracks && audioTracks.length > 0 && audioTracks[0].enabled;
            
            micButton.classList.remove('mic-idle', 'mic-speaking', 'mic-muted');
            if (!isEnabled) {
                micButton.classList.add('mic-muted');
                micButton.style.background = `var(--error)`;
            } else {
                micButton.classList.add('mic-idle');
                micButton.style.background = `var(--surface-light)`;
            }
        }
    }

    cleanup() {
        this.stopAnalysis();
        if (this.microphone) {
            try {
                this.microphone.disconnect();
            } catch (e) {}
            this.microphone = null;
        }
        if (this.analyser) {
            try {
                this.analyser.disconnect();
            } catch (e) {}
            this.analyser = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(e => console.error('Error closing audio context:', e));
            this.audioContext = null;
        }
    }
}

