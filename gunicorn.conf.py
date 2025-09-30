bind = 'unix:/home/user1/obshalka/myapp.sock'

# ЖЕСТКО ФИКСИРУЕМ 1 ВОРКЕР
workers = 1
worker_class = 'gevent'
worker_connections = 10000

# ВЫКЛЮЧАЕМ ВСЕ ЛИШНЕЕ
preload_app = True
max_requests = 0
max_requests_jitter = 0

# ТАЙМАУТЫ
timeout = 300
keepalive = 5
graceful_timeout = 30

# ЛОГИРОВАНИЕ
accesslog = '-'
errorlog = '-'
loglevel = 'info'

# ВЫКЛЮЧАЕМ АВТОПЕРЕЗАПУСК
reload = False
