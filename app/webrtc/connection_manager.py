import uuid
from datetime import datetime

class ConnectionManager:
    def __init__(self):
        self.rooms = {}
        self.connections = {}

    def create_room(self):
        room_id = str(uuid.uuid4())[:8]
        self.rooms[room_id] = {
            'created_at': datetime.now(),
            'participants': []
        }
        return room_id

    def join_room(self, room_id):
        if room_id not in self.rooms:
            return {'error': 'Room not found'}
        
        participant_id = str(uuid.uuid4())
        self.rooms[room_id]['participants'].append(participant_id)
        
        return {
            'participant_id': participant_id,
            'room': self.rooms[room_id]
        }

    def get_room(self, room_id):
        return self.rooms.get(room_id)

    def cleanup_room(self, room_id):
        if room_id in self.rooms:
            del self.rooms[room_id]
