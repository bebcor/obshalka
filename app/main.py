import os
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
from datetime import datetime
import logging
import redis
import json
import sys
import re
import html
from gevent import monkey
monkey.patch_all()

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/home/user1/obshalka/app.log'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'video-meet-secret-key'

redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379/0')

socketio = SocketIO(
    app,
    cors_allowed_origins=[
        "https://obshalka.online",
        "http://obshalka.online", 
        "https://109.73.201.242",
        "http://109.73.201.242"
    ],
    logger=True,
    engineio_logger=True,
    message_queue=redis_url,
    async_mode='gevent',
    manage_session=False,
    ping_timeout=60,
    ping_interval=25,
)

# Инициализация Redis клиента
redis_client = redis.Redis.from_url(redis_url, decode_responses=True)


def get_redis_client():
    return redis_client


logger.info("Redis client initialized successfully")

# Функции валидации и санитизации
def validate_room_id(room_id):
    """Валидация room_id: только буквы, цифры, дефисы и подчеркивания, длина 3-50"""
    if not room_id or not isinstance(room_id, str):
        return False
    # Разрешаем только буквы, цифры, дефисы и подчеркивания
    pattern = re.compile(r'^[A-Za-z0-9_-]{3,50}$')
    return bool(pattern.match(room_id))

def sanitize_user_name(user_name):
    """Санитизация имени пользователя: удаление HTML тегов и экранирование"""
    if not user_name or not isinstance(user_name, str):
        return 'Anonymous'
    # Удаляем HTML теги и экранируем специальные символы
    sanitized = html.escape(user_name.strip())
    # Ограничиваем длину
    if len(sanitized) > 50:
        sanitized = sanitized[:50]
    return sanitized if sanitized else 'Anonymous'

# Кастомный JSON-энкодер для обработки datetime


class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


app.json_encoder = DateTimeEncoder


@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/r/<room_id>')
def room_page(room_id):
    """Страница комнаты с валидацией room_id"""
    if not validate_room_id(room_id):
        return render_template('404.html'), 404
    return render_template('index.html', room_id=room_id)


@app.errorhandler(404)
def not_found(error):
    """Обработчик 404 ошибки"""
    return render_template('404.html'), 404


@app.route('/api/create_room', methods=['POST'])
def create_room():
    try:
        room_id = str(uuid.uuid4())[:8]
        room_data = {
            'created_at': datetime.now().isoformat(),
            'participants': {},
            'active': True
        }

        # Сохраняем комнату в Redis
        redis_cli = get_redis_client()
        redis_cli.set(f"room:{room_id}", json.dumps(room_data))
        redis_cli.expire(f"room:{room_id}", 3600)
        logger.info(f"Room created: {room_id}")
        return jsonify({'room_id': room_id, 'status': 'success'})
    except Exception as e:
        logger.error(f"Error creating room: {e}")
        return jsonify({'error': 'Failed to create room'}), 500


@app.route('/api/check_room/<room_id>', methods=['GET'])
def check_room(room_id):
    try:
        # Валидация room_id
        if not validate_room_id(room_id):
            return jsonify({'error': 'Invalid room ID format'}), 400
        
        # ЗАГРУЖАЕМ КОМНАТУ ИЗ REDIS
        redis_cli = get_redis_client()
        room_data = redis_cli.get(f"room:{room_id}")
        if room_data:
            room = json.loads(room_data)
            if room.get('active', False):
                participants_count = len(room.get('participants', {}))
                return jsonify({'exists': True,
                                'participants_count': participants_count})

        return jsonify({'exists': False}), 404
    except Exception as e:
        logger.error(f"Error checking room: {e}")
        return jsonify({'error': 'Failed to check room'}), 500


@socketio.on('connect')
def handle_connect():
    logger.info(f'Client connected: {request.sid}')
    emit('connection_established',
         {'message': 'Connected successfully',
          'socket_id': request.sid})


@socketio.on('disconnect')
def handle_disconnect():
    logger.info(f'Client disconnected: {request.sid}')
    # Удаляем пользователя из всех комнат при отключении
    try:
        # Ищем комнаты, где есть этот пользователь
        redis_cli = get_redis_client()
        for key in redis_cli.keys("room:*"):
            room_data = redis_client.get(key)

            if room_data:
                room = json.loads(room_data)
                if request.sid in room.get('participants', {}):
                    room_id = key.split(":")[1]
                    handle_leave_room({'room_id': room_id})
    except Exception as e:
        logger.error(f"Error in disconnect cleanup: {e}")


