import { Image, type ImageSource } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { IconCheck, IconChevron, IconMinus, IconPlus, IconTrash } from '@/components/Icon';
import { safeIcon, type IconName } from '@/features/category/icons';
import { KeyboardSpacer } from '@/components/KeyboardSpacer';
import { BottomSheet, SheetOption } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, FieldLabel, Loading, Screen, TextButton, titleText } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useEnsureActive } from '@/features/household/useEnsureActive';
import { useCategoryList } from '@/features/category/api';
import {
  useAdjustQuantity,
  useDeleteItem,
  useItem,
  useItemPhotoUrls,
  useMoveItem,
  useUpdateItem,
  type ItemPhoto,
} from '@/features/item/api';
import { MovePicker, type MoveTarget } from '@/features/item/MovePicker';
import { PhotoViewer } from '@/components/PhotoViewer';
import { CameraCapture } from '@/features/item/CameraCapture';
import { MAX_ITEM_PHOTOS, preparePhoto } from '@/features/item/photo';
import { PhotoGallery, type GallerySlide } from '@/features/item/PhotoGallery';
import { ExpirySheet } from '@/features/item/ExpirySheet';
import { daysUntil, expiryTone } from '@/features/item/expiry';
import { nudgeReminderPermission } from '@/features/item/reminders';
import { useAddItemPhotos, useRemoveItemPhoto, useReorderItemPhotos, useSetItemCover } from '@/features/item/photoApi';
import { IMAGE_CACHE_POLICY, useThumbUrls } from '@/features/item/thumbs';
import {
  dropPendingPhoto,
  retryPendingPhoto,
  usePendingPhotos,
} from '@/features/item/photoQueue';
import { useLocations } from '@/features/storage/api';
import { useT } from '@/lib/i18n';
import { overlay, radius, type, useTheme, space, tracking, leading } from '@/lib/theme';

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
/** ⚠ 렌더마다 새 배열을 만들면 위 `useEffect([photos])` 가 매번 돈다 */
const NO_PHOTOS: ItemPhoto[] = [];

