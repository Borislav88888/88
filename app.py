import sys
try:
    from flask import Flask, request, jsonify, render_template, send_file
    import requests
    import urllib3
    from gtts import gTTS
except ImportError as e:
    print(f"Error importing required packages: {e}")
    print("Please run: pip install flask requests urllib3 gtts python-dotenv")
    sys.exit(1)

import json
import os
import base64
import uuid
import time
import io
import socket

# Отключаем предупреждения о небезопасных запросах
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Проверяем наличие необходимых переменных окружения
if not os.path.exists('.env'):
    print("Warning: .env file not found")

# Получаем абсолютный путь к текущей директории
template_dir = 'templates'

# Проверяем наличие папки templates
if not os.path.exists(template_dir):
    os.makedirs(template_dir)
    print(f"Created directory: {template_dir}")

print("Python version:", sys.version)
print("Current file:", __file__)
print("Template directory:", template_dir)
print("Current working directory:", os.getcwd())

app = Flask(__name__)

# История диалога
chat_history = []
# История команд и групп
commands_tree = []
# История распознавания
recognition_history = []

# Конфигурация
AUTH_URL = 'https://ngw.devices.sberbank.ru:9443'
API_URL = 'https://gigachat.devices.sberbank.ru'
CLIENT_ID = os.getenv('CLIENT_ID', '13fae9d7-4cfe-4ab2-be7a-8669606e529e')
CLIENT_SECRET = os.getenv('CLIENT_SECRET', 'a7789d3f-1860-4dad-bd36-ab7916470f70')

# Глобальные переменные для управления токеном
token_data = {
    'token': None,
    'last_update': 0
}

def get_token_with_cache():
    current_time = time.time()
    # Проверяем, нужно ли обновить токен (29 минут = 1740 секунд)
    if not token_data['token'] or (current_time - token_data['last_update']) > 1740:
        token_data['token'] = get_token()
        token_data['last_update'] = current_time
    return token_data['token']

def get_token():
    # Кодируем credentials в base64
    credentials = f"{CLIENT_ID}:{CLIENT_SECRET}"
    credentials_base64 = base64.b64encode(credentials.encode()).decode()
    
    # Генерируем уникальный идентификатор запроса
    rquid = str(uuid.uuid4())
    
    headers = {
        'Authorization': f'Basic {credentials_base64}',
        'RqUID': rquid,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
    }
    
    print("\nОтправляем запрос авторизации:")
    print("URL:", f'{AUTH_URL}/api/v2/oauth')
    print("Headers:", headers)
    
    response = requests.post(
        f'{AUTH_URL}/api/v2/oauth',
        headers=headers,
        data='scope=GIGACHAT_API_PERS',
        verify=False
    )
    
    print("\nОтвет сервера авторизации:")
    print("Status:", response.status_code)
    print("Response:", response.text)
    
    if response.ok:
        return response.json()['access_token']
    else:
        response.raise_for_status()

def chat_completion(token, message):
    # Добавляем сообщение пользователя в историю
    chat_history.append({"role": "user", "content": message})
    
    payload = {
        "model": "GigaChat:latest",
        "messages": chat_history,
        "temperature": 0.7,
        "top_p": 0.7,
        "n": 1,
        "stream": False,
        "max_tokens": 512,
        "repetition_penalty": 1,
        "update_interval": 0
    }
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}'
    }
    
    response = requests.post(
        f'{API_URL}/api/v1/chat/completions',
        headers=headers,
        json=payload,
        verify=False
    )
    
    if response.ok:
        response_data = response.json()
        chat_history.append(response_data['choices'][0]['message'])
        return response_data
    else:
        response.raise_for_status()

@app.route('/')
def home():
    # Создаем папку templates, если она не существует
    if not os.path.exists(template_dir):
        os.makedirs(template_dir)
    
    template_path = os.path.join(template_dir, 'index.html')
    
    print("Template exists:", os.path.exists(template_path))
    print("Directory contents:", os.listdir(template_dir))
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        message = data.get('message', '')
        
        if not message:
            return jsonify({'error': 'Пустое сообщение'}), 400

        # Получаем токен
        token = get_token_with_cache()
        
        # Отправляем запрос в чат
        response = chat_completion(token, message)
        
        return jsonify({
            'response': response['choices'][0]['message']['content']
        })

    except Exception as e:
        error_msg = str(e)
        print(f"\nОшибка: {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/clear-history', methods=['POST'])
def clear_history():
    global chat_history
    chat_history = []
    return jsonify({'status': 'ok'})

@app.route('/api/save-commands', methods=['POST'])
def save_commands():
    global commands_tree
    data = request.get_json()
    commands_tree = data.get('commands', [])
    return jsonify({'status': 'ok'})

@app.route('/api/get-commands', methods=['GET'])
def get_commands():
    return jsonify({'commands': commands_tree})

@app.route('/api/save-recognition', methods=['POST'])
def save_recognition():
    global recognition_history
    data = request.get_json()
    recognition_history.append(data.get('text', ''))
    return jsonify({'status': 'ok'})

@app.route('/api/get-recognition-history', methods=['GET'])
def get_recognition_history():
    return jsonify({'history': recognition_history})

@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    try:
        data = request.json
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'Пустой текст для озвучивания'}), 400
        
        # Создаем объект gTTS
        tts = gTTS(text=text, lang='ru')
        
        # Сохраняем аудио в буфер
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        
        return send_file(
            fp,
            mimetype='audio/mp3',
            as_attachment=True,
            download_name='speech.mp3'
        )
    except Exception as e:
        print(f"TTS error: {str(e)}")
        return jsonify({'error': f'Ошибка синтеза речи: {str(e)}'}), 500

@app.route('/api/recognize', methods=['POST'])
def recognize():
    try:
        data = request.get_json()
        audio_data = data.get('audio', '')

        if not audio_data:
            return jsonify({'error': 'Пустые аудиоданные'}), 400

        # Здесь должна быть логика для распознавания речи из аудиоданных
        # Например, использование стороннего API для распознавания

        recognized_text = "распознанный текст"  # Замените на реальный результат

        recognition_history.append(recognized_text)
        return jsonify({'text': recognized_text})

    except Exception as e:
        error_msg = str(e)
        print(f"Ошибка распознавания: {error_msg}")
        return jsonify({'error': error_msg}), 500

@app.route('/api/clear-recognition-history', methods=['POST'])
def clear_recognition_history():
    global recognition_history
    recognition_history = []
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    def find_free_port():
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', 0))            # Привязываемся к случайному порту
            s.listen(1)
            port = s.getsockname()[1]  # Получаем номер порта
            return port

    try:
        port = 5001
        app.run(host='0.0.0.0', port=port, debug=True)
    except OSError:
        port = find_free_port()
        print(f"Port 5001 is busy, using port {port} instead")
