// Модуль для уведомлений и модальных окон
class NotificationManager {
    constructor() {
        this.ensureStyles();
    }

    ensureStyles() {
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                    color: white;
                    z-index: 1000;
                    max-width: 300px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                }
                .notification-info { background: var(--primary-blue); }
                .notification-success { background: var(--success); }
                .notification-error { background: var(--error); }
                .notification-warning { background: var(--warning); }
                .notification-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .user-name-modal, .media-prompt-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 1000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(5px);
                }
                .modal-content {
                    position: relative;
                    background: var(--surface);
                    padding: 24px;
                    border-radius: 16px;
                    box-shadow: var(--shadow-lg);
                    max-width: 400px;
                    width: 90%;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .modal-content h3 {
                    margin: 0 0 8px 0;
                    color: var(--text-primary);
                    font-size: 1.25rem;
                }
                .modal-content p {
                    margin: 0 0 20px 0;
                    color: var(--text-secondary);
                    font-size: 0.875rem;
                }
                #userNameInput {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    background: var(--surface-light);
                    color: var(--text-primary);
                    font-size: 1rem;
                    margin-bottom: 20px;
                }
                #userNameInput:focus {
                    outline: none;
                    border-color: var(--primary-blue);
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
                }
                .modal-buttons {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .btn-secondary {
                    background: var(--surface-light);
                    color: var(--text-primary);
                }
                .btn-secondary:hover {
                    background: var(--surface-light);
                    opacity: 0.8;
                }
                .media-options {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin: 20px 0;
                }
                .media-options .btn {
                    justify-content: center;
                    padding: 16px;
                }
                .note {
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    text-align: center;
                    margin: 10px 0 0 0;
                }
            `;
            document.head.appendChild(styles);
        }
    }

    show(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type} fade-in`;
        
        // Безопасное создание элементов для предотвращения XSS
        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message';
        messageSpan.textContent = message; // Используем textContent вместо innerHTML
        
        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.textContent = '×';
        
        notification.appendChild(messageSpan);
        notification.appendChild(closeButton);
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
        
        notification.querySelector('.notification-close').addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    showUserNameModal(onConfirm, onCancel) {
        const modal = document.createElement('div');
        modal.className = 'user-name-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>Join Video Call</h3>
                    <p>Enter your name to join the room</p>
                    <input type="text" id="userNameInput" placeholder="Your name" maxlength="20" value="User${Math.floor(Math.random() * 1000)}">
                    <div class="modal-buttons">
                        <button id="cancelJoin" class="btn btn-secondary">Cancel</button>
                        <button id="confirmJoin" class="btn btn-primary">Join Room</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const userNameInput = document.getElementById('userNameInput');
        userNameInput.focus();
        userNameInput.select();
        
        document.getElementById('confirmJoin').addEventListener('click', () => {
            const userName = userNameInput.value.trim();
            if (!userName) {
                userNameInput.style.borderColor = 'var(--error)';
                userNameInput.focus();
                return;
            }
            document.body.removeChild(modal);
            onConfirm(userName);
        });
        
        document.getElementById('cancelJoin').addEventListener('click', () => {
            document.body.removeChild(modal);
            if (onCancel) onCancel();
        });
        
        userNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const userName = userNameInput.value.trim();
                if (!userName) {
                    userNameInput.style.borderColor = 'var(--error)';
                    userNameInput.focus();
                    return;
                }
                document.body.removeChild(modal);
                onConfirm(userName);
            }
        });
        
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                if (onCancel) onCancel();
            }
        });
    }

    showMediaPrompt(onEnableMedia, onJoinWithoutMedia) {
        const mediaPrompt = document.createElement('div');
        mediaPrompt.className = 'media-prompt-modal';
        mediaPrompt.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h3>Enable Camera & Microphone?</h3>
                    <p>You can enable your camera and microphone now or later during the call</p>
                    <div class="media-options">
                        <button id="enableMedia" class="btn btn-primary">
                            <span>🎤📹</span>
                            Enable Both
                        </button>
                        <button id="joinWithoutMedia" class="btn btn-secondary">
                            Join Without Media
                        </button>
                    </div>
                    <p class="note">You can always enable camera and microphone using the controls below</p>
                </div>
            </div>
        `;
        
        document.body.appendChild(mediaPrompt);
        
        document.getElementById('enableMedia').addEventListener('click', () => {
            document.body.removeChild(mediaPrompt);
            if (onEnableMedia) onEnableMedia();
        });
        
        document.getElementById('joinWithoutMedia').addEventListener('click', () => {
            document.body.removeChild(mediaPrompt);
            if (onJoinWithoutMedia) onJoinWithoutMedia();
        });
    }
}

