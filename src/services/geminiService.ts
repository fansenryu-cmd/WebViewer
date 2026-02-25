/**
 * Gemini API 직접 호출 (아카이브의 정령)
 * 프론트엔드에서 직접 호출 — 사용자 localStorage에 API 키 저장
 */
import type { Database } from 'sql.js';
import { getAllNovels, getStatsByNovelId } from '../db/queries';
import { normalizePlatform } from '../utils/platform';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

/** DB에서 RAG 컨텍스트 빌드 */
function buildDbContext(db: Database): string {
  const novels = getAllNovels(db);
  const lines: string[] = ['=== 등록 소설 현황 ==='];

  for (const novel of novels) {
    const platform = normalizePlatform(novel.platform);
    const stats = getStatsByNovelId(db, novel.id);
    const latestViews = stats.length > 0 ? stats[stats.length - 1].views : 0;
    const latestDate = stats.length > 0 ? stats[stats.length - 1].date : 'N/A';

    lines.push(
      `- [${platform}] "${novel.title}" by ${novel.author || '미상'}` +
        ` | 조회수: ${latestViews.toLocaleString()} (${latestDate})` +
        ` | 장르: ${novel.genre || '미분류'}` +
        (novel.launch_date ? ` | 런칭: ${novel.launch_date}` : ''),
    );

    // 최근 7일 추세
    if (stats.length >= 2) {
      const recent = stats.slice(-7);
      const trend = recent.map((s) => `${s.date.slice(5)}: ${s.views}`).join(' → ');
      lines.push(`  추세: ${trend}`);
    }
  }

  lines.push(`\n총 ${novels.length}개 작품 관리 중`);
  return lines.join('\n');
}

/** Gemini API 호출 */
export async function chatWithSpirit(
  db: Database,
  apiKey: string,
  history: ChatMessage[],
  userMessage: string,
): Promise<string> {
  const dbContext = buildDbContext(db);

  const systemInstruction = `당신은 "아카이브의 정령"입니다. 웹소설 작가의 데이터를 분석하고 조언하는 AI 어시스턴트입니다.
아래는 현재 데이터베이스의 작품 정보입니다:

${dbContext}

규칙:
1. 데이터에 기반한 분석과 조언을 제공합니다.
2. 조회수 추이, 플랫폼 비교, 성장 예측에 대해 답변합니다.
3. 친근하면서도 전문적인 톤을 유지합니다.
4. 한국어로 응답합니다.`;

  const contents = [
    ...history.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ];

  const resp = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API 오류 (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '응답을 받지 못했습니다.';
}
