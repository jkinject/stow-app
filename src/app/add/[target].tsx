import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { Button, Field, FieldLabel, TextButton } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { CameraCapture } from '@/features/item/CameraCapture';
import { MovePicker, type MoveTarget } from '@/features/item/MovePicker';
import { abandonCycle, markFirstInput } from '@/features/item/metrics';
import { MAX_ITEM_PHOTOS, preparePhoto, type PreparedPhoto } from '@/features/item/photo';
import { PhotoGallery } from '@/features/item/PhotoGallery';
import { QUEUE_LIMIT, useRegisterQueue, type DraftItem } from '@/features/item/queue';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, space } from '@/lib/theme';

/**
 * 물건 등록 — **2단계** (2026-08-30 사용자 요청).
 *
 *   1단계: 카메라가 화면을 꽉 채운다. 찍거나 · 사진첩에서 고르거나 · 사진 없이 넘어간다.
 *   2단계: 사진을 확인하며 이름과 추가 정보를 넣고, "등록" 을 눌러야 저장된다.
 *
 * 사진 여러 장 (2026-09-08 사용자 요청): 첫 장은 지금처럼 찍자마자 2단계로 간다(P1 —
 * 등록은 빨라야 한다). 2단계의 썸네일 줄 끝 + 를 누르면 카메라로 **돌아가서** 여러 장
 * 모드로 계속 찍고, "완료" 로 돌아온다. 첫 장이 대표다.
 *
 * 왜 나눴나: 사진을 **항상 그 자리에서 찍는 것은 아니다.** 이미 찍어 둔 사진을
 * 사진첩에서 불러오는 경우가 있고, 한 화면에 카메라와 폼을 같이 두면 카메라도 작고
 * 폼도 좁다. 나누면 각 단계가 화면을 다 쓴다.
 *
 * 대상(`target`)의 세 가지 형태:
 *   `/add/{박스id}`          → 그 박스 안에
 *   `/add/{장소id}?loose=1`  → 그 장소에 박스 없이
 *   `/add/new`               → **아직 안 정함.** 2단계에서 고른다 (찾기 탭의 + 버튼용)
 */

type AddContext = {
  locationId: string;
  locationName: string;
  containerId: string | null;
  containerName: string | null;
};

const NEW = 'new';

function useAddContext(target: string, loose: boolean) {
  return useQuery({
    queryKey: ['add-context', target, loose],
    enabled: !!target && target !== NEW,
    queryFn: async (): Promise<AddContext> => {
      if (loose) {
        const { data, error } = await supabase
          .from('locations')
          .select('id, name')
          .eq('id', target)
          .single();
        if (error) throw error;
        return {
          locationId: data.id,
          locationName: data.name ?? '',
          containerId: null,
          containerName: null,
        };
      }
      const { data, error } = await supabase
        .from('containers')
        .select('id, name, location_id, locations(name)')
        .eq('id', target)
        .single();
      if (error) throw error;
      return {
        locationId: data.location_id,
        locationName: (data.locations as { name?: string } | null)?.name ?? '',
        containerId: data.id,
        containerName: data.name ?? '',
      };
    },
  });
}

