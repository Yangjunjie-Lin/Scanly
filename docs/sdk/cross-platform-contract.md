# Cross-platform contract freeze

The following values are identical across Web, Node, Swift, and Kotlin:

- format names and format classes;
- UTF-8 payload text and decoder-provided raw bytes;
- original-frame pixel coordinates, clockwise orientation, and corner ordering;
- typed error codes and recoverability semantics;
- deterministic result ordering and multi-result completion rules;
- explicit ownership and disposal behavior.

Adapters may translate memory handles and camera APIs, but may not rename a
format, reorder results, fabricate raw bytes/geometry, or turn a recoverable
error into a success. `native:contracts`, the shared native fixture manifest,
and browser/Node integration tests are the machine checks for this boundary.
