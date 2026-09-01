import * as ImageManipulator from 'expo-image-manipulator';

import { photoPaths, supabase } from '@/lib/supabase';

/**
 * 사진 파이프라인 (계획 §4.9).
 *
 * ⚠ 원본 한 장만 저장하면 목록 스크롤이 전송량을 태운다.
 *   1280px q0.7 ≈ 200KB, 목록 행에 실제로 필요한 건 320px ≈ 15KB — 13배 차이.
 *   3,000건 목록을 끝까지 스크롤하면 600MB vs 45MB 다. 무료 티어 egress 5GB 로는
 *   전자가 월 8회, 후자가 월 110회다.
 *
 * 서버 이미지 변환 기능은 쓰지 않는다 — 유료 부가 기능이고 원본 수만큼 과금된다.
 * 촬영 시점에 클라이언트가 두 장을 만든다.
 */

/**
 * ⚠ 썸네일을 320 → 640 으로 올렸다 (2026-08-30).
 *
 * 320 은 목록이 **52px 짜리 작은 행**이던 시절의 값이다. 찾기 탭이 2열 사진 격자로
 * 바뀌면서 카드가 한 변 **490 물리 픽셀**이 됐고, 320px 을 1.6배로 늘려 그리게 되어
 * 눈에 띄게 뭉갰다(사용자 보고).
 *
 * 640 이면 490 자리에 **축소해서** 그리므로 선명하다. 대가는 파일 크기다 —
 * 픽셀이 4배이므로 대략 3배 안팎으로 늘어난다. 목록 한 페이지(24장) 기준
 * 0.3MB → 1MB 수준. 무료 티어에서 감당 가능한 범위로 판단했다.
 *
 * 품질도 0.6 → 0.7 로 올렸다. 크게 그릴수록 압축 잡티가 그대로 보인다.
 */
export const SIZES = {
  /** 장변 길이. 세로 사진이면 높이, 가로 사진이면 폭이다 */
  thumb: { long: 640, quality: 0.7 },
  full: { long: 1280, quality: 0.7 },
} as const;

/**
 * 사진 표시 비율 — **폭 ÷ 높이**. 세로 3:4.
 *
 * ⚠ 이 값을 화면마다 따로 쓰지 않는다. 격자·상세·등록 미리보기·카메라 프레임이
 *   전부 여기서 가져간다. 한 군데라도 다른 값을 쓰면 "격자에서 보이던 것과 다르다"
 *   가 다시 시작된다 — 예전에 정확히 그 문제를 겪었다.
 *
 * 왜 3:4 인가 (2026-08-31 사용자 요청): 전에는 1:1 로 잘랐는데, 그러려면 카메라
 *   미리보기의 위아래를 크게 도려내야 해서 촬영 화면이 답답했다. 3:4 는 대부분
 *   폰 센서의 **원본 비율**이라 **자르는 픽셀이 아예 없고**, 같은 폭에서 사진이
 *   33% 더 크게 보인다.
 */
export const PHOTO_ASPECT_PAIR = [3, 4] as const;

/** 계산용 비율. **반드시** 위 쌍에서 파생시킨다 — 따로 적으면 언젠가 어긋난다 */
export const PHOTO_ASPECT = PHOTO_ASPECT_PAIR[0] / PHOTO_ASPECT_PAIR[1];

export type PreparedPhoto = {
  thumbUri: string;
  fullUri: string;
};

/**
 * 촬영한 원본에서 썸네일과 표시용 원본 두 장을 만든다.
 *
 * ⚠ 원본 크기를 받는 이유: resize({ width }) 는 **폭** 기준이라 세로 사진이면
 *   장변이 320 이 아니라 427 이 된다. 픽셀이 1.8배가 되어 §4.9 의 용량 예산이 어긋난다.
 *   방향을 보고 긴 쪽에 값을 준다.
 */
export async function preparePhoto(sourceUri: string): Promise<PreparedPhoto> {
  // ⚠ 카메라가 보고한 width/height 로 방향을 판정하면 안 된다. 센서는 가로 기준으로
  //   보고하는데 저장되는 이미지는 회전이 반영된 세로다. 그 값을 믿고
  //   resize({ width: 1280 }) 하면 결과가 1280×1706 이 되어 장변이 1706 이 된다 —
  //   의도보다 픽셀이 33% 많다(실기기 실측으로 확인).
  //   한 번 렌더해 **실제 치수**를 보고 긴 쪽에 값을 준다.
  const probe = await ImageManipulator.ImageManipulator.manipulate(sourceUri).renderAsync();

  const [thumb, full] = await Promise.all([
    fitResize(sourceUri, probe.width, probe.height, SIZES.thumb.long, SIZES.thumb.quality),
    fitResize(sourceUri, probe.width, probe.height, SIZES.full.long, SIZES.full.quality),
  ]);
  return { thumbUri: thumb, fullUri: full };
}