export default function AddItem() {
  const { target: raw, loose } = useLocalSearchParams<{ target: string; loose?: string }>();
  const target = String(raw);
  const isLoose = loose === '1';

  const t = useT();
  const router = useRouter();
  const { activeId } = useHousehold();

  const ctx = useAddContext(target, isLoose);
  const queue = useRegisterQueue();

  const [step, setStep] = useState<1 | 2>(1);
  /**
   * ⚠ 셔터를 누른 뒤 **이미지 처리를 기다리지 않는다.**
   *
   *   `preparePhoto` 는 한 번 디코딩해 크기를 재고, 640·1280 두 장을 잘라 JPEG 로
   *   인코딩한다. 촬영 자체보다 이쪽이 오래 걸려서, 셔터를 눌러도 화면이 곧바로
   *   넘어가지 않는 지연이 생겼다(사용자 보고).
   *
   *   원본 uri 만 받아 **즉시 2단계로 넘기고**, 처리는 배경에서 돌린다.
   *   등록 버튼을 누르는 시점에는 대개 이미 끝나 있고, 아니면 그때 기다린다.
   *   미리보기는 원본을 보여주므로 최종 결과와 같은 화면이 나온다.
   *
   * 여러 장이라 원본 uri 와 처리 약속을 **장마다** 쌓는다. 순서가 곧 사진 순서다.
   */
  const [shots, setShots] = useState<Shot[]>([]);
  /**
   * ⚠ 이름은 **부모가** 들고 있는다. "더 찍기" 로 1단계에 다녀오면 FormStep 이
   *   언마운트되므로, 여기 없으면 입력하던 이름이 사라진다.
   */
  const [name, setName] = useState('');
  /** 2단계에서 고른 목적지. `/add/new` 로 들어왔을 때만 쓰인다 */
  const [picked, setPicked] = useState<AddContext | null>(null);

  const dest: AddContext | null = target === NEW ? picked : (ctx.data ?? null);

  useEffect(() => () => abandonCycle(), []);

  return step === 1 ? (
    <CameraCapture
      title={dest ? pathOf(dest, t) : ''}
      /*
        첫 장이면 X 는 등록을 그만두는 것, 이미 찍은 게 있으면 "완료" 로 2단계로 돌아간다.
        여러 장 모드(shotCount)에서는 찍어도 카메라가 남아 계속 찍는다.
      */
      shotCount={shots.length > 0 ? shots.length : undefined}
      busy={shots.length >= MAX_ITEM_PHOTOS}
      onClose={() => (shots.length > 0 ? setStep(2) : router.back())}
      onPhoto={(uri) => {
        const first = shots.length === 0;
        // 처리를 시작만 하고 기다리지 않는다. 실패는 등록 시점에 드러난다.
        setShots((prev) => [...prev, { key: Crypto.randomUUID(), uri, prepared: preparePhoto(uri) }]);
        if (first) setStep(2); // 첫 장은 찍자마자 폼으로 (P1). 그 뒤는 "완료" 로 돌아온다
      }}
      onSkip={shots.length === 0 ? () => setStep(2) : undefined}
    />
  ) : (
    <FormStep
      shots={shots}
      name={name}
      onName={setName}
      dest={dest}
      canPickDest={target === NEW}
      householdId={activeId}
      queue={queue}
      onAddMore={() => setStep(1)}
      onDropShot={(i) => setShots((prev) => prev.filter((_, j) => j !== i))}
      onMoveShot={(from, to) =>
        setShots((prev) => {
          const next = prev.slice();
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        })
      }
      onPickDest={setPicked}
      onDone={(id) => {
        /**
         * ⚠ 여기서 알리지 않는다. **도착한 상세 화면이** 축하 팝업을 띄운다
         *   (2026-09-02 사용자 요청 — 토스트는 등록된 느낌이 약하다).
         *
         *   왜 그쪽인가: 팝업에는 등록된 물건의 사진·이름·자리가 함께 나와야
         *   "이게 등록됐다" 가 분명해진다. 그 정보는 상세 화면에 이미 다 있다.
         *   `justCreated` 는 그 한 번을 알리는 신호일 뿐이다.
         */
        router.replace({ pathname: '/item/[id]', params: { id, justCreated: '1' } });
      }}
      onClose={() => router.back()}
    />
  );
}

/** 찍은 한 장 — 원본 uri 와, 배경에서 도는 처리 결과 */
type Shot = { key: string; uri: string; prepared: Promise<PreparedPhoto> };

function pathOf(d: AddContext, t: ReturnType<typeof useT>): string {
  return d.containerName ? `${d.locationName} › ${d.containerName}` : `${d.locationName}${t.add.noBox}`;
}

/* ───────────────────────────── 2단계: 폼 ───────────────────────────── */

