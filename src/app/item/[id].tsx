import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconChevron } from '@/components/Icon';
import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { useToast } from '@/components/Toast';
import { Button, Field, Loading, Screen } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useCategoryList } from '@/features/category/api';
import {
  useAdjustQuantity,
  useDeleteItem,
  useItem,
  useItemPhotoUrl,
  useMoveItem,
  useUpdateItem,
} from '@/features/item/api';
import { MovePicker, type MoveTarget } from '@/features/item/MovePicker';
import { PhotoViewer } from '@/components/PhotoViewer';
import { CameraCapture } from '@/features/item/CameraCapture';
import { PHOTO_ASPECT, preparePhoto } from '@/features/item/photo';
import { useRemovePhoto, useSetPhoto } from '@/features/item/photoApi';
import { IMAGE_CACHE_POLICY } from '@/features/item/thumbs';
import { useLocations } from '@/features/storage/api';
import { useT } from '@/lib/i18n';
import { overlay, radius, type, useTheme, space, tracking } from '@/lib/theme';

/**
 * 물건 상세 — **수정 모드가 없다** (2026-08-31 사용자 요청).
 *
 * 보기 화면과 수정 화면이 따로 있으면 고칠 때마다 "수정" 을 먼저 눌러야 한다.
 * 물건 정보는 자주 손대는 것(수량, 이름, 메모)이라 그 한 번이 계속 쌓인다.
 * 그래서 모든 칸이 항상 입력칸이고, **포커스를 벗어날 때 바뀐 것만 저장**한다.
 *
 * ⚠ 저장 뒤 재조회가 와도 폼을 되돌리지 않는다. 되돌리면 입력 중이던 내용이 사라진다
 *   (이 프로젝트에서 이미 한 번 겪은 함정).
 */
