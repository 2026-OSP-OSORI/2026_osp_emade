import os

import firebase_admin
from firebase_admin import credentials

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Firebase Admin 초기화 (앱 시작 시 한 번만)
def init_firebase():
    try:
        firebase_admin.get_app()   # 이미 초기화됐으면 넘어감
        return
    except ValueError:
        pass

    key_path = os.path.join(BASE_DIR, os.getenv("FIREBASE_KEY_PATH"))
    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred, {
        "databaseURL": os.getenv("FIREBASE_DATABASE_URL"),
    })