function FormStep({
  shots,
  name,
  onName,
  dest,
  canPickDest,
  householdId,
  queue,
  onAddMore,
  onDropShot,
  onMoveShot,
  onPickDest,
  onDone,
  onClose,
}: {
  shots: Shot[];
  name: string;
  onName: (v: string) => void;
  dest: AddContext | null;
  canPickDest: boolean;
  householdId: string | null;
  queue: ReturnType<typeof useRegisterQueue>;
  onAddMore: () => void;
  onDropShot: (i: number) => void;
  onMoveShot: (from: number, to: number) => void;
  onPickDest: (d: AddContext) => void;
  onDone: (itemId: string, name: string) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const nameRef = useRef<TextInput>(null);

  const [saving, setSaving] = useState(false);
  /**
   * ⚠ 초기값으로 연다. 이펙트에서 setState 로 열면 렌더가 연쇄되고(react-hooks 규칙),
   *   "아직 안 정함" 이 한 프레임 보였다 사라진다.
   *
   * 목적지가 이미 있으면(박스·장소에서 들어온 경우, 또는 앞서 골라 둔 경우) 열지 않는다.
   * "다시 찍기" 로 돌아왔다 와도 부모가 목적지를 들고 있어 다시 묻지 않는다.
   */
  const [pickerOpen, setPickerOpen] = useState(canPickDest && !dest);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [draggingPhoto, setDraggingPhoto] = useState(false);

  async function onSave() {
    const n = name.trim();
    if (!n || !householdId) return;
    if (!dest) {
      Alert.alert(t.addFlow.whereTitle, t.addFlow.whereRequired);
      return;
    }
    if (queue.blocked) {
      Alert.alert(t.add.queueFull, t.add.queueFullBody(QUEUE_LIMIT));
      return;
    }

    const draft: DraftItem = {
      id: Crypto.randomUUID(),
      household_id: householdId,
      location_id: dest.locationId,
      container_id: dest.containerId,
      name: n,
      // ⚠ 등록은 **이름 하나**만 받는다 (AC3). 수량·카테고리·임계치·구매링크·메모는
      //   등록 후 물건 상세의 "수정" 에서 넣는다 — 등록 화면에 다 늘어놓으면
      //   대부분 비워둘 칸 때문에 등록이 느려진다.
      category: null,
      quantity: 1,
      threshold: null,
      unit: null,
      purchase_url: null,
      note: null,
    };

    /**
     * ⚠ **키보드를 먼저 내린다.** 올라온 채로 화면을 바꾸면 도착한 화면이 그 높이를
     *   그대로 물려받아 아래가 텅 빈다(실기기 확인 2026-09-02).
     *
     *   `KeyboardSpacer` 는 키보드 높이를 안드로이드 IME 인셋에서 읽는데, 이 화면이
     *   사라지면서 추적이 끊기고 키보드는 그 뒤에 닫힌다 — 닫혔다는 사실을 아무도
     *   못 듣는다. 여기서 내려 두면 **이 화면이 아직 떠 있는 동안** 닫히므로 그
     *   변화가 제대로 기록된다. (저장이 네트워크를 한 번 다녀오는 사이에 끝난다)
     */
    Keyboard.dismiss();

    setSaving(true);
    try {
      // 배경에서 돌던 이미지 처리를 여기서 거둔다. 대개 이미 끝나 있다.
      /**
       * ⚠⚠ 여기서 사진을 잃어도 **아무 말도 하지 않았다** (2026-09-06 사용자 보고로 발견).
       *   `__DEV__` 콘솔 경고뿐이라 릴리스 빌드에서는 흔적조차 없었다. 찍은 사람은
       *   사진과 함께 등록한 줄 아는데 조용히 사진 없는 물건이 됐다.
       *   물건은 그대로 저장하되(AC3 — 필수는 이름 하나), **말은 해 준다.**
       *   여러 장이면 처리에 실패한 장만 빠지고 나머지는 순서대로 간다.
       */
      const settled = await Promise.allSettled(shots.map((s) => s.prepared));
      const photos: PreparedPhoto[] = [];
      let photoLost = false;
      for (const r of settled) {
        if (r.status === 'fulfilled') photos.push(r.value);
        else {
          photoLost = true;
          if (__DEV__) console.warn('[add] 사진 처리 실패, 그 장은 빼고 저장', r.reason);
        }
      }
      // 행 저장만 기다린다. 사진 업로드는 배경에서 이어진다 (AC4)
      await queue.enqueueAndWaitForRow(draft, photos);
      abandonCycle();
      onDone(draft.id, draft.name);
      // 화면을 넘긴 **뒤에** 알린다 — 도착한 상세에서 곧바로 다시 찍을 수 있다
      if (photoLost) Alert.alert(t.add.photoLostTitle, t.add.photoLostBody);
    } catch (e) {
      Alert.alert(t.add.saveFailed, e instanceof Error ? e.message : t.common.tryAgain);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardSpacer style={[st.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <TextButton label={t.common.cancel} onPress={onClose} style={st.topAction} />
        <Text style={[st.topTitle, { color: c.text }]}>{t.addFlow.step2Title}</Text>
        <View style={st.camActionSpacer} />
      </View>

      {/* ⚠ flex: 1 이 없으면 ScrollView 가 **내용 크기로** 잡혀서, 아래의 고정 푸터가
          화면 하단이 아니라 내용 바로 뒤에 붙는다 — 그래서 키보드에 잘렸다. */}
      <ScrollView
        style={st.fill}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md }}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!draggingPhoto}
      >
        {/*
          찍은 사진들 — 상세 화면과 **같은 갤러리**. 큰 사진 구석의 "빼기" 로 한 장을
          목록에서 빼고, 썸네일 줄 끝 + 로 카메라에 돌아가 더 찍는다.
          아직 저장 전이라 로컬 원본을 그대로 보여 준다.
        */}
        <PhotoGallery
          slides={shots.map((s) => ({ key: s.key, source: { uri: s.uri } }))}
          index={photoIndex}
          onIndexChange={setPhotoIndex}
          onAdd={onAddMore}
          canAdd={shots.length < MAX_ITEM_PHOTOS}
          onDropSlide={(i) => {
            setPhotoIndex((cur) => Math.max(0, Math.min(cur, shots.length - 2)));
            onDropShot(i);
          }}
          onMoveSlide={(from, to) => {
            setPhotoIndex(to);
            onMoveShot(from, to);
          }}
          onDragStateChange={setDraggingPhoto}
        />

        {/* 어디에 둘지. `/add/new` 로 들어오면 여기서 정한다 */}
        <Pressable
          onPress={() => canPickDest && setPickerOpen(true)}
          style={[st.destRow, { borderColor: dest ? c.border : c.danger, backgroundColor: c.card }]}
        >
          <View style={st.destMain}>
            <FieldLabel>{t.addFlow.whereTitle}</FieldLabel>
            <Text style={[st.destValue, { color: dest ? c.text : c.textMuted }]} numberOfLines={1}>
              {dest ? pathOf(dest, t) : t.addFlow.whereNotSet}
            </Text>
          </View>
          {canPickDest && <Text style={[st.destPick, { color: c.accentText }]}>{t.addFlow.wherePick}</Text>}
        </Pressable>

        <Field
          ref={nameRef}
          value={name}
          onChangeText={(v) => {
            markFirstInput();
            onName(v);
          }}
          placeholder={t.add.namePlaceholder}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => void onSave()}
          style={st.nameField}
        />

      </ScrollView>

      {/**
        * ⚠ 등록 버튼은 **스크롤 밖**에 고정한다.
        *   스크롤 안에 두면 키보드가 올라왔을 때 가려져, 버튼을 찾으러 스크롤해야 한다
        *   (실사용 보고). 이름 칸은 자동으로 포커스되므로 키보드는 **항상** 올라와 있다 —
        *   즉 기본 상태에서 버튼이 안 보인다는 뜻이다.
        *   여백은 lib/keyboard 의 실측 높이를 쓴다(edge-to-edge 에서 창이 줄지 않는다).
        */}
      <View
        style={[
          st.footer,
          { borderTopColor: c.border, backgroundColor: c.bg, paddingBottom: space.lg },
        ]}
      >
        <Button
          label={saving ? t.add.registering : t.add.register}
          onPress={() => void onSave()}
          busy={saving}
          disabled={!name.trim() || !dest}
        />
      </View>

      {pickerOpen && (
        <MovePicker
          visible
          title={t.addFlow.whereTitle}
          householdId={householdId}
          currentContainerId={dest?.containerId ?? null}
          currentLocationId={dest?.locationId ?? ''}
          busy={false}
          onClose={() => setPickerOpen(false)}
          onPick={(target: MoveTarget) => {
            void resolveTarget(target).then((d) => {
              if (d) onPickDest(d);
              setPickerOpen(false);
            });
          }}
        />
      )}
    </KeyboardSpacer>
  );
}

