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
- `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_API_KEY` 또는 `GOOGLE_AI_STUDIO_API_KEY` (선곡·기획 LLM, Lyria 3 Pro 등)
- `SPOTIFY_CLIENT_ID` 선택
- `SPOTIFY_CLIENT_SECRET` 선택

Google Vertex 기반 짧은 음악 생성은 Application Default Credentials도 필요합니다.

```bash
gcloud auth application-default login
```

## Project Structure

- `app/page.tsx`: 탭 기반 메인 화면
- `app/api/*`: 검색, 생성, 선곡 API 라우트
- `components/*`: 화면 섹션과 테이블, 재생 모달
- `lib/geminiLlm.ts`: Gemini 기반 선곡/기획 로직
- `lib/musicSearch.ts`: AI 선곡과 YouTube 매칭 조합
- `lib/youtube.ts`: YouTube API 호출과 길이 처리
- `lib/lyria.ts`: Lyria 2 호출
- `lib/lyria3Gemini.ts`: Lyria 3 Pro Preview 호출
- `lib/musicDiscovery.ts`: 최신/연도 의도 파악과 Spotify 후보 수집

## Notes

- 현재 API 라우트는 인증 없이 외부 API를 호출하므로 배포 시 접근 제어가 필요합니다.
- YouTube 및 LLM 응답 형식은 외부 서비스 변경 가능성이 있어 운영 중 모니터링이 중요합니다.
