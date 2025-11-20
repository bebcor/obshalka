// Визуализация аудио для умных кнопок микрофона

class AudioVisualizer {
    constructor(audioTrack, buttonElement) {
        this.audioTrack = audioTrack;
        this.buttonElement = buttonElement;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.animationFrameId = null;
        this.isRunning = false;
    }

    async start() {
        if (this.isRunning || !this.audioTrack || !this.buttonElement) return;

        try {
            // Создаем AudioContext
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Создаем источник из аудио трека
            this.microphone = this.audioContext.createMediaStreamSource(
                new MediaStream([this.audioTrack])
            );
            
            // Создаем анализатор
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            
            this.microphone.connect(this.analyser);
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            
            this.isRunning = true;
            this.visualize();
        } catch (error) {
            console.error('Error starting audio visualizer:', error);
        }
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
    }

    visualize() {
        if (!this.isRunning || !this.analyser || !this.buttonElement) return;

        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Вычисляем средний уровень громкости
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        const average = sum / this.dataArray.length;
        
        // Нормализуем от 0 до 100
        const normalized = Math.min(100, (average / 255) * 100);
        
        // Определяем уровень (0-4)
        let level = 0;
        if (normalized > 0) level = 1;
        if (normalized > 20) level = 2;
        if (normalized > 40) level = 3;
        if (normalized > 60) level = 4;
        
        // Обновляем класс кнопки
        this.buttonElement.classList.remove('audio-level-0', 'audio-level-1', 'audio-level-2', 'audio-level-3', 'audio-level-4');
        this.buttonElement.classList.add(`audio-level-${level}`);
        
        this.animationFrameId = requestAnimationFrame(() => this.visualize());
    }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioVisualizer;
}