/**
 * 비율을 유지한 채 **장변**을 `long` 으로 맞춘다. 자르지 않는다.
 *
 * 전에는 중앙 정사각으로 잘랐다(`squareResize`). 화면이 전부 1:1 이었기 때문인데,
 * 그러자면 카메라 미리보기도 1:1 이어야 했고 위아래를 크게 도려내야 했다.
 * 촬영 화면이 답답하다는 지적을 받아 3:4 로 바꿨다 — 센서 원본 비율이라
 * **버리는 픽셀이 없다.**
 *
 * ⚠ 장변 기준으로 맞춰야 한다. `resize({ width })` 는 폭 기준이라 세로 사진이면
 *   장변이 의도보다 33% 커진다(§4.9 용량 예산이 어긋난다).
 */
async function fitResize(
  uri: string,
  srcW: number,
  srcH: number,
  long: number,
  quality: number,
): Promise<string> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
  // 원본이 이미 작으면 키우지 않는다 — 없는 화질이 생기지는 않고 용량만 는다
  const scale = Math.min(1, long / Math.max(srcW, srcH));
  ctx.resize({ width: Math.round(srcW * scale), height: Math.round(srcH * scale) });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return saved.uri;
}

/** Storage 업로드. React Native 에서는 fetch→ArrayBuffer 경로가 가장 안정적이다 */
async function uploadOne(path: string, uri: string) {
  const res = await fetch(uri);
  const bytes = await res.arrayBuffer();
  const { error } = await supabase.storage.from(photoPaths.bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
}

/**
 * 썸네일을 **먼저** 올린다.
 * 목록에 빨리 뜨고, 원본 업로드가 실패해도 목록은 정상 동작한다.
 */
export async function uploadPhoto(
  householdId: string,
  itemId: string,
  photo: PreparedPhoto,
): Promise<{ thumbPath: string; photoPath: string }> {
  const uuid = itemId; // 물건당 사진 1장이므로 itemId 를 파일명으로 재사용
  const thumbPath = photoPaths.thumb(householdId, itemId, uuid);
  const photoPath = photoPaths.full(householdId, itemId, uuid);

  await uploadOne(thumbPath, photo.thumbUri);
  await uploadOne(photoPath, photo.fullUri);

  return { thumbPath, photoPath };
}

/**
 * 이미 있는 행(물건·박스)에 사진을 붙이거나 교체한다.
 *
 * ⚠ `uploadPhoto` 와 달리 **버전 uuid 로 새 경로를 만든다.**
 *   교체할 때 같은 경로에 upsert 하면 서명 URL 의 경로가 그대로라
 *   expo-image 의 디스크 캐시가 **옛 사진을 계속 보여준다.** 파일은 바뀌었는데
 *   화면은 안 바뀌므로 "업로드가 실패했나" 로 보인다.
 *   경로가 달라지면 URL 도 달라져서 이 문제가 원천적으로 생기지 않는다.
 *
 * 대가는 옛 파일이 남는 것이라, 부르는 쪽에서 행을 갱신한 뒤 `deletePhotoObjects` 로 지운다.
 */
export async function uploadEntityPhoto(
  householdId: string,
  ownerId: string,
  version: string,
  photo: PreparedPhoto,
): Promise<{ thumbPath: string; photoPath: string }> {
  const thumbPath = photoPaths.thumb(householdId, ownerId, version);
  const photoPath = photoPaths.full(householdId, ownerId, version);
  await uploadOne(thumbPath, photo.thumbUri);
  await uploadOne(photoPath, photo.fullUri);
  return { thumbPath, photoPath };
}

/**
 * 더 이상 참조되지 않는 사진 객체를 지운다.
 *
 * ⚠ 반드시 **행을 먼저 갱신한 뒤** 부를 것. 순서를 뒤집으면 업로드가 실패했을 때
 *   행은 없는 파일을 가리키고 목록에 깨진 칸이 남는다.
 *   여기서 실패해도 데이터는 정합적이다 — 참조되지 않는 파일이 남을 뿐이라 던지지 않는다.
 */
export async function deletePhotoObjects(paths: (string | null | undefined)[]): Promise<void> {
  const targets = paths.filter((p): p is string => !!p);
  if (targets.length === 0) return;
  const { error } = await supabase.storage.from(photoPaths.bucket).remove(targets);
  if (error && __DEV__) console.warn('[photo] 옛 사진 정리 실패(무해)', error.message);
}

