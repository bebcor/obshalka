def handle_signaling(manager, data):
    message_type = data.get('type')
    room_id = data.get('room_id')
    participant_id = data.get('participant_id')
    
    if message_type == 'offer':
        return _handle_offer(manager, room_id, participant_id, data)
    elif message_type == 'answer':
        return _handle_answer(manager, room_id, participant_id, data)
    elif message_type == 'ice-candidate':
        return _handle_ice_candidate(manager, room_id, participant_id, data)
    else:
        return {'error': 'Unknown message type'}

def _handle_offer(manager, room_id, participant_id, data):
    room = manager.get_room(room_id)
    if not room:
        return {'error': 'Room not found'}
    
    # Здесь обычно сохраняем offer для передачи другим участникам
    return {'status': 'offer received'}

def _handle_answer(manager, room_id, participant_id, data):
    # Аналогично offer
    return {'status': 'answer received'}

def _handle_ice_candidate(manager, room_id, participant_id, data):
    # Обработка ICE-кандидатов
    return {'status': 'ice candidate received'}
