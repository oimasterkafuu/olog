'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutOptions {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

/**
 * 键盘快捷键 Hook
 * 监听键盘组合键并触发回调
 * 
 * @param key 按键代码（如 'KeyS', 'Enter'）
 * @param callback 按键触发时的回调函数
 * @param options 修饰键选项（ctrl, meta, shift, alt）
 *   - 当同时指定 ctrl 和 meta 时，表示"Ctrl 或 Cmd"（跨平台支持）
 */
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: KeyboardShortcutOptions = {}
) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 检查按键是否匹配
    if (event.code !== key) {
      return;
    }

    // 特殊处理：当同时指定 ctrl 和 meta 时，表示跨平台的 "Ctrl/Cmd"
    const needsCtrlOrMeta = options.ctrl !== undefined && options.meta !== undefined;
    
    let modifierMatch = true;

    if (needsCtrlOrMeta) {
      // Ctrl 或 Meta 至少一个被按下
      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      if (!hasCtrlOrMeta) {
        return;
      }
    } else {
      // 单独检查每个修饰键
      if (options.ctrl !== undefined && event.ctrlKey !== options.ctrl) {
        modifierMatch = false;
      }
      if (options.meta !== undefined && event.metaKey !== options.meta) {
        modifierMatch = false;
      }
    }

    // 检查其他修饰键
    if (options.shift !== undefined && event.shiftKey !== options.shift) {
      modifierMatch = false;
    }
    if (options.alt !== undefined && event.altKey !== options.alt) {
      modifierMatch = false;
    }

    if (modifierMatch) {
      event.preventDefault();
      callback();
    }
  }, [key, callback, options]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}

