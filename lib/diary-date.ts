/**
 * 日记日期工具函数
 * 实现 30 小时计时制：6 点前的时间算作前一天
 */

/**
 * 将日期转换为日记日期（基于 30 小时制）
 * 6:00 AM 之前算前一天，6:00 AM 及之后算当天
 * @param date 日期对象，默认为当前时间
 * @returns 日记日期字符串，格式 YYYY-MM-DD
 */
export function getDiaryDate(date: Date = new Date()): string {
  const adjustedDate = new Date(date);
  
  // 如果当前时间小于 6:00 AM，则算作前一天
  if (adjustedDate.getHours() < 6) {
    adjustedDate.setDate(adjustedDate.getDate() - 1);
  }
  
  const year = adjustedDate.getFullYear();
  const month = String(adjustedDate.getMonth() + 1).padStart(2, '0');
  const day = String(adjustedDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 获取指定日期的周标识（YYYY-WW 格式）
 * 使用 ISO 8601 周编号：周一为一周的第一天
 * @param diaryDate 日记日期字符串，格式 YYYY-MM-DD
 * @returns 周标识字符串，格式 YYYY-WW
 */
export function getWeekIdentifier(diaryDate: string): string {
  const date = new Date(diaryDate + 'T12:00:00'); // 使用中午避免时区问题
  
  // 使用 ISO 8601 周编号算法
  const dayOfWeek = date.getDay() || 7; // 将周日从 0 改为 7
  const nearestThursday = new Date(date);
  nearestThursday.setDate(date.getDate() + 4 - dayOfWeek);
  
  const yearStart = new Date(nearestThursday.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((nearestThursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  
  return `${nearestThursday.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * 获取指定周的日期范围
 * @param weekIdentifier 周标识字符串，格式 YYYY-WW
 * @returns 周的起止日期，格式 { start: YYYY-MM-DD, end: YYYY-MM-DD }
 */
export function getWeekRange(weekIdentifier: string): { start: string; end: string } {
  const match = weekIdentifier.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week identifier format: ${weekIdentifier}`);
  }
  
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  
  // ISO 8601: 第一周是包含该年第一个周四的那一周
  const jan4 = new Date(year, 0, 4);
  const jan4DayOfWeek = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - jan4DayOfWeek + 1);
  
  // 计算目标周的周一
  const targetMonday = new Date(firstMonday);
  targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
  
  // 计算周日
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);
  
  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  
  return {
    start: formatDate(targetMonday),
    end: formatDate(targetSunday),
  };
}

/**
 * 获取当前周的周标识
 * @returns 当前周的周标识，格式 YYYY-WW
 */
export function getCurrentWeekIdentifier(): string {
  return getWeekIdentifier(getDiaryDate());
}

/**
 * 获取上周的周标识
 * @returns 上周的周标识，格式 YYYY-WW
 */
export function getLastWeekIdentifier(): string {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);
  return getWeekIdentifier(getDiaryDate(lastWeek));
}

/**
 * 格式化日记日期为可读格式
 * @param diaryDate 日记日期字符串，格式 YYYY-MM-DD
 * @returns 格式化后的日期字符串，如 "2024年11月7日"
 */
export function formatDiaryDate(diaryDate: string): string {
  const date = new Date(diaryDate + 'T12:00:00');
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

/**
 * 格式化周标识为可读格式
 * @param weekIdentifier 周标识字符串，格式 YYYY-WW
 * @returns 格式化后的周标识，如 "2024年第45周"
 */
export function formatWeekIdentifier(weekIdentifier: string): string {
  const match = weekIdentifier.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    return weekIdentifier;
  }
  const year = match[1];
  const week = parseInt(match[2], 10);
  return `${year}年第${week}周`;
}