@socketio.on('join_room')
def handle_join_room(data):
    try:
        room_id = data.get('room_id')
        user_name = data.get('user_name', 'Anonymous')

        # Валидация room_id
        if not room_id or not validate_room_id(room_id):
            emit('error', {'message': 'Invalid room ID'}, room=request.sid)
            return

        # Санитизация user_name
        user_name = sanitize_user_name(user_name)

        # ЗАГРУЖАЕМ КОМНАТУ ИЗ REDIS
        redis_cli = get_redis_client()
        room_data = redis_cli.get(f"room:{room_id}")
        if not room_data:
            emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = json.loads(room_data)

        if not room.get('active', False):
            emit('error', {'message': 'Room is inactive'}, room=request.sid)
            return

        # Добавляем участника в комнату
        join_room(room_id)

        # ОБНОВЛЯЕМ ДАННЫЕ В REDIS
        if 'participants' not in room:
            room['participants'] = {}

        room['participants'][request.sid] = {
            'name': user_name,
            'joined_at': datetime.now().isoformat()
        }

        # СОХРАНЯЕМ ОБНОВЛЕННУЮ КОМНАТУ В REDIS
        redis_cli.set(f"room:{room_id}", json.dumps(room))

        logger.info(f"User {request.sid} joined room {room_id}")

        # Уведомляем всех в комнате о новом участнике
        emit('user_joined', {
            'user_id': request.sid,
            'user_name': user_name,
            'participants_count': len(room['participants'])
        }, room=room_id)

        # Отправляем текущему пользователю список участников
        participants_list = []
        for sid, participant in room['participants'].items():
            participants_list.append({
                'socket_id': sid,
                'name': participant['name'],
                'joined_at': participant['joined_at']
            })

        emit('room_info', {
            'room_id': room_id,
            'participants': participants_list,
            'your_id': request.sid
        }, room=request.sid)

    except Exception as e:
        logger.error(f"Error joining room: {e}")
        emit('error', {'message': 'Failed to join room'}, room=request.sid)


@socketio.on('leave_room')
def handle_leave_room(data):
    try:
        room_id = data.get('room_id')

        # Валидация room_id
        if not room_id or not validate_room_id(room_id):
            return

        # ЗАГРУЖАЕМ КОМНАТУ ИЗ REDIS
        redis_cli = get_redis_client()
        room_data = redis_cli.get(f"room:{room_id}")
        if not room_data:
            return

        room = json.loads(room_data)

        if request.sid in room.get('participants', {}):
            user_name = room['participants'][request.sid]['name']
            del room['participants'][request.sid]
            leave_room(room_id)

            logger.info(f"User {request.sid} left room {room_id}")

            # Уведомляем остальных участников
            emit('user_left', {
                'user_id': request.sid,
                'user_name': user_name,
                'participants_count': len(room['participants'])
            }, room=room_id)

            # Если комната пуста, помечаем ее как неактивную
            if not room['participants']:
                room['active'] = False
                logger.info(f"Room {room_id} is now inactive")

            # СОХРАНЯЕМ ОБНОВЛЕННУЮ КОМНАТУ В REDIS
            redis_cli.set(f"room:{room_id}", json.dumps(room))
    except Exception as e:
        logger.error(f"Error leaving room: {e}")


@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    try:
        target_user_id = data.get('target_user_id')
        offer = data.get('offer')

        # Валидация: target_user_id должен быть строкой, offer должен быть объектом
        if not target_user_id or not isinstance(target_user_id, str) or not offer:
            socketio.emit('error',
                          {'message': 'Target user ID and offer are required'},
                          room=request.sid)
            return
        
        # Базовая валидация offer (должен быть объект с полями type и sdp)
        if not isinstance(offer, dict) or 'type' not in offer or 'sdp' not in offer:
            socketio.emit('error',
                          {'message': 'Invalid offer format'},
                          room=request.sid)
            return

        logger.info(
            f"Forwarding WebRTC offer from {
                request.sid} to {target_user_id}")

        # Пересылаем offer целевому пользователю
        socketio.emit('webrtc_offer', {
            'offer': offer,
            'sender_id': request.sid
        }, room=target_user_id)

    except Exception as e:
        logger.error(f"Error handling WebRTC offer: {e}")
        socketio.emit('error',
                      {'message': 'Failed to process WebRTC offer'},
                      room=request.sid)


