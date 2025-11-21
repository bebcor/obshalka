// Модуль для управления списком пользователей
class UsersManager {
    constructor(videoCallManager) {
        this.videoCallManager = videoCallManager;
        this.participants = new Map(); // userId -> {name, socket_id, joined_at}
    }

    updateParticipants(participantsList) {
        this.participants.clear();
        participantsList.forEach(participant => {
            this.participants.set(participant.socket_id, {
                name: participant.name,
                socket_id: participant.socket_id,
                joined_at: participant.joined_at
            });
        });
    }

    addParticipant(userId, userName) {
        this.participants.set(userId, {
            name: userName,
            socket_id: userId,
            joined_at: new Date().toISOString()
        });
        this.updateUsersModal();
    }

    removeParticipant(userId) {
        this.participants.delete(userId);
        this.updateUsersModal();
    }

    showUsersModal() {
        const modal = document.createElement('div');
        modal.className = 'users-modal';
        modal.id = 'usersModal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content users-modal-content">
                    <div class="modal-header">
                        <h3>Участники встречи</h3>
                        <button class="modal-close" id="closeUsersModal">&times;</button>
                    </div>
                    <div class="users-list" id="usersList">
                        ${this.renderUsersList()}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('closeUsersModal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
            if (e.target === modal.querySelector('.modal-overlay')) {
                document.body.removeChild(modal);
            }
        });
    }

    renderUsersList() {
        if (this.participants.size === 0) {
            return '<p class="no-users">Нет участников</p>';
        }

        let html = '';
        this.participants.forEach((participant, userId) => {
            const isCurrentUser = userId === this.videoCallManager.socketId;
            html += `
                <div class="user-item ${isCurrentUser ? 'current-user' : ''}">
                    <div class="user-avatar">${participant.name.charAt(0).toUpperCase()}</div>
                    <div class="user-info">
                        <div class="user-name">${this.escapeHtml(participant.name)}${isCurrentUser ? ' (Вы)' : ''}</div>
                        <div class="user-status">В сети</div>
                    </div>
                </div>
            `;
        });
        return html;
    }

    updateUsersModal() {
        const modal = document.getElementById('usersModal');
        if (modal) {
            const usersList = modal.querySelector('#usersList');
            if (usersList) {
                usersList.innerHTML = this.renderUsersList();
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

