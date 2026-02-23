/**
 * 플랫폼 뱃지
 */
import { PLATFORM_COLORS, normalizePlatform } from '../utils/platform';

export default function PlatformBadge({ platform }: { platform: string }) {
  const normalized = normalizePlatform(platform);
  const color = PLATFORM_COLORS[normalized] || '#9ca3af';

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {normalized}
    </span>
  );
}
