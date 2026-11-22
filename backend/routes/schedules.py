from flask import Blueprint, jsonify, request

from services import schedule_service
from utils.auth import get_current_uid, login_required

schedules_bp = Blueprint("schedules", __name__)  # /schedules/me 와 /products/{pid}/... 가 섞여 있어서 prefix 없음


# 내 거래 시간 조회 API (월별)
@schedules_bp.route("/schedules/me", methods=["GET"])
@login_required
def my_schedule():
    data = schedule_service.get_my_schedule(get_current_uid(), request.args.get("month"))
    return jsonify(success=True, data=data)


# 주간 시간 저장 API (7개 요일 통째로 교체)
@schedules_bp.route("/schedules/me/weekly", methods=["PUT"])
@login_required
def save_weekly():
    body = request.get_json(silent=True) or {}
    data = schedule_service.save_weekly(get_current_uid(), body.get("weekly"))
    return jsonify(success=True, data=data)


# 특정 날 시간 막기·풀기 API (그 날 막은 시간을 통째로 교체)
@schedules_bp.route("/schedules/me/exceptions/<date>", methods=["PUT"])
@login_required
def save_exception(date):
    body = request.get_json(silent=True) or {}
    data = schedule_service.save_exception(get_current_uid(), date, body.get("blocked"))
    return jsonify(success=True, data=data)


# 예약 가능 시간 조회 API
@schedules_bp.route("/products/<pid>/available-blocks", methods=["GET"])
def available_blocks(pid):
    data = schedule_service.get_available_blocks(pid, request.args.get("date"))
    return jsonify(success=True, data=data)


# 예약 가능 날짜 조회 API
@schedules_bp.route("/products/<pid>/available-dates", methods=["GET"])
def available_dates(pid):
    data = schedule_service.get_available_dates(pid, request.args.get("month"))
    return jsonify(success=True, data=data)
