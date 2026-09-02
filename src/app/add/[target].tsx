import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { useToast } from '@/components/Toast';
import { Button, Field } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { CameraCapture } from '@/features/item/CameraCapture';
import { MovePicker, type MoveTarget } from '@/features/item/MovePicker';
import { abandonCycle, markFirstInput } from '@/features/item/metrics';
import { PHOTO_ASPECT, preparePhoto, type PreparedPhoto } from '@/features/item/photo';
import { QUEUE_LIMIT, useRegisterQueue, type DraftItem } from '@/features/item/queue';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { useTheme, type, radius, overlay, space, tracking } from '@/lib/theme';

/**
 * 물건 등록 — **2단계** (2026-08-30 사용자 요청).
 *
 *   1단계: 카메라가 화면을 꽉 채운다. 찍거나 · 사진첩에서 고르거나 · 사진 없이 넘어간다.
 *   2단계: 사진을 확인하며 이름과 추가 정보를 넣고, "등록" 을 눌러야 저장된다.
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
  const toast = useToast();
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
   *   미리보기는 원본을 1:1 로 잘라 보여주므로 최종 결과와 같은 화면이 나온다.
   */
  const [rawUri, setRawUri] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<Promise<PreparedPhoto> | null>(null);
  /**
   * ⚠ 이름은 **부모가** 들고 있는다. "다시 찍기" 로 1단계에 다녀오면 FormStep 이
   *   언마운트되므로, 여기 없으면 입력하던 이름이 사라진다.
   */
  const [name, setName] = useState('');
  /** ⚠ 이름은 **부모가** 들고 있는다. "다시 찍기" 로 1단계에 다녀오면 FormStep 이
   *   언마운트되므로, 여기 없으면 입력하던 이름이 사라진다. */
  /** 2단계에서 고른 목적지. `/add/new` 로 들어왔을 때만 쓰인다 */
  const [picked, setPicked] = useState<AddContext | null>(null);

  const dest: AddContext | null = target === NEW ? picked : (ctx.data ?? null);

  useEffect(() => () => abandonCycle(), []);

  return step === 1 ? (
    <CameraCapture
      title={dest ? pathOf(dest, t) : ''}
      onClose={() => router.back()}
      onPhoto={(uri) => {
        setRawUri(uri);
        // 처리를 시작만 하고 기다리지 않는다. 실패는 등록 시점에 드러난다.
        setPreparing(preparePhoto(uri));
        setStep(2);
      }}
      onSkip={() => {
        setRawUri(null);
        setPreparing(null);
        setStep(2);
      }}
    />
  ) : (
    <FormStep
      previewUri={rawUri}
      preparing={preparing}
      name={name}
      onName={setName}
      dest={dest}
      canPickDest={target === NEW}
      householdId={activeId}
      queue={queue}
      onRetake={() => setStep(1)}
      onPickDest={setPicked}
      onDone={(id, name) => {
        /**
         * ⚠ 토스트를 **먼저** 띄우고 화면을 옮긴다. 토스트는 화면 트리 밖(루트)에
         *   그려지므로 이동해도 그대로 떠 있다 — 도착한 상세 화면 위에서 보인다.
         *   순서를 바꾸면 이 화면이 사라지며 호출이 묻힐 수 있다.
         */
        toast(t.item.created(name));
        router.replace(`/item/${id}`);
      }}
      onClose={() => router.back()}
    />
  );
}

function pathOf(d: AddContext, t: ReturnType<typeof useT>): string {
  return d.containerName ? `${d.locationName} › ${d.containerName}` : `${d.locationName}${t.add.noBox}`;
}

/* ───────────────────────────── 2단계: 폼 ───────────────────────────── */

