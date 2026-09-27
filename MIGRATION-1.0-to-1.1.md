# Syntax migration: 1.0 → 1.1

Version 1.1 removes the old field prefixes and keeps the query syntax smaller.

| 1.0 | 1.1 |
| --- | --- |
| `artist:Mora` | `Mora` for general text matching, or `@Mora` for an exact artist |
| `artist:@Mora` | `@Mora` |
| `title:Memorias` | `Memorias` |
| `album:Microdosis` | `Microdosis` |
| `track:Memorias` | `Memorias` |
| `year:2022` | `year:2022` |
| `year:>2017` | `year:>2017` or `>2017` |
| `year:>2017 & year:<2020` | `>2017 & <2020` |
| quoted values | use plain text; escape reserved operator characters when needed |

## Operators

- `;` — OR
- `&` — AND
- `-` — exclude
- `@` — exact artist
- `year:` — explicit year filter
- `<`, `<=`, `>`, `>=`, `=` — year comparisons
- `\` — escape a reserved character

## Examples

```text
@Quevedo & @Mora
>2017 & <2020 & @Mora
Mora;Quevedo
@Mora & -live
rock\&roll
```

## Result list change

Advanced searches in 1.1 no longer modify Spotify's native playlist rows. Smart Search uses its own result list while an advanced query is active, then restores Spotify's normal list when the query is cleared.
