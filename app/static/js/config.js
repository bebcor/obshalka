// Конфигурация ICE серверов для WebRTC
const ICE_CONFIG = {
    iceServers: [
        // Ваш собственный STUN сервер
        {
            urls: 'stun:109.73.201.242:3478'
        },
        // Ваш собственный TURN сервер (UDP)
        {
            urls: 'turn:109.73.201.242:3478',
            username: 'webrtc',
            credential: 'webrtcpassword'
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

// Конфигурация для создания peer connection (используется в webrtc-manager)
const getPeerConnectionConfig = () => {
    return {
        iceServers: [
            // STUN-серверы Google
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            
            // TURN-серверы для обхода сложных NAT и фаерволов
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject', 
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            // Резервные TURN-серверы
            {
                urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
            }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
    };
};