function FormStep({
  previewUri,
  preparing,
  name,
  onName,
  dest,
  canPickDest,
  householdId,
  queue,
  onRetake,
  onPickDest,
  onDone,
  onClose,
}: {
  previewUri: string | null;
  preparing: Promise<PreparedPhoto> | null;
  name: string;
  onName: (v: string) => void;
  dest: AddContext | null;
  canPickDest: boolean;
  householdId: string | null;
  queue: ReturnType<typeof useRegisterQueue>;
  onRetake: () => void;
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

    setSaving(true);
    try {
      // 배경에서 돌던 이미지 처리를 여기서 거둔다. 대개 이미 끝나 있다.
      let photo: PreparedPhoto | null = null;
      if (preparing) {
        try {
          photo = await preparing;
        } catch (e) {
          // 사진 처리 실패로 등록을 막지 않는다 — 이름만으로도 물건은 저장돼야 한다 (AC3)
          if (__DEV__) console.warn('[add] 사진 처리 실패, 사진 없이 저장', e);
        }
      }
      // 행 저장만 기다린다. 사진 업로드는 배경에서 이어진다 (AC4)
      await queue.enqueueAndWaitForRow(draft, photo);
      abandonCycle();
      onDone(draft.id, draft.name);
    } catch (e) {
      Alert.alert(t.add.saveFailed, e instanceof Error ? e.message : t.common.tryAgain);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardSpacer style={[st.root, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={st.topBar}>
        <Pressable onPress={onClose} hitSlop={12}>
          <Text style={[st.topAction, { color: c.accentText }]}>{t.common.cancel}</Text>
        </Pressable>
        <Text style={[st.topTitle, { color: c.text }]}>{t.addFlow.step2Title}</Text>
        <View style={st.camActionSpacer} />
      </View>

      {/* ⚠ flex: 1 이 없으면 ScrollView 가 **내용 크기로** 잡혀서, 아래의 고정 푸터가
          화면 하단이 아니라 내용 바로 뒤에 붙는다 — 그래서 키보드에 잘렸다. */}
      <ScrollView
        style={st.fill}
        contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 찍은 사진. 누르면 1단계로 돌아가 다시 찍는다 */}
        <Pressable onPress={onRetake}>
          {previewUri ? (
            <>
              <Image
                source={{ uri: previewUri }}
                style={[st.preview, { backgroundColor: c.sunk }]}
                contentFit="cover"
              />
              <View style={st.previewBadge}>
                <Text style={st.previewBadgeText}>{t.addFlow.retake}</Text>
              </View>
            </>
          ) : (
            <View
              style={[
                st.previewEmpty,
                { borderColor: c.borderStrong, backgroundColor: c.sunk },
              ]}
            >
              <Text style={[st.previewEmptyText, { color: c.textMuted }]}>
                {t.addFlow.noPhoto} · {t.item.addPhoto}
              </Text>
            </View>
          )}
        </Pressable>

        {/* 어디에 둘지. `/add/new` 로 들어오면 여기서 정한다 */}
        <Pressable
          onPress={() => canPickDest && setPickerOpen(true)}
          style={[st.destRow, { borderColor: dest ? c.border : c.danger, backgroundColor: c.card }]}
        >
          <View style={st.destMain}>
            <Text style={[st.destLabel, { color: c.textFaint }]}>{t.addFlow.whereTitle}</Text>
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
  center: { alignItems: 'center', justifyContent: 'center' },

  camRoot: { flex: 1, backgroundColor: overlay.bg },
  camTop: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  camAction: { color: overlay.fg, fontSize: type.h2, fontWeight: '600', width: 40 },
  camActionSpacer: { width: 40 },
  camPath: {
    flex: 1,
    color: overlay.fg,
    fontSize: type.small,
    textAlign: 'center',
    textShadowColor: overlay.shadow,
    textShadowRadius: 6,
  },
  camHint: { color: overlay.faint, fontSize: type.body },
  camZoom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  camStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // 이 상자가 곧 찍히는 범위다 — 저장 비율과 같게 유지할 것
  camFrame: { overflow: 'hidden', borderRadius: radius.xs },
  camBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: space.xl,
  },
  camSideBtn: { alignItems: 'center', gap: space.xs, width: 76 },
  camSideIcon: { color: overlay.fg, fontSize: type.h1, lineHeight: 28 },
  camSideLabel: { color: overlay.faint, fontSize: type.caption },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: overlay.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: overlay.fg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
  },
  topAction: { fontSize: type.body, fontWeight: '600', width: 40 },
  topTitle: { fontSize: type.subtitle, fontWeight: '700' },
  preview: { width: '100%', aspectRatio: PHOTO_ASPECT, borderRadius: radius.md },
  previewBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: overlay.chip,
    borderRadius: radius.full,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  previewBadgeText: { color: overlay.fg, fontSize: type.caption, fontWeight: '600' },
  previewEmpty: {
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: { fontSize: type.label, fontWeight: '600' },
  destRow: {
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  destMain: { flex: 1, gap: space.xs },
  destLabel: { fontSize: type.tiny, fontWeight: '600', letterSpacing: tracking.wide },
  destValue: { fontSize: type.body, fontWeight: '600' },
  destPick: { fontSize: type.small, fontWeight: '700' },
  nameField: { fontSize: type.subtitle },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.xl, paddingTop: space.lg },
});
