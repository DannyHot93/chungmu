## ChungMu

방송용 음악 검색, AI 음악 생성, 라디오 선곡 기획을 한 화면에서 처리하는 내부 업무용 Next.js 앱입니다.

## Features

- 음악 검색: 키워드를 받아 Gemini가 실제 곡을 고르고 YouTube 단일 영상으로 매칭
- AI 음악 생성: 짧은 클립은 Lyria 2, 긴 생성은 Lyria 3 Pro Preview 사용
- 라디오 선곡: 프로그램 조건을 받아 슬롯 기획 후 곡 추천과 YouTube 후보 매칭까지 진행

## Tech Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Google Gemini API (텍스트 선곡/기획)
- YouTube Data API v3
- Google Vertex AI / Gemini music generation APIs

## Local Development

개발 서버 실행:

```bash
npm run dev
```

브라우저에서 [http://127.0.0.1:3000](http://127.0.0.1:3000) 을 엽니다.

프로덕션 빌드 검증:

```bash
npm run build
```

## Environment Variables

아래 값들이 필요합니다.

- `YOUTUBE_API_KEY`
- `LASTFM_API_KEY` (선택, 무료 DB 기반 분위기 후보 보강)
- `MUSICBRAINZ_USER_AGENT` (선택, MusicBrainz 요청 식별자)
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_API_KEY` 또는 `GOOGLE_AI_STUDIO_API_KEY` (선곡·기획 LLM, Lyria 3 Pro 등)

**짧은 음악(Lyria 2 · Vertex AI)** 은 Google Cloud 자격 증명이 필요합니다.

- **로컬:** `gcloud auth application-default login`  
  또는 `GOOGLE_APPLICATION_CREDENTIALS=/절대/경로/서비스계정.json`
- **Vercel·서버:** ADC가 없으므로 **서비스 계정 키**를 환경 변수로 넣습니다. (필수)
  - `GOOGLE_APPLICATION_CREDENTIALS_JSON` — 키 JSON **전문** (한 줄로 붙여넣기 권장)
  - 또는 `GOOGLE_APPLICATION_CREDENTIALS_BASE64` — `base64 -i key.json | tr -d '\n'` 결과

IAM에서 서비스 계정에 **Vertex AI User**(`roles/aiplatform.user`) 등 Vertex 호출 권한을 부여하고, `GOOGLE_CLOUD_PROJECT_ID`가 키의 `project_id`와 맞는지 확인합니다.

## Project Structure

- `app/page.tsx`: 탭 기반 메인 화면
- `app/api/*`: 검색, 생성, 선곡 API 라우트
- `components/*`: 화면 섹션과 테이블, 재생 모달
- `lib/geminiLlm.ts`: Gemini 기반 선곡/기획 로직
- `lib/musicSearch.ts`: AI 선곡과 YouTube 매칭 조합
- `lib/youtube.ts`: YouTube API 호출과 길이 처리
- `lib/lyria.ts`: Lyria 2 호출
- `lib/lyria3Gemini.ts`: Lyria 3 Pro Preview 호출
- `lib/musicDiscovery.ts`: 최신/연도 의도 파악

## Notes

- 현재 API 라우트는 인증 없이 외부 API를 호출하므로 배포 시 접근 제어가 필요합니다.
- YouTube 및 LLM 응답 형식은 외부 서비스 변경 가능성이 있어 운영 중 모니터링이 중요합니다.
