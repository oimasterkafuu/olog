'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 自动保存 Hook
 * 提供 localStorage 自动保存功能，带防抖机制
 * 
 * @param key localStorage 的键名
 * @param data 要保存的数据
 * @param debounceMs 防抖延迟时间（毫秒），默认 3000
 * @returns savedData 初始化时读取的保存数据，clearSaved 清除保存数据的函数
 */
export function useAutoSave<T>(
  key: string,
  data: T,
  debounceMs: number = 3000
): {
  savedData: T | null;
  clearSaved: () => void;
  saveStatus: 'idle' | 'saving' | 'saved';
} {
  const [savedData, setSavedData] = useState<T | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialMount = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedData = useRef<string | null>(null);

  // 初始化时从 localStorage 读取
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        setSavedData(parsed);
        lastSavedData.current = stored;
      }
    } catch (error) {
      console.error('Failed to load saved data:', error);
    }
  }, [key]);

  // 数据变化时自动保存（带防抖）
  useEffect(() => {
    // 跳过初始挂载
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // 序列化当前数据
    const currentDataStr = JSON.stringify(data);
    
    // 如果数据没有实际变化，跳过保存
    if (currentDataStr === lastSavedData.current) {
      return;
    }

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    setSaveStatus('saving');

    // 设置新的防抖定时器
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, currentDataStr);
        lastSavedData.current = currentDataStr;
        setSaveStatus('saved');
        
        // 2 秒后将状态重置为 idle
        statusTimeoutRef.current = setTimeout(() => {
          setSaveStatus('idle');
        }, 2000);
      } catch (error) {
        console.error('Failed to save data:', error);
        setSaveStatus('idle');
      }
    }, debounceMs);

    // 清理函数
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, [data, key, debounceMs]);

  // 清除保存的数据
  const clearSaved = () => {
    try {
      localStorage.removeItem(key);
      setSavedData(null);
      lastSavedData.current = null;
      setSaveStatus('idle');
      
      // 清除所有定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    } catch (error) {
      console.error('Failed to clear saved data:', error);
    }
  };

  return { savedData, clearSaved, saveStatus };
}

