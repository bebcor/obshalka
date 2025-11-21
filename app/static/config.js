// Конфигурация ICE серверов для WebRTC (УПРОЩЕННАЯ - только рабочие серверы)
const ICE_CONFIG = {
    iceServers: [
        // Ваш STUN сервер
        {
            urls: 'stun:109.73.201.242:3478'
        },
        // Ваш TURN сервер (UDP)
        {
            urls: 'turn:109.73.201.242:3478',
            username: 'webrtc',
            credential: 'webrtcpassword'
        },
        // Ваш TURN сервер (TCP)
        {
            urls: 'turn:109.73.201.242:3478?transport=tcp',
            username: 'webrtc',
            credential: 'webrtcpassword'
        }
    ],
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 5
};