export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = String(id);
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { activeId } = useHousehold();

  const item = useItem(itemId);
  const photo = useItemPhotoUrl(item.data?.photo_path);
  const locations = useLocations(activeId);
  const adjust = useAdjustQuantity(itemId);
  const update = useUpdateItem(itemId);
  const remove = useDeleteItem(itemId);
  const move = useMoveItem(itemId);
  const setPhoto = useSetPhoto('items', itemId, activeId);
  const removePhoto = useRemovePhoto('items', itemId);

  const [moving, setMoving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [viewer, setViewer] = useState(false);

  if (item.isLoading) {
    return (
      <Screen back title={t.item.fallbackTitle}>
        <Loading />
      </Screen>
    );
  }

  if (!item.data) {
    return (
      <Screen back title={t.item.fallbackTitle}>
        <View style={st.gone}>
          <Text style={[st.goneTitle, { color: c.text }]}>{t.item.gone}</Text>
          <Text style={[st.goneHint, { color: c.textMuted }]}>{t.item.goneHint}</Text>
          <Button label={t.common.home} onPress={() => router.replace('/')} variant="secondary" />
        </View>
      </Screen>
    );
  }

  const row = item.data;
  const locName = (locations.data ?? []).find((l) => l.id === row.location_id)?.name ?? '';
  const path = row.container?.name ? `${locName} › ${row.container.name}` : `${locName}${t.item.loose}`;

  function onDelete() {
    Alert.alert(t.item.deleteTitle, t.item.deleteBody(row.name), [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync();
            router.back();
          } catch (e) {
            Alert.alert(t.item.deleteFailed, e instanceof Error ? e.message : t.common.tryAgain);
          }
        },
      },
    ]);
  }

  return (
    <Screen back scroll={false} title={row.name}>
      <KeyboardSpacer style={st.flex}>
        <ScrollView
          style={st.flex}
          contentContainerStyle={st.body}
          keyboardShouldPersistTaps="handled"
        >
          {/*
            사진을 누르면 **크게 본다.** 전에는 곧장 카메라가 떠서, 자세히 보려던
            사람이 촬영 화면을 만났다(사용자 보고). 바꾸기는 뷰어 아래 줄에 있다.
            사진이 없을 때만 곧장 카메라로 간다 — 그땐 의도가 하나뿐이다.
          */}
          <Pressable onPress={() => (photo.data ? setViewer(true) : setPhotoSheet(true))}>
            {photo.data ? (
              <Image
                source={photo.data}
                style={[st.photo, { backgroundColor: c.sunk }]}
                contentFit="cover"
                transition={150}
                cachePolicy={IMAGE_CACHE_POLICY}
              />
            ) : (
              <View
                style={[st.photoAdd, { borderColor: c.borderStrong, backgroundColor: c.sunk }]}
              >
                <Text style={[st.photoAddText, { color: c.textMuted }]}>{t.item.addPhoto}</Text>
              </View>
            )}
          </Pressable>

          {/* 위치 — 제목급. 눌러서 그 박스로, 옆 버튼으로 이동 */}
          <View style={st.pathRow}>
            <Pressable
              style={st.flex}
              onPress={() =>
                row.container_id
                  ? router.push(`/container/${row.container_id}`)
                  : router.push(`/location/${row.location_id}`)
              }
              hitSlop={8}
            >
              <Text style={[st.pathHint, { color: c.textFaint }]}>{t.item.location}</Text>
              <Text style={[st.path, { color: c.text }]} numberOfLines={2}>
                {path}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMoving(true)}
              hitSlop={8}
              style={({ pressed }) => [
                st.moveBtn,
                { borderColor: c.borderStrong },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[st.moveText, { color: c.text }]}>
                {move.isPending ? t.item.moving : t.item.move}
              </Text>
            </Pressable>
          </View>

          {/* 수량 — 가장 자주 바뀌는 값 */}
          <View style={[st.qtyBox, { backgroundColor: c.card }]}>
            <Text style={[st.fieldLabel, { color: c.textFaint }]}>{t.item.quantity}</Text>
            <View style={st.qtyRow}>
              <Stepper label="−" onPress={() => adjust.mutate(-1)} disabled={row.quantity <= 0} />
              <Text style={[st.qtyValue, { color: row.quantity === 0 ? c.danger : c.text }]}>
                {t.common.qty(row.quantity)}
              </Text>
              <Stepper label="+" onPress={() => adjust.mutate(1)} />
            </View>
            {row.quantity === 0 && (
              <Text style={[st.zeroHint, { color: c.danger }]}>{t.item.zeroHint}</Text>
            )}
          </View>

          {/* 이 아래는 전부 항상 입력칸이다 */}
          <AutoField
            label={t.item.name}
            value={row.name}
            placeholder={t.item.namePlaceholder}
            onSave={(v) => update.mutateAsync({ name: v })}
            required
          />

          <CategoryPicker
            householdId={activeId}
            currentId={row.category_id}
            currentName={row.category?.name ?? null}
            onPick={(id) => update.mutateAsync({ category_id: id })}
          />

          <AutoField
            label={t.item.purchaseUrl}
            value={row.purchase_url ?? ''}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            onSave={(v) => update.mutateAsync({ purchase_url: v || null })}
            trailing={
              row.purchase_url ? (
                <Pressable onPress={() => void Linking.openURL(row.purchase_url!)} hitSlop={8}>
                  <Text style={[st.openLink, { color: c.accentText }]}>{t.shopping.buy}</Text>
                </Pressable>
              ) : null
            }
          />

          <AutoField
            label={t.item.note}
            value={row.note ?? ''}
            placeholder={t.item.notePlaceholder}
            multiline
            onSave={(v) => update.mutateAsync({ note: v || null })}
          />

          {/* ⚠ 이력은 **여기서 보여주지 않는다** (2026-09-01 사용자 요청).
              전에는 최근 3개를 펼쳐 두고 나머지를 접었는데, 그래도 자리를 먹어서
              정작 자주 보는 정보(수량·위치)가 밀려났다. 이력은 뭔가 이상할 때
              확인하는 것이라 한 단계 더 들어가게 두는 편이 맞다.
              덤으로 물건을 열 때 나가던 조회 왕복 하나가 사라졌다. */}
          <Pressable
            onPress={() => router.push(`/item/history/${itemId}`)}
            style={({ pressed }) => [
              st.navRow,
              { borderColor: c.border, backgroundColor: c.card },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[st.navRowText, { color: c.text }]}>{t.history.title}</Text>
            <IconChevron color={c.textFaint} />
          </Pressable>

          <View style={st.danger}>
            <Button
              label={t.item.deleteItem}
              onPress={onDelete}
              variant="danger"
              busy={remove.isPending}
            />
          </View>
        </ScrollView>
      </KeyboardSpacer>

      {/* 크게 보기 — 박스 상세와 **같은 컴포넌트** */}
      <PhotoViewer
        visible={viewer}
        source={photo.data}
        onClose={() => setViewer(false)}
        onChange={() => {
          setViewer(false);
          setPhotoSheet(true);
        }}
        onRemove={async () => {
          setViewer(false);
          try {
            await removePhoto.mutateAsync();
          } catch (e) {
            Alert.alert(
              t.camera.photoRemoveFailed,
              e instanceof Error ? e.message : t.common.tryAgain,
            );
          }
        }}
      />

      {photoSheet && (
        <Modal visible animationType="slide" onRequestClose={() => setPhotoSheet(false)}>
          <CameraCapture
            title={row.name}
            busy={setPhoto.isPending || removePhoto.isPending}
            onClose={() => setPhotoSheet(false)}
            onPhoto={async (uri) => {
              try {
                // 등록 화면과 같다 — 원본을 받아 여기서 처리한다
                await setPhoto.mutateAsync(await preparePhoto(uri));
                setPhotoSheet(false);
              } catch (e) {
                Alert.alert(
                  t.camera.photoSaveFailed,
                  e instanceof Error ? e.message : t.common.tryAgain,
                );
              }
            }}
            onRemove={async () => {
              try {
                await removePhoto.mutateAsync();
                setPhotoSheet(false);
              } catch (e) {
                Alert.alert(
                  t.camera.photoRemoveFailed,
                  e instanceof Error ? e.message : t.common.tryAgain,
                );
              }
            }}
          />
        </Modal>
      )}

      <MovePicker
        visible={moving}
        householdId={activeId}
        currentContainerId={row.container_id}
        currentLocationId={row.location_id}
        busy={move.isPending}
        onClose={() => setMoving(false)}
        onPick={async (target: MoveTarget, label: string) => {
          try {
            await move.mutateAsync(target);
            setMoving(false);
            /**
             * ⚠ 성공은 Alert 이 아니라 토스트로 알린다. 이동은 잦은 동작이라 확인을
             *   누르게 하면 잘된 일에 손을 한 번 더 쓰게 만든다. 실패는 그대로
             *   Alert 이다 — 사라지는 알림은 놓칠 수 있다.
             */
            toast(t.item.movedTo(label));
          } catch (e) {
            Alert.alert(t.item.moveFailed, e instanceof Error ? e.message : t.common.tryAgain);
          }
        }}
      />
    </Screen>
  );
}

