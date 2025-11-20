// Утилиты для работы с приложением

// Показ уведомлений
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-message">${escapeHtml(message)}</span>
        <button class="notification-close">&times;</button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);

    notification.querySelector('.notification-close').addEventListener('click', () => {
        if (notification.parentNode) notification.remove();
    });
}

// Экранирование HTML для защиты от XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Валидация ID комнаты
function validateRoomId(roomId) {
    if (!roomId || typeof roomId !== 'string') return false;
    return /^[A-Za-z0-9_-]{3,20}$/.test(roomId);
}

// Санитизация текста
function sanitizeText(text, maxLength = 500) {
    if (!text || typeof text !== 'string') return '';
    text = escapeHtml(text);
    text = text.substring(0, maxLength);
    return text.trim();
}

// Копирование в буфер обмена
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        console.error('Failed to copy:', e);
        return false;
    }
}

// Форматирование времени
function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

