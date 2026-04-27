// ======================================================
// 공통 TypeScript 타입 정의
// ======================================================

/** AI 음악: 보컬 포함 vs 악기 위주 (부정 프롬프트 대신 긍정 문구로 전달) */
export type VocalMode = "vocals" | "instrumental";

/** Gemini 선정 곡 + (가능하면) 매칭된 YouTube 영상 */
export interface MusicSearchResultItem {
  artist: string;
  title: string;
  reason?: string;
  video: YouTubeVideo | null;
  /** 영상을 찾지 못한 경우 */
  matchError?: string;
  /** 분위기 검색 파이프라인 — 분위기·장르 태그 */
  moodTags?: string[];
  /** 0~1, 단일곡으로 분류된 신뢰도 */
  confidenceScore?: number;
  /** 재생/공유용 전체 URL */
  youtubeUrl?: string;
  /** 파이프라인에서 정식 발매로 판정된 경우 true (최종 노출은 true만) */
  isOfficialRelease?: boolean;
  /** 한국 국내·국내 OST 등으로 판정 (정렬·우선순위용) */
  koreanDomestic?: boolean;
}

// YouTube 검색 결과 한 건
export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  description: string;
  duration: string; // ISO 8601 형식: PT3M45S
  publishedAt: string;
  /** videos.list part=status — 임베드 불가이면 false */
  embeddable?: boolean;
}

// 라디오 선곡 추천 한 건
export interface SongRecommendation {
  order: number;
  title: string;          // 추천 곡 제목 또는 장르
  reason: string;         // 추천 이유
  searchKeyword: string;  // 슬롯별 선곡 방향 키워드 (AI 실제 곡 선정에 사용)
  mood: string;           // 예상 분위기
  role: "오프닝" | "브릿지" | "배경" | "엔딩" | "일반";
  /** AI가 실제 발매곡을 고른 뒤 YouTube 매칭 (음악 검색 탭과 동일 흐름) */
  curated?: MusicSearchResultItem;
  /** 선곡 실패 시 키워드 검색 폴백용 */
  youtubeResults?: YouTubeVideo[];
}

// 프로그램 조건 입력
export interface ProgramCondition {
  programName: string;
  timeSlot: string;    // 예: "오전 7시"
  mood: string;
  audience: string;
  songCount: number;
  style: string;
}

// AI 음악 생성 결과
export interface GeneratedMusic {
  audioBase64: string;
  promptUsed: string;
  koreanInput: string;
  /** MIME (예: audio/wav, audio/mpeg) */
  audioMimeType?: string;
  model?: "lyria2" | "lyria3pro";
  vocalMode?: VocalMode;
  usedRetryPrompt?: boolean;
}
