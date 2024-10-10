# MeTTa-KG

https://deepfunding.ai/proposal/scalable-metta-knowledge-graphs/

This README is WIP and is subject to change.

## Spaces

A Knowledge Graph (KG) corresponds to a hierarchy of spaces. Each space has a name, which we refer to as its namespace. The root space is identified by the "/" namespace, while its direct subspaces (spaces on the second level of the hierachy) are identified by namespaces such as "/subspace1/", and so on.

Namespaces are similar to filesystem paths, especially when viewed as a tree. In this view, the difference is that for namespaces, interior nodes play the same role as leaf nodes, while their roles differ in the case of a filesystem path. In particular, every namespace in the hierachy identifies a space. Moreover, namespaces are never "terminal", meaning that it is always possible to embed subspaces further.

Spaces support two operations, read and write. As the name suggests, a read operation on a space provides a read-only view of that space. A write operation works by applying some transformations to the space, creating a new space in the process and preserving the original space. The newly created space is embedded into the space the write operation was used on.

### Namespace Rules

A namespace should:

- starts with '/'
- ends with '/'
- consists of segments separated by '/' that:
  - contains only alphanumeric characters, '-', '\_'
  - start with an alphanumeric character
  - end with an alphanumeric character

## Tokens

Tokens give access to spaces in the KG by linking to their namespaces. A token has a number of associated permissions:

- `read`: allow read-only viewing of the space
- `write`: allow write operations on the space
- `share-read`: allow creation of a new token with the 'read' permission on the same space
- `share-write`: allow creation of a new token with the 'write' permission on the same space

There exists a single "admin" token. It is associated with the root namespace `/` and has a special permission named `share-share`. The root token can be refreshed (= regenerated), but can not be deleted.

> [!WARNING]
> Operations are **recursive**. For example, tokens with the `write` permission for a namespace `/space/` can be used to write in `/space/subspace/`, `/space/subspace/another-subspace/`.

Existing tokens can be used to create new ones, provided they have any of the `share` permissions listed above.

> [!WARNING]
> Deleting a token also deletes any tokens that were created from it, recursively.

It is currently not possible to modify an existing token's namespace, description, or permissions. Tokens can be refreshed if leaked by accident.

Tokens are managed on the `/tokens` page ([Demo](https://metta-kg.vercel.app/tokens)).

## Editor

The editor allows you to interact with the contents of the KG using the [MeTTa](https://metta-lang.dev/) language.

The editor can be found on the `/` page ([Demo](https://metta-kg.vercel.app/)).

## Translations

Documentation on translations can be found [here](./translations/README.md).

## Demo

A live version of MeTTa-KG can be found at: https://metta-kg.vercel.app.