@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    try:
        target_user_id = data.get('target_user_id')
        answer = data.get('answer')

        # Валидация: target_user_id должен быть строкой, answer должен быть объектом
        if not target_user_id or not isinstance(target_user_id, str) or not answer:
            socketio.emit('error',
                          {'message': 'Target user ID and answer are required'},
                          room=request.sid)
            return
        
        # Базовая валидация answer (должен быть объект с полями type и sdp)
        if not isinstance(answer, dict) or 'type' not in answer or 'sdp' not in answer:
            socketio.emit('error',
                          {'message': 'Invalid answer format'},
                          room=request.sid)
            return

        logger.info(
            f"Forwarding WebRTC answer from {
                request.sid} to {target_user_id}")

        # Пересылаем answer целевому пользователю
        socketio.emit('webrtc_answer', {
            'answer': answer,
            'sender_id': request.sid
        }, room=target_user_id)

    except Exception as e:
        logger.error(f"Error handling WebRTC answer: {e}")
        socketio.emit('error',
                      {'message': 'Failed to process WebRTC answer'},
                      room=request.sid)


@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    try:
        target_user_id = data.get('target_user_id')
        candidate = data.get('candidate')

        # Валидация: target_user_id должен быть строкой, candidate должен быть объектом
        if not target_user_id or not isinstance(target_user_id, str) or not candidate:
            socketio.emit(
                'error', {
                    'message': 'Target user ID and candidate are required'}, room=request.sid)
            return
        
        # Базовая валидация candidate (должен быть объект с полем candidate)
        if not isinstance(candidate, dict) or 'candidate' not in candidate:
            socketio.emit('error',
                          {'message': 'Invalid candidate format'},
                          room=request.sid)
            return

        logger.info(
            f"Forwarding ICE candidate from {
                request.sid} to {target_user_id}")

        # Пересылаем ICE кандидат целевому пользователю
        socketio.emit('ice_candidate', {
            'candidate': candidate,
            'sender_id': request.sid
        }, room=target_user_id)

    except Exception as e:
        logger.error(f"Error handling ICE candidate: {e}")
        socketio.emit('error',
                      {'message': 'Failed to process ICE candidate'},
                      room=request.sid)


@socketio.on('chat_message')
def handle_chat_message(data):
    try:
        room_id = data.get('room_id')
        message = data.get('message')
        user_name = data.get('user_name', 'Anonymous')

        # Валидация room_id
        if not room_id or not validate_room_id(room_id):
            emit('error', {'message': 'Invalid room ID'}, room=request.sid)
            return

        # Санитизация сообщения
        if not message or not isinstance(message, str):
            emit('error', {'message': 'Message is required'}, room=request.sid)
            return

        # Ограничиваем длину сообщения
        message = message.strip()[:500]
        if not message:
            emit('error', {'message': 'Message cannot be empty'}, room=request.sid)
            return

        # Санитизация имени пользователя
        user_name = sanitize_user_name(user_name)

        # Проверяем, что пользователь в комнате
        redis_cli = get_redis_client()
        room_data = redis_cli.get(f"room:{room_id}")
        if not room_data:
            emit('error', {'message': 'Room not found'}, room=request.sid)
            return

        room = json.loads(room_data)
        if request.sid not in room.get('participants', {}):
            emit('error', {'message': 'You are not in this room'}, room=request.sid)
            return

        # Отправляем сообщение всем в комнате
        socketio.emit('chat_message', {
            'user_id': request.sid,
            'user_name': user_name,
            'message': message,
            'timestamp': datetime.now().isoformat()
        }, room=room_id)

        logger.info(f"Chat message from {request.sid} in room {room_id}")

    except Exception as e:
        logger.error(f"Error handling chat message: {e}")
        socketio.emit('error',
                      {'message': 'Failed to send message'},
                      room=request.sid)


if __name__ == '__main__':
    logger.info("Starting VideoMeet server...")
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=True,
        ssl_context='adhoc')
