# Git 워크플로우 (브랜치 → PR → 자동 머지)

서브 브랜치에서 작업한 변경을 **손 안 대고** main에 안전하게 합치는 자동화 파이프라인이다.
핵심은 두 가지 안전장치다.

1. **GitHub Actions CI** — PR이 열리면 `node tools/check.mjs full`(타입체크 + 전체 테스트 + 프로덕션 빌드)을
   GitHub 러너에서 자동 실행한다. 워크플로우는 [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
2. **자동 머지** — CI가 green이면 사람 개입 없이 squash 머지하고 원격 브랜치를 지운다.

## 전체 사이클

```
/dev TASK-NNN          # (선택) 계획→구현→검증→리뷰. 브랜치 생성·구현까지. 커밋 X
        │
   deploy 스킬          # 기능별 커밋 → 푸시 → PR 생성 → 자동 머지 예약
        │
   GitHub Actions CI    # check.mjs full 자동 실행 (PR에 체크로 표시)
        │  (green)
   자동 squash 머지      # 원격 브랜치 삭제
        │
   git switch main && git pull   # 로컬 main 동기화
```

서브 브랜치 위에서 **`deploy`** 한 번이면 커밋·푸시·PR 생성·자동 머지 예약까지 끝난다.
이후는 CI가 통과하는 대로 GitHub가 알아서 머지한다.

## 1회성 셋업 (최초 한 번만)

`gh` CLI 인증과 리포지토리 설정이 필요하다. 이미 셋업돼 있으면 건너뛴다.

```bash
# 1) GitHub CLI 로그인 (브라우저 열림 — 사람이 직접)
gh auth login

# 2) 리포지토리에 자동 머지 기능 켜기
gh repo edit --enable-auto-merge --delete-branch-on-merge

# 3) main 브랜치 보호 규칙: CI(verify) 통과를 머지 필수 조건으로
gh api -X PUT repos/YoungkeunAhn/boxer-game/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

> 3번의 보호 규칙이 핵심이다. 이게 없으면 `gh pr merge --auto`가 **CI를 기다리지 않고 즉시 머지**해
> 자동화의 안전망이 사라진다. `required_status_checks.contexts`의 `verify`는 `ci.yml`의 job 이름과 일치한다.

## 평소 사용

서브 브랜치에서:

```
deploy        # 또는 "커밋하고 푸시", "변경사항 올려줘" 등
```

`deploy` 스킬이 자동으로:
1. 변경을 기능별로 커밋 (Conventional Commits + 한글)
2. `check.mjs`로 로컬 검증 후 푸시
3. `gh pr create --base main --fill`로 PR 생성
4. `gh pr merge --auto --squash --delete-branch`로 CI 통과 시 자동 머지 예약

머지가 끝나면 로컬 main을 동기화한다:

```bash
git switch main && git pull
```

## 자동 머지 끄고 싶을 때

특정 PR을 직접 검토하고 머지하고 싶으면 `deploy` 시 "PR만 만들고 머지는 직접 할게"라고 하면
PR 생성까지만 한다. 또는 이미 예약된 자동 머지를 취소하려면:

```bash
gh pr merge --disable-auto <PR번호>
```

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `deploy`가 "gh 미인증이라 PR 건너뜀" | `gh auth login` 안 됨 → 1회성 셋업 1번 실행 |
| `--auto`가 거부됨 | 자동 머지 기능 꺼짐 → 셋업 2번(`gh repo edit --enable-auto-merge`) |
| CI 무시하고 바로 머지됨 | 브랜치 보호 규칙 없음 → 셋업 3번 |
| CI가 빨강인데 머지 안 됨 | 정상. PR의 "Checks" 탭에서 `check.mjs full` 실패 로그 확인 후 수정·재푸시 |
