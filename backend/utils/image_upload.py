"""상품, 프로필, 리뷰에서 사용하는 공용 로컬 이미지 저장 함수."""

import logging
import os
import re
from pathlib import Path
from uuid import uuid4

from flask import url_for
from werkzeug.utils import secure_filename

from utils.exceptions import AppError

MAX_IMAGE_BYTES = 10 * 1024 * 1024
IMAGE_ROOT = Path(__file__).resolve().parents[1] / "images"
_FOLDER = re.compile(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*")
_IMAGE_NAME = re.compile(r"[0-9a-f]{32}\.(?:jpg|png|gif|webp)")
_logger = logging.getLogger(__name__)


def resolve_uploaded_image(filename):
    """서버가 만드는 이름의 이미지 경로만 저장 폴더 안에서 찾는다."""
    folder, _, name = filename.rpartition("/")
    if not _FOLDER.fullmatch(folder) or not _IMAGE_NAME.fullmatch(name):
        return None
    try:
        root = IMAGE_ROOT.resolve()
        path = (root / filename).resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    return path if path.is_relative_to(root) else None


def _image_extension(file):
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
            return "jpg"
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "png"
        if header.startswith((b"GIF87a", b"GIF89a")):
            return "gif"
        if header[:4] == b"RIFF" and header[8:12] == b"WEBP":
            return "webp"
    raise AppError(400, "INVALID_IMAGE_FILE", "*JPEG, PNG, GIF, WebP 이미지를 등록해주세요.")


def upload_image(file, folder):
    """Flask FileStorage 한 장을 로컬에 저장하고 Flask의 이미지 URL을 반환한다.

    folder는 호출자가 정한 저장 경로다. 예: profiles/{uid}, reviews/{uid}.
    호출하는 Flask 요청과 이미지 조회는 같은 서버를 사용한다.
    """
    extension = _image_extension(file)
    folder = folder.strip("/")
    if not _FOLDER.fullmatch(folder):
        raise AppError(500, "IMAGE_UPLOAD_FAILED", "*이미지 저장 경로를 사용할 수 없어요.")
    safe_folder = "/".join(secure_filename(part) for part in folder.split("/"))
    filename = f"{safe_folder}/{uuid4().hex}.{extension}"
    path = resolve_uploaded_image(filename)
    if path is None:
        raise AppError(500, "IMAGE_UPLOAD_FAILED", "*이미지 저장 경로를 사용할 수 없어요.")

    url = url_for("uploaded_image", filename=filename, _external=True)
    created = False
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as target:
            created = True
            file.save(target)
    except OSError as exc:
        _logger.exception("Local image upload failed")
        if created:
            _discard_file(path)
        raise AppError(500, "IMAGE_UPLOAD_FAILED", "*이미지를 저장할 수 없어요. 다시 시도해주세요.") from exc
    return url


def discard_new_upload(url):
    """후속 검증에 실패했을 때, 같은 요청에서 방금 올린 파일만 정리한다."""
    prefix = url_for("uploaded_image", filename="", _external=True)
    if url.startswith(prefix):
        path = resolve_uploaded_image(url[len(prefix):])
        if path is not None:
            _discard_file(path)


def _discard_file(path):
    try:
        path.unlink(missing_ok=True)
    except OSError:
        _logger.exception("Could not discard an uncommitted image upload")