/**
 * 항상 편집 가능한 한 줄.
 *
 * ⚠ `value` prop 이 바뀌면 **받아들인다 — 단, 지금 건드리고 있지 않을 때만.**
 *   무조건 덮어쓰면 입력 중이던 내용이 재조회에 지워지고, 무조건 무시하면 다른
 *   기기(또는 방금 내가 한 저장)의 결과가 화면에 영영 안 나타난다. 그래서
 *   **포커스가 없고 아직 저장 안 된 수정도 없을 때만** 새 값을 따라간다.
 *
 * ⚠⚠ 저장 시점이 **두 개**다. 포커스를 벗어날 때, 그리고 **화면을 떠날 때.**
 *   전에는 포커스를 벗어날 때뿐이었다. 그런데 메모는 여러 줄이라 키보드에 '완료'
 *   가 없다 — 다 쓰고 뒤로가기를 누르는 것이 자연스러운 흐름인데, 그러면 포커스를
 *   벗어나는 순간이 오지 않고 **입력한 내용이 조용히 사라졌다**(사용자 보고
 *   2026-09-02: "메모 입력하고 뒤로가기 누르니깐 저장이 안되던데").
 *
 *   화면이 사라진 **뒤**(언마운트)에 저장하면 안 된다. react-query 의 onSuccess 는
 *   컴포넌트에 매여 있어서, 그때는 DB 만 바뀌고 목록 캐시가 갱신되지 않는다 —
 *   저장은 됐는데 목록엔 옛 값이 보이는, 더 나쁜 상태가 된다. 그래서 아직 살아 있는
 *   **포커스를 잃는 시점**(useFocusEffect 의 cleanup)에 저장한다.
 */
