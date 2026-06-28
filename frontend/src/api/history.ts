import api from './axios'

export interface HistoryRow {
    callId: string
    peerId: string
    direction: string          // OUTGOING | INCOMING | MISSED
    endReason: string          // completed | missed | rejected | cancelled | dropped
    durationMs: number | null
    startedAt: string | null
    endedAt: string
}

export interface HistoryPage {
    items: HistoryRow[]
    nextCursor: string | null
}

// before = con trỏ trang (endedAt của dòng cuối trang trước); null = trang đầu
export async function fetchHistory(before: string | null, size = 20): Promise<HistoryPage> {
    const { data } = await api.get<HistoryPage>('/api/history', {
        params: { before: before ?? undefined, size },
    })
    return data
}
