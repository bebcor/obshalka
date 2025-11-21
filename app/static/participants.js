// Модуль для работы с участниками

class ParticipantsManager {
    constructor(socket, roomId) {
        this.socket = socket;
        this.roomId = roomId;
        this.participants = [];
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('participants_list', (data) => {
            this.participants = data.participants || [];
            this.renderParticipants();
        });

        this.socket.on('user_joined', (data) => {
            this.loadParticipants();
        });

        this.socket.on('user_left', (data) => {
            this.loadParticipants();
        });
    }

    loadParticipants() {
        if (!this.socket || !this.roomId) return;

        this.socket.emit('get_participants', {
            room_id: this.roomId
        });
    }

    renderParticipants() {
        const participantsList = document.getElementById('participantsList');
        if (!participantsList) return;

        if (this.participants.length === 0) {
            participantsList.innerHTML = '<p class="loading-text">Нет участников</p>';
            return;
        }

        participantsList.innerHTML = this.participants.map(participant => {
            const joinTime = formatTime(participant.joined_at);
            return `
                <div class="participant-item">
                    <div class="participant-item-icon"><img src="/static/images/user.png" alt="Пользователь" style="width: 24px; height: 24px;"></div>
                    <div class="participant-item-info">
                        <div class="participant-item-name">${escapeHtml(participant.name || 'Anonymous')}</div>
                        <div class="participant-item-time">Присоединился: ${joinTime}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    showModal() {
        const modal = document.getElementById('participantsModal');
        if (modal) {
            modal.style.display = 'flex';
            this.loadParticipants();
        }
    }

    hideModal() {
        const modal = document.getElementById('participantsModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    setupUI() {
        const showParticipantsBtn = document.getElementById('showParticipants');
        const closeParticipantsBtn = document.getElementById('closeParticipantsModal');

        if (showParticipantsBtn) {
            showParticipantsBtn.addEventListener('click', () => this.showModal());
        }

        if (closeParticipantsBtn) {
            closeParticipantsBtn.addEventListener('click', () => this.hideModal());
        }

        // Закрытие по клику вне модального окна
        const modal = document.getElementById('participantsModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal();
                }
            });
        }
    }
}