function AutoField({
  label,
  value,
  placeholder,
  multiline,
  required,
  keyboardType,
  autoCapitalize,
  trailing,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  keyboardType?: 'url';
  autoCapitalize?: 'none';
  trailing?: React.ReactNode;
  onSave: (v: string) => Promise<unknown>;
}) {
  const { c } = useTheme();
  const t = useT();
  const [draft, setDraft] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const focused = useRef(false);
  const seen = useRef(value);
  useEffect(() => {
    const prev = seen.current;
    if (value === prev) return;
    seen.current = value;
    if (focused.current) return; // 지금 타이핑 중이면 건드리지 않는다
    // 아직 저장 안 된 수정이 있으면 그대로 둔다. 함수형 갱신이라 draft 를 의존성에
    // 넣지 않아도 되고, 그래서 이 effect 는 value 가 바뀔 때만 돈다.
    setDraft((d) => (d.trim() === prev.trim() ? value : d));
  }, [value]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    if (required && !next) {
      setDraft(value); // 필수 칸을 비우면 되돌린다
      return;
    }
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
      setTimeout(() => setState('idle'), 1400);
    } catch (e) {
      setDraft(value);
      setState('idle');
      Alert.alert(t.item.savedFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }, [draft, value, required, onSave, t]);

  /**
   * 화면을 떠날 때 한 번 더. `commit` 은 매 입력마다 새로 만들어지므로 ref 로
   * **가장 최근 것**을 붙잡아 둔다 — 옛 클로저를 부르면 옛 draft 를 저장한다.
   */
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);
  useFocusEffect(
    useCallback(() => () => {
      void commitRef.current();
    }, []),
  );

  return (
    <View style={st.field}>
      <View style={st.fieldHead}>
        <Text style={[st.fieldLabel, { color: c.textFaint }]}>{label}</Text>
        {state === 'saved' && <Text style={[st.savedTag, { color: c.ok }]}>{t.item.saved}</Text>}
        {trailing}
      </View>
      <Field
        value={draft}
        onChangeText={setDraft}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          void commit();
        }}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

/**
 * 카테고리 고르기 (AC-C7).
 *
 * ⚠ 타이핑 칸이 아니다. 만들어 둔 것 중에서만 고른다.
 *
 * 칩을 늘어놓지 않고 **한 줄 select** 로 바꿨다(2026-08-31 사용자 요청):
 * 카테고리가 늘어나면 칩이 화면을 몇 줄씩 먹는데, 물건 상세에서 카테고리는
 * 자주 바꾸는 값이 아니다. 지금 값만 보이고 누르면 시트가 올라오는 편이 맞다.
 * 옆의 ⚙ 로 관리 화면에 바로 간다 — 없는 카테고리가 필요할 때 여기서 막히지 않는다.
 */
