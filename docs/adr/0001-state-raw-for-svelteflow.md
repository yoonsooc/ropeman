# ADR-1: $state.raw for SvelteFlow 통합

- SvelteFlow의 내부 mutation → `$state` deep reactivity가 무한 루프 유발
- `flowNodes`, `flowEdges`에 `$state.raw` 사용
