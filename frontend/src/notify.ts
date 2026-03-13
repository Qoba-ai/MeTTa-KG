import toast from 'solid-toast';

const toastMap = new Map<string, { id: string; count: number; timer: any }>();

const dedupeToast = (message: string, type: 'success' | 'error' | 'loading' = 'success') => {
    const existing = toastMap.get(message);

    if (existing) {
        clearTimeout(existing.timer);
        existing.count++;
        const newMsg = `${message} (${existing.count})`;
        toast[type](newMsg, { id: existing.id });
        existing.timer = setTimeout(() => toastMap.delete(message), 5000);
    } else {
        const id = toast[type](message);
        const timer = setTimeout(() => toastMap.delete(message), 5000);
        toastMap.set(message, { id, count: 1, timer });
    }
};

export const notify = {
    success: (msg: string) => dedupeToast(msg, 'success'),
    error: (msg: string) => dedupeToast(msg, 'error'),
    loading: (msg: string) => dedupeToast(msg, 'loading'),
    // Support custom content like the token copy button
    custom: (content: any, options?: any) => toast.success(content, options)
};
