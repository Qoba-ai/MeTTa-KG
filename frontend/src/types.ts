export interface Token {
    id: number
    code: string
    description: string
    namespace: string
    creation_timestamp: string
    permission_read: boolean
    permission_write: boolean
    permission_share_read: boolean
    permission_share_write: boolean
    permission_share_share: boolean
    parent: number | null
}
