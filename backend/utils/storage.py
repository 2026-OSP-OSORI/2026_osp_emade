import logging
import os
from urllib.parse import quote, unquote, urlsplit
from uuid import uuid4

from firebase_admin import storage
from google.api_core.exceptions import GoogleAPIError, NotFound

from utils.exceptions import AppError

MAX_IMAGE_BYTES = 10 * 1024 * 1024
_DOWNLOAD_HOST = "firebasestorage.googleapis.com"
_logger = logging.getLogger(__name__)


def _bucket():
    return storage.bucket(os.getenv("FIREBASE_STORAGE_BUCKET") or None)


def _image_format(file):
    if file is None or not file.filename:
        raise AppError(400, "INVALID_IMAGE_FILE", "*올바른 이미지 파일을 등록해주세요.")

    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > MAX_IMAGE_BYTES:
        raise AppError(400, "INVALID_IMAGE_FILE", "*이미지는 파일당 10MB까지 등록할 수 있어요.")

    header = file.stream.read(16)
    file.stream.seek(0)
    if len(header) >= 16:
        if header.startswith(b"\xff\xd8\xff"):
            return "jpg", "image/jpeg"
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "png", "image/png"
        if header.startswith((b"GIF87a", b"GIF89a")):
            return "gif", "image/gif"
        if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
            return "webp", "image/webp"
    raise AppError(400, "INVALID_IMAGE_FILE", "*JPEG, PNG, GIF, WebP 이미지를 등록해주세요.")


def upload_image(file, folder):
    """Flask FileStorage 한 장을 업로드하고 브라우저에서 열 수 있는 URL을 반환한다.

    folder는 호출자가 정한 저장 경로다. 예: profiles/{uid}, reviews/{uid}.
    반환된 URL을 가진 사람은 해당 이미지에 접근할 수 있다.
    """
    extension, content_type = _image_format(file)
    object_name = f"{folder.strip('/')}/{uuid4().hex}.{extension}"
    token = str(uuid4())
    try:
        bucket = _bucket()
        blob = bucket.blob(object_name)
        blob.metadata = {"firebaseStorageDownloadTokens": token}
        blob.upload_from_file(file.stream, content_type=content_type, if_generation_match=0)
    except (GoogleAPIError, OSError, ValueError) as exc:
        _logger.exception("Firebase Storage image upload failed")
        raise AppError(500, "IMAGE_UPLOAD_FAILED", "*이미지를 저장할 수 없어요. 다시 시도해주세요.") from exc

    return f"https://{_DOWNLOAD_HOST}/v0/b/{bucket.name}/o/{quote(object_name, safe='')}?alt=media&token={token}"


def discard_new_upload(url):
    """후속 검증에 실패했을 때, 같은 요청에서 방금 올린 파일만 정리한다."""
    try:
        bucket = _bucket()
        parts = urlsplit(url)
        prefix = f"/v0/b/{bucket.name}/o/"
        if parts.scheme == "https" and parts.netloc == _DOWNLOAD_HOST and parts.path.startswith(prefix):
            bucket.blob(unquote(parts.path[len(prefix):])).delete()
    except NotFound:
        pass
    except (GoogleAPIError, OSError, ValueError):
        _logger.exception("Could not discard an uncommitted image upload")
