import { ref } from 'vue';

export type ToastType = 'error' | 'info' | 'success' | 'warning';

export interface AppToast {
  duration: number;
  id: number;
  message: string;
  timestamp: number;
  type: ToastType;
}

const toasts = ref<AppToast[]>([]);
let nextToastId = 0;

export function useToast() {
  function addToast(message: string, type: ToastType = 'info', duration = 5000): number {
    const id = ++nextToastId;
    toasts.value = [...toasts.value, {
      duration,
      id,
      message,
      timestamp: Date.now(),
      type
    }];
    if (duration > 0) {
      window.setTimeout(() => removeToast(id), duration);
    }
    return id;
  }

  function removeToast(id: number): void {
    toasts.value = toasts.value.filter(toast => toast.id !== id);
  }

  function clearAllToasts(): void {
    toasts.value = [];
  }

  return {
    addToast,
    clearAllToasts,
    error: (message: string, duration?: number) => addToast(message, 'error', duration),
    info: (message: string, duration?: number) => addToast(message, 'info', duration),
    removeToast,
    success: (message: string, duration?: number) => addToast(message, 'success', duration),
    toasts,
    warning: (message: string, duration?: number) => addToast(message, 'warning', duration)
  };
}
