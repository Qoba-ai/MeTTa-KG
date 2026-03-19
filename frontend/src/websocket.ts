import { BACKEND_URL } from './urls'

export type SpaceEvent =
    | { type: 'locked'; path: string }
    | { type: 'unlocked'; path: string }

export type StatusEvent = {
    status: 'pathClear' | 'pathReadOnly' | 'pathReadOnlyTemporary' |
            'pathForbidden' | 'pathForbiddenTemporary' |
            'countResult' | 'fetchError' | 'parseError' | 'execError'
    [key: string]: unknown
}

type PingMessage = { type: 'ping' }
type WsMessage = SpaceEvent | PingMessage

type OnlineListener = (online: boolean) => void
type SpaceEventListener = (event: SpaceEvent) => void

const WS_BASE = BACKEND_URL.replace(/^https?/, (m: string) => (m === 'https' ? 'wss' : 'ws'))

class WebSocketService {
    private pingSocket: WebSocket | null = null
    private eventsSocket: WebSocket | null = null
    private isOnline = false
    private onlineListeners: OnlineListener[] = []
    private spaceListeners: SpaceEventListener[] = []
    private pingRetryTimer: ReturnType<typeof setTimeout> | null = null
    private eventsRetryTimer: ReturnType<typeof setTimeout> | null = null
    private eventsTokenCode: string | null = null

    // ── Ping / health ──────────────────────────────────────────────────────────

    connectPing() {
        if (this.pingSocket && this.pingSocket.readyState <= WebSocket.OPEN) return
        const socket = new WebSocket(`${WS_BASE}/ws/ping`)
        this.pingSocket = socket

        socket.onopen = () => this.setOnline(true)
        socket.onmessage = () => this.setOnline(true)
        socket.onclose = () => {
            this.setOnline(false)
            this.pingSocket = null
            this.schedulePingRetry()
        }
        socket.onerror = () => {
            this.setOnline(false)
        }
    }

    private schedulePingRetry() {
        if (this.pingRetryTimer !== null) return
        this.pingRetryTimer = setTimeout(() => {
            this.pingRetryTimer = null
            this.connectPing()
        }, 4000)
    }

    // ── Space events ───────────────────────────────────────────────────────────

    connectEvents(tokenCode: string) {
        this.eventsTokenCode = tokenCode
        if (this.eventsSocket && this.eventsSocket.readyState <= WebSocket.OPEN) return
        const socket = new WebSocket(
            `${WS_BASE}/ws/events?token_code=${encodeURIComponent(tokenCode)}`
        )
        this.eventsSocket = socket

        socket.onmessage = (e) => {
            try {
                const msg: WsMessage = JSON.parse(e.data)
                if (msg.type !== 'ping') {
                    const event = msg as SpaceEvent
                    this.spaceListeners.forEach((l) => l(event))
                }
            } catch {
                // ignore malformed messages
            }
        }

        socket.onclose = (e) => {
            this.eventsSocket = null
            // 4001 = custom close code we may use for auth failures; don't retry those
            if (e.code !== 4001 && this.eventsTokenCode) {
                this.scheduleEventsRetry(this.eventsTokenCode)
            }
        }
    }

    disconnectEvents() {
        this.eventsTokenCode = null
        if (this.eventsRetryTimer !== null) {
            clearTimeout(this.eventsRetryTimer)
            this.eventsRetryTimer = null
        }
        this.eventsSocket?.close()
        this.eventsSocket = null
    }

    private scheduleEventsRetry(tokenCode: string) {
        if (this.eventsRetryTimer !== null) return
        this.eventsRetryTimer = setTimeout(() => {
            this.eventsRetryTimer = null
            this.connectEvents(tokenCode)
        }, 4000)
    }

    // ── Status stream ──────────────────────────────────────────────────────────

    /**
     * Open a WebSocket that streams MORK status events for `namespacePath`.
     * The server sends the current status immediately, then pushes updates.
     * Returns an unsubscribe function that closes the connection.
     */
    subscribeStatus(
        namespacePath: string,
        tokenCode: string,
        onStatus: (event: StatusEvent) => void,
    ): () => void {
        // Strip leading/trailing slashes to build the URL path segment
        const seg = namespacePath.replace(/^\/|\/$/g, '')
        const url = seg
            ? `${WS_BASE}/ws/status/${seg}?token_code=${encodeURIComponent(tokenCode)}`
            : `${WS_BASE}/ws/status?token_code=${encodeURIComponent(tokenCode)}`

        const socket = new WebSocket(url)
        let closed = false

        socket.onmessage = (e) => {
            try {
                const event: StatusEvent = JSON.parse(e.data)
                onStatus(event)
            } catch {
                // ignore malformed messages
            }
        }

        socket.onerror = () => {
            if (!closed) socket.close()
        }

        return () => {
            closed = true
            socket.close()
        }
    }

    // ── Subscriptions ──────────────────────────────────────────────────────────

    /** Subscribe to online/offline changes. Returns an unsubscribe function. */
    onOnlineChange(listener: OnlineListener): () => void {
        this.onlineListeners.push(listener)
        listener(this.isOnline) // immediate current state
        return () => {
            this.onlineListeners = this.onlineListeners.filter((l) => l !== listener)
        }
    }

    /** Subscribe to space events. Returns an unsubscribe function. */
    onSpaceEvent(listener: SpaceEventListener): () => void {
        this.spaceListeners.push(listener)
        return () => {
            this.spaceListeners = this.spaceListeners.filter((l) => l !== listener)
        }
    }

    private setOnline(online: boolean) {
        if (this.isOnline !== online) {
            this.isOnline = online
            this.onlineListeners.forEach((l) => l(online))
        }
    }
}

export const wsService = new WebSocketService()
