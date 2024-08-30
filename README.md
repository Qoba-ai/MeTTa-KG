# MeTTa-KG
https://deepfunding.ai/proposal/scalable-metta-knowledge-graphs/

## Namespaces

A KG corresponds to a hierarchy of namespaces. The following rules are enforced:
- namespaces start and end with the '/' character
- namespaces consist of alphanumeric characters, '/', '-' and '_'

## Tokens

Tokens give access to namespaces, according to their associated permissions:
- read: allows read-only access to namespace
- write: allows write access to the namespace (token must be also have read permission)
- share_read: allows creating a read token for this namespace (token must also have read permission)
- share_write: allows creating a read+write token for this namespace (token must also have read, write and share_read permissions)
- share_share: allows creating read+write+share_read+share_write token for this namespace (token must also have read, write, share_read and share_write permissions)

Only a single share_share token can exist, belonging to the application administrator. This token can have its code refreshed but the token itself cannot be deleted.

Examples of correct token permission sets:
- read
- read+share_read
- read+write
- read+write+share_read
- read+write+share_read+share_write

## Additional requirements

Back-ups should be isolated from writes.
