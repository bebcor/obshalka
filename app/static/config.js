// Конфигурация ICE серверов для WebRTC (ТОЧНАЯ КОПИЯ ОРИГИНАЛА)
const ICE_CONFIG = {
    iceServers: [
        // Ваш собственный STUN сервер
        {
            urls: 'stun:109.73.201.242:3478'
        },
        // Ваш собственный TURN сервер (UDP)
        {
            urls: 'turn:109.73.201.242:3478',
            username: 'webrtc',  // Замените на реальный username
            credential: 'webrtcpassword' // Замените на реальный password
        },
        // Ваш собственный TURN сервер (TCP)
        {
            urls: 'turn:109.73.201.242:3478?transport=tcp',
            username: 'webrtc',
            credential: 'webrtcpassword'
        },
        // Ваш собственный TURN сервер (TLS)
        {
            urls: 'turns:109.73.201.242:5349',
            username: 'webrtc',
            credential: 'webrtcpassword'
        },
        // Резервные публичные серверы (на случай проблем с вашим)
        {
            urls: 'stun:stun.l.google.com:19302'
        },
        {
            urls: 'stun:global.stun.twilio.com:3478'
        }
    ],
    iceTransportPolicy: 'all',
    iceCandidatePoolSize: 10
};