export default function ItemDetailScreen() {
  const { id, justCreated } = useLocalSearchParams<{ id: string; justCreated?: string }>();
  const itemId = String(id);
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const { activeId } = useHousehold();

  const item = useItem(itemId);
  // 다른 공간의 물건이면(알림 탭·딥링크) 그 공간으로 바꾼다 — 장소 목록·이동이 activeId 를 쓴다 (2026-09-09)
  useEnsureActive(item.data?.household_id, (h) => toast(t.space.switched(h.name)));
  const locations = useLocations(activeId);
  const adjust = useAdjustQuantity(itemId);
  const update = useUpdateItem(itemId);
  const remove = useDeleteItem(itemId);
  const move = useMoveItem(itemId);

  /* ── 사진 여러 장 (2026-09-08) ─────────────────────────────────────
     서버에 있는 장들(`photos`) + 아직 올라가는 중인 장들(큐) + 방금 찍어 처리 중인 장들.
     셋을 **한 줄**에 그린다 — 따로 그리면 "사진이 사라졌다" 가 되돌아온다. */
  const photos = item.data?.photos ?? NO_PHOTOS;
  const fullUrls = useItemPhotoUrls(photos.map((p) => p.photo_path));
  const thumbs = useThumbUrls();
  useEffect(() => {
    thumbs.ensure(photos.map((p) => p.thumb_path));
  }, [photos, thumbs]);
  const addPhotos = useAddItemPhotos(itemId, activeId);
  const removeItemPhoto = useRemoveItemPhoto(itemId);
  const setCover = useSetItemCover(itemId);
  const reorder = useReorderItemPhotos(itemId);
  /**
   * 등록할 때 찍은 사진이 아직 안 올라갔는가 (2026-09-06).
   *
   * ⚠ 이 자리가 비어 있으면 "사진 없이 등록했나 보다" 로 읽힌다. 실제로는 올라가는
   *   중이거나 **실패한 채 방치된 것**이었고, 그래서 사진이 사라진 것으로 보였다.
   *   상태를 보여주고 다시 시도할 길을 여기 둔다 — 사용자가 도착하는 화면이 여기다.
   */
  const pending = usePendingPhotos(itemId);
  /** 셔터를 누른 뒤 `preparePhoto` 가 도는 장수 — 그동안도 자리를 보여 준다 */
  const [preparing, setPreparing] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  /** 썸네일을 끄는 동안 — 화면 스크롤을 잠근다 (PhotoGallery.onDragStateChange 주석) */
  const [draggingPhoto, setDraggingPhoto] = useState(false);

  const insets = useSafeAreaInsets();

  const [moving, setMoving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [viewer, setViewer] = useState(false);
  const [expirySheet, setExpirySheet] = useState(false);

  /**
   * **등록 직후인가** (2026-09-02 사용자 요청).
   *
   *   `celebrate` — 축하 팝업을 한 번 띄운다. 예전엔 토스트였는데 "등록된 느낌이
   *                 약하다" 고 했다. 등록은 이 앱에서 가장 중요한 한 순간이라 화면
   *                 구석에서 스쳐 지나가면 안 된다.
   *   `fresh`     — 이 화면에 머무는 동안 아래에 "같은 자리에 또 등록" 을 띄운다.
   *
   * ⚠ 두 값 모두 **첫 렌더에서 굳힌다.** 바로 아래에서 파라미터를 지우기 때문에,
   *   굳히지 않으면 지운 순간 버튼까지 함께 사라진다.
   *
   * ⚠ 파라미터를 지우는 이유: 신호가 남아 있으면 이 화면이 다시 그려질 때
   *   (안드로이드가 메모리 때문에 되살리는 경우 등) 팝업이 또 뜬다.
   *   "나갔다가 다시 들어가면 안 뜨게" 가 요청이었다.
   */
  const [fresh] = useState(() => justCreated === '1');
  const [celebrate, setCelebrate] = useState(() => justCreated === '1');
  useEffect(() => {
    if (justCreated === '1') router.setParams({ justCreated: '' });
  }, [justCreated, router]);

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

  // 큐가 끝나 서버 목록에 들어온 장은 큐 쪽을 그리지 않는다 (재조회와 큐 정리 사이의 겹침)
  const known = new Set(photos.map((p) => p.id));
  const waiting = pending.filter((j) => !known.has(j.photoId));
  const slides: GallerySlide[] = [
    ...photos.map((p) => ({
      key: p.id,
      // 큰 사진이 아직 서명 전이면 썸네일로 먼저 그린다 — 빈 칸보다 낫다
      source: fullUrls.data?.[p.photo_path] ?? thumbs.get(p.thumb_path),
    })),
    ...waiting.map((j) => ({ key: j.photoId, source: { uri: j.thumbUri }, status: j.state })),
    ...Array.from({ length: preparing }, (_, i) => ({
      key: `preparing-${i}`,
      status: 'uploading' as const,
    })),
  ];
  const total = slides.length;
  const canAdd = total < MAX_ITEM_PHOTOS;
  /** 다음에 붙일 장의 순서 — 서버·큐를 통틀어 마지막 뒤 */
  const nextOrder =
    Math.max(-1, ...photos.map((p) => p.sort_order), ...waiting.map((j) => j.sortOrder)) + 1;
  /** 뷰어는 서버에 있는 장만 넘긴다 — 큐의 장은 크게 볼 원본이 아직 없다 */
  const viewerSources = photos
    .map((p) => fullUrls.data?.[p.photo_path] ?? thumbs.get(p.thumb_path))
    .filter((x): x is NonNullable<typeof x> => !!x);

  function openCamera() {
    if (!canAdd) {
      Alert.alert(t.photo.limitTitle, t.photo.limitBody(MAX_ITEM_PHOTOS));
      return;
    }
    setPhotoSheet(true);
  }

  /** 찍은 원본 → 처리 → 끈질긴 큐에. 카메라는 열어 둔 채 계속 찍을 수 있다 */
  function onShot(uri: string) {
    const order = nextOrder + preparing; // 처리 중인 장 뒤에 붙는다
    setPreparing((n) => n + 1);
    void (async () => {
      try {
        const prepared = await preparePhoto(uri);
        await addPhotos.mutateAsync({ photos: [prepared], nextOrder: order });
      } catch (e) {
        Alert.alert(t.camera.photoSaveFailed, e instanceof Error ? e.message : t.common.tryAgain);
      } finally {
        setPreparing((n) => n - 1);
      }
    })();
  }

  async function onRemovePhoto(p: ItemPhoto) {
    try {
      await removeItemPhoto.mutateAsync(p);
      setPhotoIndex((i) => Math.max(0, Math.min(i, photos.length - 2)));
    } catch (e) {
      Alert.alert(t.camera.photoRemoveFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  /** 순서 편집 — `to` 자리로 옮긴 새 순서를 통째로 보낸다 (0 이면 곧 대표 지정) */
  function onMovePhoto(from: number, to: number) {
    if (from === to || !photos[from] || to < 0 || to >= photos.length) return;
    const ids = photos.map((p) => p.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setPhotoIndex(to);
    reorder.mutate(ids, {
      onError: (e) =>
        Alert.alert(t.item.savedFailed, e instanceof Error ? e.message : t.common.tryAgain),
    });
  }

  async function onSetCover(p: ItemPhoto) {
    try {
      const minOrder = Math.min(...photos.map((x) => x.sort_order));
      await setCover.mutateAsync({ photoId: p.id, minOrder });
      setPhotoIndex(0);
    } catch (e) {
      Alert.alert(t.item.savedFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  const locName = (locations.data ?? []).find((l) => l.id === row.location_id)?.name ?? '';
  const path = row.container?.name ? `${locName} › ${row.container.name}` : `${locName}${t.item.loose}`;
  /**
   * "또 등록하기" 에 쓰는 자리 이름.
   *
   * ⚠ `path` 를 그대로 쓰지 않는다. 낱개 물건의 `path` 는 "신발장 · 낱개" 라서
   *   "'신발장 · 낱개'에 물건 더 등록하기" 가 된다 — 자리 이름이 아니라 설명이다.
   */
  const here = row.container?.name ? `${locName} › ${row.container.name}` : locName;

  /**
   * ⚠ 실패를 **반드시 알린다.** 숫자가 누른 즉시 바뀌므로(낙관적 갱신), 조용히 실패하면
   *   숫자가 슬그머니 되돌아가 "내가 잘못 눌렀나" 가 된다. 되돌리기는 훅이 한다.
   */
  function onAdjust(delta: number) {
    adjust.mutate(delta, {
      onError: (e) =>
        Alert.alert(t.item.qtyFailed, e instanceof Error ? e.message : t.common.tryAgain),
    });
  }

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
    <Screen
      back
      scroll={false}
      titleNode={<TitleField value={row.name} onSave={(v) => update.mutateAsync({ name: v })} />}
      /**
       * ⚠ 지우기는 **제목 줄 오른쪽의 작은 아이콘**이다 (2026-09-02 사용자 요청).
       *   본문 끝에 빨간 큰 버튼으로 두었더니 화면에서 제일 눈에 띄는 것이 "지우기" 가
       *   됐다 — 이 화면에서 자주 하는 일은 수량·이름 고치기이지 지우는 게 아니다.
       *
       * ⚠ 아이콘만 두므로 `accessibilityLabel` 로 이름을 붙인다. 그림만으로는
       *   화면 낭독기에서 "버튼" 이라고만 읽힌다.
       *
       * ⚠ 제목 줄은 글자끼리 밑선을 맞추려고 `alignItems: 'flex-end'` 다. 아이콘에는
       *   밑선이 없어서 그대로 두면 제목보다 아래로 처져 **틀어져 보인다**(실기기
       *   확인, 사용자 지적). `alignSelf` 로 이 버튼만 가운데에 맞춘다.
       */
      action={
        <Pressable
          onPress={onDelete}
          disabled={remove.isPending}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t.item.deleteItem}
          style={({ pressed }) => [
            st.trashBtn,
            (pressed || remove.isPending) && { opacity: 0.4 },
          ]}
        >
          <IconTrash size={24} color={c.danger} />
        </Pressable>
      }
    >
      <KeyboardSpacer style={st.flex}>
        <ScrollView
          style={st.flex}
          contentContainerStyle={st.body}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!draggingPhoto}
        >
          {/*
            사진을 누르면 **크게 본다.** 전에는 곧장 카메라가 떠서, 자세히 보려던
            사람이 촬영 화면을 만났다(사용자 보고). 추가·대표·지우기는 뷰어와 썸네일 줄에 있다.
            사진이 없을 때만 곧장 카메라로 간다 — 그땐 의도가 하나뿐이다.
          */}
          <PhotoGallery
            slides={slides}
            index={photoIndex}
            onIndexChange={setPhotoIndex}
            onPressSlide={(i) => {
              setPhotoIndex(i);
              setViewer(true);
            }}
            onAdd={openCamera}
            canAdd={canAdd}
            onRetry={(key) => retryPendingPhoto(key)}
            onMoveSlide={onMovePhoto}
            onDragStateChange={setDraggingPhoto}
          />
          {/* 실패한 채 남은 장은 포기할 길도 있어야 한다 — 없으면 "실패" 가 영원히 붙어 있다 */}
          {waiting.some((j) => j.state === 'failed') && (
            <View style={st.failedRow}>
              {waiting
                .filter((j) => j.state === 'failed')
                .map((j) => (
                  <TextButton
                    key={j.photoId}
                    label={t.photo.discard}
                    size="small"
                    tone="danger"
                    onPress={() => dropPendingPhoto(j.photoId)}
                  />
                ))}
            </View>
          )}

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
              <FieldLabel style={st.pathHint}>{t.item.location}</FieldLabel>
              <Text style={[st.path, { color: c.text }]} numberOfLines={2}>
                {path}
              </Text>
            </Pressable>
            <Button
              size="small"
              variant="secondary"
              label={move.isPending ? t.item.moving : t.item.move}
              onPress={() => setMoving(true)}
            />
          </View>

          {/* 수량 — 가장 자주 바뀌는 값 */}
          <View style={[st.qtyBox, { backgroundColor: c.card }]}>
            <FieldLabel>{t.item.quantity}</FieldLabel>
            <View style={st.qtyRow}>
              <Stepper kind="minus" onPress={() => onAdjust(-1)} disabled={row.quantity <= 0} />
              <Text style={[st.qtyValue, { color: row.quantity === 0 ? c.danger : c.text }]}>
                {t.common.qty(row.quantity)}
              </Text>
              <Stepper kind="plus" onPress={() => onAdjust(1)} />
            </View>
            {row.quantity === 0 && (
              <Text style={[st.zeroHint, { color: c.danger }]}>{t.item.zeroHint}</Text>
            )}
          </View>

          {/* 이 아래는 전부 항상 입력칸이다 */}
          <CategoryPicker
            householdId={activeId}
            currentId={row.category_id}
            currentName={row.category?.name ?? null}
            currentColor={row.category?.color ?? null}
            currentIcon={row.category?.icon ? safeIcon(row.category.icon) : null}
            onPick={(id) => update.mutateAsync({ category_id: id })}
          />

          {/* 소비기한 (2026-09-08) — 카테고리처럼 한 줄 select. 누르면 시트에서 고른다 */}
          <ExpiryRow value={row.expires_on} onPress={() => setExpirySheet(true)} />

          <AutoField
            label={t.item.purchaseUrl}
            value={row.purchase_url ?? ''}
            placeholder="https://"
            keyboardType="url"
            autoCapitalize="none"
            onSave={(v) => update.mutateAsync({ purchase_url: v || null })}
            trailing={
              row.purchase_url ? (
                <TextButton
                  label={t.shopping.buy}
                  size="small"
                  onPress={() => void Linking.openURL(row.purchase_url!)}
                  style={st.openLink}
                />
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

        </ScrollView>

        {/*
          등록 직후에만 뜨는 "같은 자리에 또 등록" (2026-09-02 사용자 요청).

          왜 필요한가: 물건은 대개 **몰아서** 넣는다. 한 박스를 정리하는 동안 여러 개를
          넣게 되는데, 그때마다 박스 화면으로 되돌아가는 것은 군더더기다.

          ⚠ **키보드를 따라 올라가는 자리**에 둔다(KeyboardSpacer 안, 스크롤 뒤).
            화면 바닥에 띄워 두면 메모를 입력할 때 키보드 위에 겹쳐 입력칸을 덮는다.

          ⚠ `push` 가 아니라 `replace` 다. 이어서 등록하면 등록→상세→등록→상세… 로
            스택이 계속 쌓여 나중에 뒤로가기를 그만큼 눌러야 한다. 바꿔치우면 몇 개를
            넣든 뒤로가기 한 번에 원래 있던 화면으로 돌아간다.
        */}
        {fresh && (
          <View
            style={[
              st.againBar,
              {
                backgroundColor: c.bg,
                borderTopColor: c.border,
                paddingBottom: insets.bottom + space.md,
              },
            ]}
          >
            <Pressable
              onPress={() =>
                router.replace(
                  row.container_id ? `/add/${row.container_id}` : `/add/${row.location_id}?loose=1`,
                )
              }
              style={({ pressed }) => [
                st.againPill,
                { borderColor: c.accentText },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={[st.againText, { color: c.accentText }]} numberOfLines={1}>
                {t.item.addMoreHere(here)}
              </Text>
              <IconChevron color={c.accentText} />
            </Pressable>
          </View>
        )}
      </KeyboardSpacer>

      {/* 크게 보기 — 박스 상세와 **같은 컴포넌트**. 여기서 넘기면 아래 썸네일 줄도 따라온다 */}
      <PhotoViewer
        visible={viewer}
        sources={viewerSources}
        index={Math.min(photoIndex, Math.max(0, viewerSources.length - 1))}
        onIndexChange={setPhotoIndex}
        onClose={() => setViewer(false)}
        onAdd={() => {
          setViewer(false);
          openCamera();
        }}
        onSetCover={(i) => {
          const p = photos[i];
          if (p) void onSetCover(p);
        }}
        onRemove={(i) => {
          const p = photos[i];
          if (!p) return;
          if (photos.length <= 1) setViewer(false); // 마지막 장을 지우면 볼 것이 없다
          void onRemovePhoto(p);
        }}
      />

      {photoSheet && (
        <Modal visible animationType="slide" onRequestClose={() => setPhotoSheet(false)}>
          {/*
            여러 장 모드 — 찍어도 카메라가 닫히지 않고 오른쪽 위에 장수가 쌓인다.
            "완료" 로 돌아온다. 처리·업로드는 배경에서 돌고 상세가 그 상태를 보여 준다.
            ⚠ 10장이 차면 셔터를 막는다(busy) — 서버(t60)가 11장째를 튕기지만, 찍고 나서
              튕기면 그 사진은 버려진다.
          */}
          <CameraCapture
            title={row.name}
            shotCount={total}
            busy={!canAdd}
            onClose={() => setPhotoSheet(false)}
            onPhoto={onShot}
          />
        </Modal>
      )}

      <ExpirySheet
        visible={expirySheet}
        value={row.expires_on}
        busy={update.isPending}
        onClose={() => setExpirySheet(false)}
        onSave={async (ymd) => {
          try {
            await update.mutateAsync({ expires_on: ymd });
            setExpirySheet(false);
            // 기한을 넣는 순간이 알림이 필요한 순간이다 — 아직 안 물어봤으면 여기서 묻는다
            if (ymd) void nudgeReminderPermission();
          } catch (e) {
            Alert.alert(t.item.savedFailed, e instanceof Error ? e.message : t.common.tryAgain);
          }
        }}
      />

      <CreatedDialog
        visible={celebrate}
        name={row.name}
        path={here}
        photo={slides[0]?.source ?? null}
        onClose={() => setCelebrate(false)}
      />

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
 * 등록 직후의 축하 팝업 (2026-09-02 사용자 요청).
 *
 * ⚠ 예전에는 토스트였다. "toast는 너무 등록된 느낌이 약해" — 맞는 지적이다.
 *   토스트는 화면 구석에 잠깐 떴다 사라져서, 처음 쓰는 사람은 등록이 끝난 건지
 *   아직 진행 중인지 알 수 없었다("이게 등록된 거야?" 라는 실사용 반응).
 *
 * ⚠ **방금 넣은 물건의 사진과 이름을 함께 보여 준다.** "등록되었습니다" 라는 글자만
 *   띄우면 무엇이 등록됐는지는 여전히 본인이 확인해야 한다. 사진이 뜨면 그 자체가
 *   증거다 — 그 정보는 이미 이 화면에 다 있어서 따로 실어 나를 것도 없다.
 *
 * ⚠ 바깥을 눌러도 닫힌다. 축하는 결정이 아니라 알림이라 확인을 강요할 이유가 없다.
 */
function CreatedDialog({
  visible,
  name,
  path,
  photo,
  onClose,
}: {
  visible: boolean;
  name: string;
  path: string;
  photo: ImageSource | null | undefined;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const t = useT();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.celebBack} onPress={onClose}>
        <Pressable
          style={[st.celebCard, { backgroundColor: c.bg, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/*
            ⚠ 사진이 없으면 **빈 네모를 두지 않는다.** 처음엔 자리를 지키려고 회색
              네모를 뒀는데, 실기기에서 보니 카드에 구멍이 뚫린 것처럼 보였다.
              사진이 없을 때는 체크 하나만 크게 둔다 — 알릴 것은 "됐다" 이지
              "사진이 없다" 가 아니다.
          */}
          {photo ? (
            <View style={st.celebArt}>
              <Image
                source={photo}
                style={[st.celebPhoto, { backgroundColor: c.sunk }]}
                contentFit="cover"
                cachePolicy={IMAGE_CACHE_POLICY}
              />
              <View style={[st.celebMark, { backgroundColor: c.ok, borderColor: c.bg }]}>
                <IconCheck size={22} color={overlay.fg} />
              </View>
            </View>
          ) : (
            <View style={[st.celebSolo, { backgroundColor: c.ok }]}>
              <IconCheck size={44} color={overlay.fg} />
            </View>
          )}

          <Text style={[st.celebTitle, { color: c.text }]}>{t.item.createdTitle}</Text>
          <Text style={[st.celebName, { color: c.text }]} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[st.celebWhere, { color: c.textMuted }]} numberOfLines={2}>
            {t.item.createdWhere(path)}
          </Text>

          <View style={st.celebBtn}>
            <Button label={t.item.createdOk} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
/**
 * "고치면 알아서 저장된다" 는 이 화면의 규칙을 한 곳에 모은 것.
 *
 * ⚠ 아래 `AutoField`(줄 단위 칸)와 `TitleField`(제목)가 **같은 규칙**을 써야 한다.
 *   각자 구현하면 한쪽만 고쳐진다 — 실제로 메모 저장 버그를 두 번 겪었다.
 */
function useAutoSave(value: string, onSave: (v: string) => Promise<unknown>, required?: boolean) {
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

  return {
    draft,
    setDraft,
    state,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      void commit();
    },
  };
}

/**
 * 제목을 **눌러서 고친다** (2026-09-02 사용자 요청).
 *
 * ⚠ 예전에는 제목이 글자이고 본문에 "이름" 칸이 따로 있었다. 같은 값이 한 화면에
 *   두 번 나와서, 어느 쪽을 고쳐야 하는지 알 수 없었다. 제목 자체를 입력칸으로 만들면
 *   중복이 사라지고 "모든 칸이 항상 입력칸" 이라는 이 화면의 규칙과도 맞는다.
 *
 * ⚠ 모양은 `titleText`(Screen 의 제목 글씨)를 그대로 쓴다. 값을 여기에 다시 적으면
 *   제목 크기를 바꿀 때 한쪽만 바뀐다.
 *
 * ⚠ 줄바꿈은 지운다. `multiline` 이라 긴 이름이 두 줄로 보이는데(글자였을 때와 같다),
 *   그 대가로 키보드에 줄바꿈 키가 생긴다. 이름에 줄바꿈이 들어가면 목록·검색·라벨이
 *   전부 어그러진다.
 */
function TitleField({ value, onSave }: { value: string; onSave: (v: string) => Promise<unknown> }) {
  const { c } = useTheme();
  const t = useT();
  const a = useAutoSave(value, onSave, true);

  return (
    <TextInput
      value={a.draft}
      onChangeText={(v) => a.setDraft(v.replace(/\n/g, ' '))}
      onFocus={a.onFocus}
      onBlur={a.onBlur}
      placeholder={t.item.namePlaceholder}
      placeholderTextColor={c.textFaint}
      multiline
      submitBehavior="blurAndSubmit"
      style={[titleText, st.titleInput, { color: c.text }]}
    />
  );
}

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
  const a = useAutoSave(value, onSave, required);

  return (
    <View style={st.field}>
      <View style={st.fieldHead}>
        <FieldLabel>{label}</FieldLabel>
        {a.state === 'saved' && <Text style={[st.savedTag, { color: c.ok }]}>{t.item.saved}</Text>}
        {trailing}
      </View>
      <Field
        value={a.draft}
        onChangeText={a.setDraft}
        onFocus={a.onFocus}
        onBlur={a.onBlur}
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
  currentColor,
  currentIcon,
  onPick,
}: {
  householdId: string | null;
  currentId: string | null;
  currentName: string | null;
  currentColor: string | null;
  currentIcon: IconName | null;
  onPick: (id: string | null) => Promise<unknown>;
}) {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const list = useCategoryList(householdId);
  const [open, setOpen] = useState(false);
  const rows = list.data ?? [];

  return (
    <View style={st.field}>
      <FieldLabel>{t.item.category}</FieldLabel>
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
        <BottomSheet label={t.category.pickTitle} onClose={() => setOpen(false)}>
          <ScrollView style={st.sheetScroll}>
            {/* ⚠ 타일 자리는 **항상 둔다** — 없으면 이 줄만 글자가 왼쪽으로 튄다 */}
            <SheetOption
              label={t.category.pickNone}
              leading={
                <View style={[st.optionTile, { backgroundColor: c.sunk }]}>
                  <IconMinus size={16} color={c.textFaint} />
                </View>
              }
              on={currentId === null}
              onPress={() => {
                void onPick(null);
                setOpen(false);
              }}
            />
            {rows.map((cat) => (
              /*
                ⚠ 목록에서 **카테고리 관리 화면과 같은 타일**을 쓴다. 거기서 색과
                  그림을 골라 놓고 여기서는 글자만 보이면, 고른 것이 어디에 쓰이는지
                  알 수 없다.
              */
              <SheetOption
                key={cat.id}
                label={cat.name}
                leading={
                  <View style={[st.optionTile, { backgroundColor: cat.color }]}>
                    <MaterialCommunityIcons name={cat.icon} size={16} color={overlay.fg} />
                  </View>
                }
                on={cat.id === currentId}
                divider
                onPress={() => {
                  void onPick(cat.id);
                  setOpen(false);
                }}
              />
            ))}
          </ScrollView>
          {/* 목록이 비었을 때 막다른 골목이 되지 않게 (R-C3) */}
          <SheetOption
            label={t.category.manage}
            accent
            divider
            onPress={() => {
              setOpen(false);
              router.push('/categories');
            }}
          />
        </BottomSheet>
      )}
    </View>
  );
}

/**
 * 소비기한 한 줄 — "2027. 3. 15.까지 · 188일 남음 (D-188)". 급할수록 붉다.
 * 기한이 없으면 "기한 없음" 을 흐리게 — 누르면 넣을 수 있다는 것이 보여야 한다.
 */
function ExpiryRow({ value, onPress }: { value: string | null; onPress: () => void }) {
  const { c } = useTheme();
  const t = useT();
  const days = value ? daysUntil(value) : null;
  const tone = days === null ? null : expiryTone(days);
  const color =
    tone === null ? c.textFaint : tone === 'far' ? c.text : tone === 'soon' ? c.accentText : c.danger;
  return (
    <View style={st.field}>
      <FieldLabel>{t.expiry.title}</FieldLabel>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          st.select,
          { borderColor: c.border, backgroundColor: c.card },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[st.selectText, { color }]} numberOfLines={1}>
          {value && days !== null ? `${t.expiry.until(value)} · ${t.expiry.dLabel(days)}` : t.expiry.none}
        </Text>
        <IconChevron color={c.textFaint} />
      </Pressable>
    </View>
  );
}

/**
 * 수량 ±.
 *
 * ⚠ 예전에는 "−" · "+" **문자**를 받아 그렸다. 기기 폰트마다 굵기와 세로 위치가 달라
 *   `lineHeight` 로 손보정하고 있었다(2026-09-06 점검에서 걷어냈다). 그림으로 그리면
 *   보정이 필요 없고, 스크린리더에 읽을 이름도 붙일 수 있다.
 */
function Stepper({
  kind,
  onPress,
  disabled,
}: {
  kind: 'minus' | 'plus';
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={kind === 'minus' ? t.item.qtyDown : t.item.qtyUp}
      style={({ pressed }) => [
        st.stepper,
        { borderColor: c.borderStrong },
        (pressed || disabled) && { opacity: 0.4 },
      ]}
    >
      {kind === 'minus' ? (
        <IconMinus size={20} color={c.text} />
      ) : (
        <IconPlus size={20} color={c.text} />
      )}
    </Pressable>
  );
}


const st = StyleSheet.create({
  flex: { flex: 1 },
  /**
   * ⚠ 제목 입력칸. 크기·굵기는 `titleText` 가 준다 — 여기서는 **입력칸 기본 여백만**
   *   걷어낸다. 안 걷으면 글자였을 때보다 아래로 밀려 뒤로가기 줄과 간격이 달라진다.
   */
  titleInput: { flex: 1, padding: 0, margin: 0, textAlignVertical: 'center' },
  /** ⚠ 제목 줄의 밑선 맞춤에서 이 버튼만 빠져나온다. 위 주석 참조 */
  trashBtn: { alignSelf: 'center' },
  body: { paddingHorizontal: space.xl, paddingBottom: space.giant, gap: space.lg },
  /** 실패한 채 남은 장의 "이 사진 취소" 들 — 갤러리 바로 아래 한 줄 */
  failedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: -space.sm },
  pathRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  pathHint: { marginBottom: space.xs },
  path: { fontSize: type.title, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: leading.title },
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
  /* ⚠ 기호를 상자 가운데 앉히는 값이다 — 읽는 행간이 아니므로 `leading` 을 쓰지 않는다 */
  field: { gap: space.xs },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  savedTag: { fontSize: type.tiny, fontWeight: '700' },
  /** ⚠ 글자 크기·굵기는 TextButton 이 정한다 — 여기서는 자리만 민다 */
  openLink: { marginLeft: 'auto' },
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

  /* 등록 직후 아래에 붙는 띠 — "같은 자리에 또 등록" */
  againBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    paddingHorizontal: space.xl,
  },
  againPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
  },
  againText: { flexShrink: 1, fontSize: type.small, fontWeight: '700' },

  /* 등록 완료 팝업 */
  celebBack: {
    flex: 1,
    backgroundColor: overlay.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  celebCard: {
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.huge,
    alignItems: 'center',
    gap: space.sm,
  },
  celebArt: { marginBottom: space.sm },
  celebPhoto: { width: 96, height: 96, borderRadius: radius.lg },
  /** ⚠ 테두리 색은 카드 바탕과 같다 — 사진 위에 얹혔다는 것이 그 틈으로 읽힌다 */
  celebMark: {
    position: 'absolute',
    right: -space.sm,
    bottom: -space.sm,
    width: 34,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 사진이 없을 때 — 체크 하나만 크게 */
  celebSolo: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  celebTitle: { fontSize: type.title, fontWeight: '800', letterSpacing: tracking.tight },
  celebName: { fontSize: type.body, fontWeight: '700', textAlign: 'center' },
  celebWhere: { fontSize: type.small, textAlign: 'center' },
  celebBtn: { alignSelf: 'stretch', marginTop: space.md },
  sheetScroll: { maxHeight: 320 },
  optionTile: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  gone: { paddingHorizontal: space.xxl, paddingTop: space.max, gap: space.md },
  goneTitle: { fontSize: type.title, fontWeight: '700' },
  goneHint: { fontSize: type.body, lineHeight: leading.body, marginBottom: space.lg },
});
