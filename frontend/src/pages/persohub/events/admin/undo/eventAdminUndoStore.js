const undoByEvent = new Map();
const listenersByEvent = new Map();

const notify = (eventSlug) => {
    const listeners = listenersByEvent.get(eventSlug);
    if (!listeners || listeners.size === 0) return;
    listeners.forEach((listener) => {
        try {
            listener(getUndoEntry(eventSlug));
        } catch {
            // noop
        }
    });
};

export const getUndoEntry = (eventSlug) => {
    if (!eventSlug) return null;
    if (!undoByEvent.has(eventSlug)) {
        undoByEvent.set(eventSlug, null);
    }
    return undoByEvent.get(eventSlug) || null;
};

export const setUndoEntry = (eventSlug, entry) => {
    if (!eventSlug) return;
    undoByEvent.set(eventSlug, entry || null);
    notify(eventSlug);
};

export const clearUndoEntry = (eventSlug) => {
    if (!eventSlug) return;
    undoByEvent.set(eventSlug, null);
    notify(eventSlug);
};

export const subscribeUndoEntry = (eventSlug, listener) => {
    if (!eventSlug || typeof listener !== 'function') return () => {};
    const listeners = listenersByEvent.get(eventSlug) || new Set();
    listeners.add(listener);
    listenersByEvent.set(eventSlug, listeners);

    listener(getUndoEntry(eventSlug));

    return () => {
        const bucket = listenersByEvent.get(eventSlug);
        if (!bucket) return;
        bucket.delete(listener);
        if (bucket.size === 0) {
            listenersByEvent.delete(eventSlug);
        }
    };
};
