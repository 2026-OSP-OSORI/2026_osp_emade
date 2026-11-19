import threading

from firebase_admin import db

from utils.exceptions import AppError

# 팔로우 확인 + 저장 + 숫자 변경을 한 번에 묶기 위한 Lock
follow_lock = threading.Lock()


# 존재하는 유저인지 확인
def _check_user_exists(uid):
    if db.reference(f"users/{uid}").get() is None:
        raise AppError(404, "USER_NOT_FOUND", "*존재하지 않는 사용자입니다.")


# 내가 그 판매자를 팔로우 중인지 확인
def is_following(my_uid, target_uid):
    if my_uid is None: # 비로그인 상태일 때
        return False
    return db.reference(f"following/{my_uid}/{target_uid}").get() is not None


# 팔로우
def follow(my_uid, target_uid):
    if my_uid == target_uid:
        raise AppError(403, "FORBIDDEN", "*자기 자신은 팔로우할 수 없어요.")
    
    _check_user_exists(target_uid)

    # Lock은 두 사람이 동시에 같은 사람을 팔로우할 때 숫자가 한 번만 오르는 걸 막음 (언팔로우도 동일)
    with follow_lock:
        if is_following(my_uid, target_uid):
            return   # 이미 팔로우 중이면 그냥 성공

        my_count = db.reference(f"users/{my_uid}/followingCount").get() or 0
        target_count = db.reference(f"users/{target_uid}/followerCount").get() or 0

        db.reference().update({
            f"following/{my_uid}/{target_uid}": True,
            f"followers/{target_uid}/{my_uid}": True,
            f"users/{my_uid}/followingCount": my_count + 1,
            f"users/{target_uid}/followerCount": target_count + 1,
        })


# 언팔로우
def unfollow(my_uid, target_uid):
    _check_user_exists(target_uid)

    with follow_lock:
        if not is_following(my_uid, target_uid):
            return   # 팔로우 안 한 상태면 그냥 성공

        my_count = db.reference(f"users/{my_uid}/followingCount").get() or 0
        target_count = db.reference(f"users/{target_uid}/followerCount").get() or 0

        db.reference().update({
            f"following/{my_uid}/{target_uid}": None, # None을 넣으면 삭제
            f"followers/{target_uid}/{my_uid}": None,
            f"users/{my_uid}/followingCount": max(my_count - 1, 0),
            f"users/{target_uid}/followerCount": max(target_count - 1, 0),
        })