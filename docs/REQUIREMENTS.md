# 요구사항 추적표

| 과제 요구사항                      | 구현                                               | 검증                                |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------- |
| DOM → Virtual DOM                  | core/vnode.ts: domToVNode                          | vdom.test.ts round trip, live forms |
| 두 트리 Diff                       | core/diff.ts                                       | 5가지 변경·무변경·key 회귀          |
| 변경 부분 Patch                    | core/patch.ts                                      | DOM 객체 동일성, 120개 key 순서     |
| 실제/테스트 영역과 버튼            | index.html, lab/lab.ts                             | app.test.ts, E2E, 실제 브라우저     |
| 초기 실제 DOM을 읽고 테스트 렌더링 | setupLab 초기화                                    | app.test.ts                         |
| 자유로운 샘플 수정                 | HTML textarea, contenteditable                     | 직접 DOM mutation·폼 이력           |
| 상태 이력, undo/redo               | lab/history.ts                                     | 불변성·최대 개수·분기·무변경        |
| FunctionComponent 클래스           | core/fiber.ts                                      | mount, update, unmount, whenIdle    |
| hooks 배열                         | core/hooks.ts                                      | 슬롯 보존·lazy init·stable setter   |
| 루트만 Hook / 상태 관리            | GameBoard, Board, withHooks owner                  | 자식 Hook 거부 테스트               |
| 순수 함수형 자식                   | Card, TaskRow, ProgressCard                        | props 변경·key 이동                 |
| useState                           | 상태 큐·updater·Object.is                          | 상태 지속·배칭·동시 도착            |
| useEffect                          | deps·setup·cleanup                                 | commit 이후·unmount·후속 갱신       |
| useMemo                            | deps 캐시                                          | 불필요한 재계산 방지                |
| Phase 1·2 공통 VDOM/Diff/Patch     | core/index.ts 공유 엔진                            | 양 Phase 통합 테스트                |
| 클릭·입력에 따른 변화              | 카드 게임, HTML 실험실, 작업 보드                  | 브라우저·통합·E2E                   |
| Vanilla / 외부 프레임워크 금지     | 런타임 npm 의존성 없음                             | package.json, 정적 build            |
| Fiber 아키텍처                     | child/sibling/return/alternate, WIP, yield, commit | commit 전 DOM 불변·작업 재개        |
| 선택: Batching                     | 단일 예약 + updater 큐                             | 세 번 setter → 한 commit            |
| 학습·설명 가능한 코드              | README, ARCHITECTURE                               | 시연 흐름·차이점·한계 명시          |

## 테스트 계층

- **서버 단위·기능**: `npm run test:backend`로 23개 테스트. 직접 만든 해시/B+ 트리와 실제 HTTP 서버의 경합·오류·과부하를 검증합니다.
- **서버 연동 E2E**: `tests/e2e/systems.spec.ts`의 3개 시나리오 × 데스크톱·모바일. 기존 4개 시나리오를 합쳐 총 14회 실행합니다.

- **단위·통합·회귀**: `npm test`로 41개 테스트. DOM 환경은 jsdom이며 layout/paint나 브라우저 focus 동작을 대신 검증하지 않습니다.
- **브라우저 E2E**: `tests/e2e/app.spec.ts`에 4개 시나리오 × 데스크톱·모바일 Chromium. GitHub Actions가 실행합니다.
- **카드 게임 검증**: 실제 카드 DOM 보존, 짝 맞춤, 자동으로 다시 덮는 타이머, 검사기 탭과 커밋 이력을 확인합니다.
- **추가 실험 검증**: 텍스트 Patch, 이력 이동, key 재정렬, 작업 추가·검색·저장, +3 배칭, 키보드 Patch와 모바일 가로 넘침을 확인합니다.

## 해석상의 경계

- 5가지 핵심 케이스 외에 key 재정렬을 위한 MOVE를 제공합니다.
- 편집기 shell·로그·이력 목록은 일반 DOM으로 구성됩니다. 과제의 실제 영역과 Phase 2 컴포넌트 화면은 자체 렌더러를 사용합니다.
- HTML의 브라우저 자동 보정은 그대로 따릅니다. 실행 가능한 임의 HTML과 custom element 등은 제한합니다.
- 스냅샷에는 텍스트·attribute·폼 값이 포함되지만 selection, focus, 스크롤 위치, 임의 JS property는 저장하지 않습니다.
- event handler 함수는 JSON 이력으로 직렬화하지 않습니다. Phase 1의 HTML 스냅샷 이력과 Phase 2의 실행 중 Hook 상태는 분리되어 있습니다.

## Mini Redis 요구사항 대응

| 요구사항                              | 구현                                                 | 증거                                               |
| ------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| 직접 만든 해시 기반 외부 키-값 저장소 | `backend/cache.py`, `/api/kv/키`                     | 충돌·확장·SET/GET/DEL·HTTP 테스트                  |
| 동시성 구조                           | 명령 단위 RLock, DB/cache coordination lock          | 병렬 쓰기·조회/무효화 경합 테스트                  |
| 만료 값 처리                          | GET에서 TTL 확인 후 삭제, metrics/snapshot에서 sweep | 경계 시각·즉시 만료·API 만료 테스트                |
| 사용자 무효화                         | DEL, TTL, 목록 캐시 DELETE API, 쓰기 후 무효화       | HTTP 캐시 MISS/HIT/재저장 테스트                   |
| 선택: 다운 시 보관                    | 수동/정상 종료 snapshot, 절대 만료 시각 복원         | 스냅샷 복원 테스트. 마지막 snapshot 이후 유실 가능 |
| API 응답 캐싱 활용                    | 카드 기록 API → 10초 캐시                            | 실제 UI·HTTP E2E                                   |
| 사용/미사용 성능 비교                 | 동일 HTTP 응답의 HIT와 BYPASS 비교                   | `docs/benchmarks/latest.json`                      |

## Mini DBMS 요구사항 대응

| 요구사항                   | 구현                                           | 증거                                          |
| -------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Phase 1: SQL 파일 → CLI    | `backend/cli.py`, `examples/demo.sql`          | CI에서 SQL 파일 실행                          |
| INSERT/SELECT 파싱·실행    | `backend/sql.py`, `Database.execute()`         | 문법·이스케이프·스키마 검증 테스트            |
| 테이블별 파일 저장         | UTF-8 JSONL append, 성공 전 fsync              | 재시작·한글 바이트 위치·손상 테스트           |
| Phase 2: 자동 ID와 B+ 트리 | `Table.append/bulk()`, `BPlusTree`             | 무작위 삽입 불변식·ID와 파일 일치 테스트      |
| 100만 건 삽입과 검색 비교  | 공통 SQL parser → bulk 저장, 공통 execute 조회 | 실제 1,000,000건 JSON 보고서                  |
| Phase 3: 외부 API          | `backend/server.py`, POST `/api/sql`           | 실제 HTTP INSERT/SELECT                       |
| Thread Pool 병렬 처리      | 8 workers + 32 queue, 503 backpressure         | 여러 실제 worker와 ID 중복 방지·과부하 테스트 |
| Phase 1+2 공유             | CLI/HTTP가 같은 Database와 SQL/B+ 트리 사용    | 공통 모듈 코드와 기능 테스트                  |

설계 원리·주요 함수·동시성·측정 방법·지원 범위는 [SYSTEMS.md](SYSTEMS.md)에 정리했습니다. 서버 API는 학습용 HTTP이며 Redis RESP 호환 서버나 트랜잭션 DB를 의미하지 않습니다.
