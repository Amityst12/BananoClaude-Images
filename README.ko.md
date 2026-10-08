# Gemini Media Skill

[English](README.md)

이미 결제 중인 **Google AI 구독**으로 Claude Code나 Codex에서 **Gemini 이미지(나노바나나)**와 **Veo 영상**을 만드는 스킬입니다. Gemini API 키도, 호출당 과금도, 토큰 추출도 없습니다.

| 이미지 (텍스트) | 이미지 (참조) | 영상 (참조, Gemini 웹) |
|---|---|---|
| <img src="assets/image-text.jpg" width="240"> | <img src="assets/image-reference.jpg" width="135"> | <img src="assets/video-gemini.gif" width="135"> |

ChatGPT 이미지를 Codex로 같은 방식으로 쓰는 [GENEXIS-AI/gpt-image-skill](https://github.com/GENEXIS-AI/gpt-image-skill)에서 아이디어를 얻었습니다.

## 원리

Google은 외부 앱에 OAuth를 열어주지 않고, Antigravity OAuth 토큰을 다른 도구에 연결했다가 계정이 정지된 사례도 있습니다. 이 프로젝트는 토큰을 건드리지 않고 **Google 공식 화면/CLI를 사람이 쓰는 방식 그대로** 실행만 합니다.

```
gemini-image:  에이전트 -> node 스크립트 -> 공식 `agy -p` (Antigravity CLI 헤드리스) -> 내장 generate_image -> 프로젝트에 PNG 저장
gemini-video:  에이전트 -> node 스크립트 -> `aside repl` -> 내 브라우저의 Gemini 웹 / Flow -> 프로젝트에 MP4 저장
```

- **이미지**: Antigravity CLI의 내장 이미지 도구를 씁니다. Google AI 플랜의 Antigravity 한도에서 차감되고, 실행 전에 `GEMINI_API_KEY` / `GOOGLE_API_KEY`를 지워서 유료 API 키 모드로 넘어가지 않게 막습니다.
- **영상**: agy에는 영상 도구가 없어서, [Aside](https://aside.com) 브라우저의 REPL로 내가 로그인한 Gemini 웹("동영상 만들기") 또는 Google Flow를 조작합니다. 다운로드도 그 브라우저 안에서 하므로 쿠키가 밖으로 나가지 않습니다.

## 준비물

| | gemini-image | gemini-video |
|---|---|---|
| 플랜 | Google AI Pro / Ultra (Antigravity 한도) | Gemini 영상 / Flow를 쓸 수 있는 Google AI 플랜 |
| 도구 | [Antigravity CLI](https://antigravity.google/download) `agy` (한 번 로그인) | [Aside](https://aside.com) 브라우저 + `aside` CLI (Google 로그인 상태) |
| 런타임 | Node.js 18+ | Node.js 18+ |

macOS, agy 1.3.1, Aside CLI 1.26에서 테스트했습니다(2026년 10월). `ffmpeg`/`ffprobe`는 선택(영상 크기/길이 표시용)입니다.

## 설치

```bash
git clone https://github.com/inyounglee-datapopcorn/gemini-media-skill.git ~/.local/share/gemini-media-skill
~/.local/share/gemini-media-skill/install.sh
```

`install.sh`가 두 스킬을 `~/.claude/skills`(Claude Code)와 `~/.agents/skills`(Codex)에 심볼릭 링크로 연결합니다. 같은 이름의 기존 스킬은 백업 폴더로 옮기고, `node`, `agy`, `aside`가 있는지 확인합니다. 업데이트는 `git pull`이면 됩니다.

이미지를 처음 쓸 때는 터미널에서 `agy`를 한 번 실행해 Google로 로그인하세요. Antigravity 설정에서 **AI Credit Overages**를 **Never**로 두면 기본 한도를 넘어도 구매한 크레딧이 빠지지 않습니다.

## 사용법

에이전트에게 그냥 말하면 됩니다.

```
/gemini-image 따뜻한 오프화이트 배경 위의 코발트 블루 유리 로봇, 1:1
/gemini-image @robot.png 캐릭터를 비 오는 밤 서울 거리에 세워줘, 9:16 포스터
/gemini-video generated-images/robot.png 캐릭터가 빗속에서 자전거를 타는 영상, 16:9
```

스크립트를 직접 실행하는 예시는 [README.md](README.md#usage)를 참고하세요.

## 실제 측정값

| 경로 | 결과 | 시간 | 비용 |
|---|---|---|---|
| gemini-image 텍스트 | 1024x1024 | 약 70초 | Antigravity 5시간 한도의 약 1% |
| gemini-image 참조 + "16:9"/"9:16" | 1376x768 / 768x1376 | 36~50초 | 동일 |
| gemini-video Gemini 웹 | 720p, 10초, 오디오 | 약 1분 | Gemini 앱 영상 한도 |
| gemini-video Flow Veo 3.1 Lite | 720p, 8초, 오디오 | 약 1분 | 10 크레딧 (Fast 20) |

## 한계와 주의사항

- **워터마크**: Gemini 웹 영상은 우하단에 작은 별, Flow 영상은 작은 "Veo" 표시가 들어갑니다(일부 지역은 끌 수 없음). 보이지 않는 SynthID도 들어갑니다.
- **한도는 내 플랜 그대로**: 한도를 우회하거나 없는 기능을 열어주지 않습니다. Gemini 앱의 하루 영상 한도는 화면에 표시되지 않아서, 한도에 걸리면 Gemini의 메시지를 그대로 보여주고 멈춥니다.
- **gemini-video는 웹 화면을 자동 조작합니다**: `?hl=en`으로 열고 영어/한국어 라벨을 모두 인식하지만, Google이 화면을 바꾸면 "UI element not found"로 멈춥니다. 소비자용 웹 앱 자동화는 Google 약관과 충돌할 수 있으니 본인 계정으로, 사람이 쓰는 수준의 양으로만 쓰세요.
- **이미지 속 글자**는 깨질 수 있고, 요청하지 않은 실제 브랜드가 등장할 수 있습니다. 상업용이면 꼭 확인하세요.
- **투명 배경**은 지원하지 않습니다.
- 영상을 만들 때마다 Gemini 채팅 또는 Flow 프로젝트가 새로 생깁니다.

## 안전 경계

- `~/.gemini` 인증 파일을 읽지 않고, 쿠키나 OAuth 토큰을 꺼내지 않으며, Google 백엔드를 직접 호출하지 않습니다.
- agy는 `--sandbox`로 실행하고 `--dangerously-skip-permissions`는 쓰지 않습니다. 파일 수정/명령 실행 같은 도구 호출이 있으면 경고합니다.
- Flow는 화면에 표시된 실제 크레딧 비용을 읽어 `--max-credits`를 넘으면 **제출 전에** 중단합니다.
- `--expect-account`를 주면 다른 Google 계정으로 로그인돼 있을 때 중단합니다.

## 라이선스

MIT
