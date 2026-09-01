import { useEffect, useMemo } from 'react';

import { STACK_MAX } from '@/components/ThumbStack';
import { useThumbUrls } from '@/features/item/thumbs';
import { useAllItems } from '@/features/search/api';
import { useAllContainers } from '@/features/storage/api';

/**
 * 장소·박스 줄에 겹쳐 보여 줄 **사진 경로들.**
 *
 * 고르는 순서:
 *   · 장소 → **박스 사진 먼저**, 모자라면 물건 사진. 장소를 찾을 때 사람은 박스를
 *     보고 알아본다 — 물건은 박스 안에 들어가 있어 밖에서 보이지 않는다(사용자 판단).
 *   · 박스 → 제 사진이 있으면 **그 한 장만.** 그건 진짜 대표 사진이라 겹칠 이유가 없다.
 *     없으면 안에 든 물건들.
 *   · 장소 직속 → 박스에 안 들어간 물건들.
 *
 * ⚠ 새 질의를 만들지 않는다. `useAllItems` 는 찾기 탭이, `useAllContainers` 는 이동
 *   화면이 이미 받아 둔 것과 **같은 캐시 키**다. 목록 화면마다 제 질의를 파면 같은
 *   데이터를 서너 번 받게 된다.
 *
 * ⚠ 이동 화면과 보관 장소 탭이 이 하나를 같이 쓴다. 규칙이 두 벌이 되면 같은 장소가
 *   화면마다 다른 사진을 보여 주게 된다.
 */
export function useCoverStacks(householdId: string | null) {
  const items = useAllItems(householdId);
  const containers = useAllContainers(householdId);
  const thumbs = useThumbUrls();

  const cover = useMemo(() => {
    const loc = new Map<string, string[]>();
    const box = new Map<string, string[]>();
    const loose = new Map<string, string[]>();
    const push = (m: Map<string, string[]>, k: string, v: string) => {
      const a = m.get(k);
      if (!a) m.set(k, [v]);
      else if (a.length < STACK_MAX && !a.includes(v)) a.push(v);
    };

    // 1) 장소는 박스 사진부터
    const ownPhoto = new Set<string>();
    for (const b of containers.data ?? []) {
      if (!b.thumb_path) continue;
      ownPhoto.add(b.id);
      box.set(b.id, [b.thumb_path]); // 제 사진 — 이 박스는 여기서 확정이다
      push(loc, b.location_id, b.thumb_path);
    }
    // 2) 모자란 자리는 물건 사진으로
    for (const it of items.data ?? []) {
      if (!it.thumb_path) continue;
      push(loc, it.location_id, it.thumb_path);
      if (it.container_id) {
        if (!ownPhoto.has(it.container_id)) push(box, it.container_id, it.thumb_path);
      } else {
        push(loose, it.location_id, it.thumb_path);
      }
    }
    return { loc, box, loose };
  }, [items.data, containers.data]);

  useEffect(() => {
    thumbs.ensure([
      ...[...cover.loc.values()].flat(),
      ...[...cover.box.values()].flat(),
      ...[...cover.loose.values()].flat(),
    ]);
  }, [cover, thumbs]);

  return { cover, thumbs };
}