function CategoryPicker({
  householdId,
  currentId,
  currentName,
  onPick,
}: {
  householdId: string | null;
  currentId: string | null;
  currentName: string | null;
  onPick: (id: string | null) => Promise<unknown>;
}) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const list = useCategoryList(householdId);
  const [open, setOpen] = useState(false);
  const rows = list.data ?? [];

  return (
    <View style={st.field}>
      <Text style={[st.fieldLabel, { color: c.textFaint }]}>{t.item.category}</Text>
      <View style={st.selectRow}>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            st.select,
            { borderColor: c.border, backgroundColor: c.card },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[st.selectText, { color: currentName ? c.text : c.textFaint }]}
            numberOfLines={1}
          >
            {currentName ?? t.category.pickNone}
          </Text>
          <IconChevron color={c.textFaint} />
        </Pressable>
        {/* ⚠ 여기 있던 ⚙(카테고리 관리) 버튼을 뺐다 (2026-09-02 사용자 요청).
            아래 시트 맨 끝에 같은 입구가 있어 길이 두 개였다. 자주 쓰는 값도 아닌데
            줄 오른쪽을 차지해 이름이 좁아졌다. */}
      </View>

      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={st.backdrop} onPress={() => setOpen(false)}>
            <Pressable
              style={[
                st.sheet,
                { backgroundColor: c.bg, borderColor: c.border, paddingBottom: insets.bottom + 16 },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[st.sheetTitle, { color: c.textFaint }]}>{t.category.pickTitle}</Text>
              <ScrollView style={st.sheetScroll}>
                <Pressable
                  onPress={() => {
                    void onPick(null);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [st.option, pressed && { opacity: 0.6 }]}
                >
                  <Text
                    style={[st.optionText, { color: currentId === null ? c.accent : c.text }]}
                  >
                    {t.category.pickNone}
                  </Text>
                  {currentId === null && <Text style={[st.check, { color: c.accentText }]}>✓</Text>}
                </Pressable>
                {rows.map((cat) => {
                  const on = cat.id === currentId;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => {
                        void onPick(cat.id);
                        setOpen(false);
                      }}
                      style={({ pressed }) => [
                        st.option,
                        { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[st.optionText, { color: on ? c.accent : c.text }]}>
                        {cat.name}
                      </Text>
                      {on && <Text style={[st.check, { color: c.accentText }]}>✓</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {/* 목록이 비었을 때 막다른 골목이 되지 않게 (R-C3) */}
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.push('/categories');
                }}
                style={({ pressed }) => [
                  st.option,
                  { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={[st.optionText, { color: c.accentText }]}>{t.category.manage}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function Stepper({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        st.stepper,
        { borderColor: c.borderStrong },
        (pressed || disabled) && { opacity: 0.4 },
      ]}
    >
      <Text style={[st.stepperText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}


const st = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: space.xl, paddingBottom: space.giant, gap: space.lg },
  photo: { width: '100%', aspectRatio: PHOTO_ASPECT, borderRadius: radius.md },
  photoAdd: {
    height: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: type.body, fontWeight: '600' },
  pathRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  pathHint: { fontSize: type.tiny, fontWeight: '600', letterSpacing: tracking.wide, marginBottom: space.xs },
  path: { fontSize: type.title, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: 25 },
  moveBtn: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  moveText: { fontSize: type.small, fontWeight: '600' },
  qtyBox: { borderRadius: radius.md, padding: space.lg, gap: space.md },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyValue: { fontSize: type.display, fontWeight: '700', fontVariant: ['tabular-nums'] },
  zeroHint: { fontSize: type.caption },
  stepper: {
    width: 52,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { fontSize: type.h2, fontWeight: '600', lineHeight: 26 },
  field: { gap: space.xs },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fieldLabel: { fontSize: type.tiny, fontWeight: '600', letterSpacing: tracking.wide },
  savedTag: { fontSize: type.tiny, fontWeight: '700' },
  openLink: { fontSize: type.caption, fontWeight: '700', marginLeft: 'auto' },
  selectRow: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
  select: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  selectText: { flex: 1, fontSize: type.bodyStrong },
  backdrop: { flex: 1, backgroundColor: overlay.scrim, justifyContent: 'flex-end' },
  sheet: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: space.lg },
  sheetScroll: { maxHeight: 320 },
  sheetTitle: {
    fontSize: type.tiny,
    fontWeight: '700',
    letterSpacing: tracking.wide,
    textTransform: 'uppercase',
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  optionText: { fontSize: type.bodyStrong, fontWeight: '500' },
  check: { fontSize: type.subtitle, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  emptyCat: {
    borderStyle: 'dashed',
    borderRadius: radius.sm,
    paddingVertical: space.lg,
    alignItems: 'center',
  },
  emptyCatText: { fontSize: type.label, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space.md, paddingVertical: space.sm },
  /** 변경 이력으로 들어가는 줄 — 이 화면에서 이력은 목적지이지 내용이 아니다 */
  navRow: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navRowText: { fontSize: type.bodyStrong, fontWeight: '600' },
  danger: { marginTop: space.xxl },
  gone: { paddingHorizontal: space.xxl, paddingTop: space.max, gap: space.md },
  goneTitle: { fontSize: type.title, fontWeight: '700' },
  goneHint: { fontSize: type.body, lineHeight: 22, marginBottom: space.lg },
});
