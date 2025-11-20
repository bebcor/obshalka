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

        // Удаляем все классы состояний
        micButton.classList.remove('mic-idle', 'mic-speaking', 'mic-muted');

        if (!isEnabled) {
            // Микрофон выключен - красный
            micButton.classList.add('mic-muted');
            micButton.style.background = `var(--error)`;
        } else if (level > 5) {
            // Говорит - зеленый с интенсивностью
            micButton.classList.add('mic-speaking');
            const intensity = Math.min(1, level / 50); // Нормализуем до 0-1
            const greenIntensity = Math.floor(16 + (185 - 16) * intensity); // От #10 до #b9
            micButton.style.background = `rgb(16, ${greenIntensity}, 129)`;
        } else {
            // Молчит - серый
            micButton.classList.add('mic-idle');
            micButton.style.background = `var(--surface-light)`;
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

