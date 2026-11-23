// 판매자 거래 시간 API — 백3 (backend/routes/schedules.py)
import { api } from "./client";

// 내 거래 시간 (월별) → { month, weekly: { "0": [{ start, end }], ... "6": [...] }, exceptions, booked, updatedAt }
//   month 를 빼면 이번 달
export const getMySchedule = (month) =>
  api.get(`/schedules/me${month ? `?month=${month}` : ""}`);

// 주간 시간이 하루라도 설정돼 있는지 (백엔드 has_schedule 과 같은 규칙)
export const hasWeeklySchedule = (schedule) =>
  Object.values(schedule?.weekly ?? {}).some((ranges) => Array.isArray(ranges) && ranges.length > 0);