/** 피커가 돌려준 id 를 화면에 쓸 이름까지 붙여 해석한다 */
async function resolveTarget(target: MoveTarget): Promise<AddContext | null> {
  if ('containerId' in target) {
    const { data } = await supabase
      .from('containers')
      .select('id, name, location_id, locations(name)')
      .eq('id', target.containerId)
      .maybeSingle();
    if (!data) return null;
    return {
      locationId: data.location_id,
      locationName: (data.locations as { name?: string } | null)?.name ?? '',
      containerId: data.id,
      containerName: data.name ?? '',
    };
  }
  const { data } = await supabase
    .from('locations')
    .select('id, name')
    .eq('id', target.locationId)
    .maybeSingle();
  if (!data) return null;
  return { locationId: data.id, locationName: data.name ?? '', containerId: null, containerName: null };
}

const st = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },

  camActionSpacer: { width: 40 },
  // 이 상자가 곧 찍히는 범위다 — 저장 비율과 같게 유지할 것

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  /** ⚠ 폭만 잡는다 — 반대쪽 빈 자리(actionSpacer)와 같아야 제목이 가운데 온다 */
  topAction: { width: 40 },
  topTitle: { fontSize: type.subtitle, fontWeight: '700' },
  destRow: {
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  destMain: { flex: 1, gap: space.xs },
  destValue: { fontSize: type.body, fontWeight: '600' },
  destPick: { fontSize: type.small, fontWeight: '700' },
  nameField: { fontSize: type.subtitle },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xl, paddingTop: space.lg },
});
