import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconGear, IconPlus, IconX } from '@/components/Icon';
import { SelectionBar, BAR_SPACE } from '@/components/SelectionBar';
import { SettingsCard } from '@/components/SettingsCard';
import { Button, Empty, FieldLabel, IconButton, Loading, Screen, SectionLabel, TextButton } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useEnsureActive } from '@/features/household/useEnsureActive';
import { useAudit } from '@/features/history/api';
import { CardGrid, useCardWidth } from '@/components/CardGrid';
import { Fab } from '@/components/Fab';
import { PhotoViewer } from '@/components/PhotoViewer';
import { useToast } from '@/components/Toast';
import { ItemCard } from '@/features/item/ItemCard';
import { IMAGE_CACHE_POLICY, useThumbUrls } from '@/features/item/thumbs';
import { useItemPhotoUrl, useMoveItems } from '@/features/item/api';
import { MovePicker, type MoveTarget } from '@/features/item/MovePicker';
import { useSelection } from '@/features/item/selection';
import { CameraCapture } from '@/features/item/CameraCapture';
import { preparePhoto } from '@/features/item/photo';
import { useRemovePhoto, useSetPhoto } from '@/features/item/photoApi';
import {
  useContainerItems,
  useDeleteContainerById,
  useLocations,
  useMoveContainer,
  useUpdateContainer,
} from '@/features/storage/api';
import { BoxMovePicker } from '@/features/storage/BoxMovePicker';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { relTime } from '@/lib/time';
import { useTheme, type, radius, space, tracking, leading } from '@/lib/theme';

/** 컨테이너 한 건 조회. 목록을 거치지 않고 직접 가져온다 */
function useContainer(containerId: string) {
  return useQuery({
    queryKey: ['container', containerId],
    enabled: !!containerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('container_summary')
        // household_id: 다른 공간의 박스를 열었으면 그 공간으로 바꾸려고 (useEnsureActive)
        .select('id, household_id, location_id, name, qr_token, photo_path, thumb_path, item_count')
        .eq('id', containerId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export default function ContainerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const containerId = String(id);
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { activeId } = useHousehold();
  const toast = useToast();

  const container = useContainer(containerId);
  // 다른 공간의 박스면(QR·딥링크) 그 공간으로 바꾼다 — 아래 장소 목록·이동이 activeId 를 쓴다 (2026-09-09)
  useEnsureActive(container.data?.household_id, (h) => toast(t.space.switched(h.name)));
  const items = useContainerItems(containerId);
  const audit = useAudit('containers', containerId);
  const locations = useLocations(activeId);

  const location = (locations.data ?? []).find((l) => l.id === container.data?.location_id) ?? null;
  const list = items.data ?? [];

  // 검색 결과와 같은 줄을 쓴다 — 같은 물건이 화면마다 다르게 보이면 안 된다
  const thumbs = useThumbUrls();
  // ⚠ 의존성은 `list` 가 아니라 `items.data` 다. `?? []` 는 매 렌더 새 배열을 만들어서
  //   이펙트가 렌더마다 다시 돈다.
  useEffect(() => {
    thumbs.ensure((items.data ?? []).map((it) => it.thumb_path));
  }, [items.data, thumbs]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  /**
   * 내용물 여러 개를 골라 한 번에 옮기기 (2026-09-21).
   *
   * ⚠ id 배열을 `useMemo` 로 감싼다 — 렌더마다 새 배열이면 선택 훅의 파생값이
   *   매번 새 참조가 된다(selection.ts 의 주석 참고). 의존은 `list` 가 아니라
   *   `items.data` 다. `?? []` 가 매 렌더 새 배열을 만들기 때문이다.
   */
  const ids = useMemo(() => (items.data ?? []).map((it) => it.id), [items.data]);
  const sel = useSelection(ids);
  const [bulkMoving, setBulkMoving] = useState(false);
  const moveItems = useMoveItems();
  const [photoSheet, setPhotoSheet] = useState(false);
  const [viewer, setViewer] = useState(false);

  // 격자 치수는 `CardGrid` 한 곳에서 온다 — 화면마다 카드 폭이 다르면 안 된다
  const cardW = useCardWidth();
  // 박스도 모양이 제각각이라 사진이 있으면 찾기가 훨씬 쉽다 (사용자 요청)
  const boxPhoto = useItemPhotoUrl(container.data?.photo_path);
  const setPhoto = useSetPhoto('containers', containerId, activeId);
  const removePhoto = useRemovePhoto('containers', containerId);
  const updateContainer = useUpdateContainer(containerId);
  const moveContainer = useMoveContainer(containerId);
  const deleteContainer = useDeleteContainerById(containerId);

  function onDeleteBox() {
    const n = list.length;
    Alert.alert(
      t.container.deleteTitle,
      n > 0
        ? t.container.deleteWithItems(n, location?.name ?? '')
        : t.container.deleteEmpty,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContainer.mutateAsync();
              // QR 딥링크로 바로 들어왔으면 돌아갈 곳이 없다. 장소로 보낸다.
              router.replace(location ? `/location/${location.id}` : '/');
            } catch (e) {
              Alert.alert(t.container.deleteFailed, e instanceof Error ? e.message : t.common.tryAgain);
            }
          },
        },
      ],
    );
  }

  return (
    <Screen
      back
      float={
        /* ＋는 "물건 등록" 한 가지 뜻이다 — 고르는 중에 등록할 일은 없고 자리도 겹친다 */
        sel.active ? (
          <SelectionBar
            count={sel.picked.length}
            allPicked={sel.allPicked}
            busy={moveItems.isPending}
            onToggleAll={sel.toggleAll}
            onCancel={sel.exit}
            onMove={() => setBulkMoving(true)}
          />
        ) : (
          <Fab onPress={() => router.push(`/add/${containerId}`)} />
        )
      }
    >
      <View style={st.body}>
        {/* 박스 한 장 카드.
            이름과 경로를 따로 두면 "현관 팬트리 › 1" 과 "1" 이 두 번 나온다 —
            경로 하나로 합친다. 사진은 식별에 쓸 만큼 크게(라운드 사각형),
            등록 버튼까지 안에 넣어 화면 위쪽을 한 덩어리로 만든다. */}
        <View style={[st.card, { backgroundColor: c.card }]}>
          <View style={st.cardTop}>
            {/*
              ⚠ 사진이 없으면 **바로 카메라**로 간다. 뷰어를 열어 봐야 볼 게 없는
                검은 화면이고, 거기서 "+ 박스 사진 추가" 를 한 번 더 눌러야 했다.
                누르는 사람의 의도는 "사진을 넣겠다" 하나뿐인데 단계가 둘이었다.
            */}
            <Pressable onPress={() => (boxPhoto.data ? setViewer(true) : setPhotoSheet(true))}>
              <View style={[st.thumb, { backgroundColor: c.sunk }]}>
                {boxPhoto.data ? (
                  <Image
                    source={boxPhoto.data}
                    style={st.thumbImg}
                    contentFit="cover"
                    cachePolicy={IMAGE_CACHE_POLICY}
                  />
                ) : (
                  <IconPlus size={28} color={c.textFaint} />
                )}
              </View>
            </Pressable>

            <View style={st.cardMain}>
              <View style={st.cardTitleRow}>
                <Text style={[st.cardTitle, { color: c.text }]} numberOfLines={3}>
                  {location
                    ? `${location.name} › ${container.data?.name ?? ''}`
                    : (container.data?.name ?? '')}
                </Text>
                {/* 설정도 카드 안으로 — 화면 위쪽에 떠 있던 것을 한 덩어리로 모은다 */}
                <IconButton
                  icon={
                    settingsOpen ? (
                      <IconX size={22} color={c.accentText} />
                    ) : (
                      <IconGear size={22} color={c.accentText} />
                    )
                  }
                  onPress={() => setSettingsOpen((v) => !v)}
                  label={settingsOpen ? t.common.close : t.container.settings}
                />
              </View>
              {audit.data && (
                <Text style={[st.audit, { color: c.textFaint }]}>
                  {t.item.editedBy(
                    audit.data.updater?.display_name ?? t.item.formerMember,
                    relTime(audit.data.updated_at, t),
                  )}
                </Text>
              )}
            </View>
          </View>
        </View>

        {settingsOpen && container.data?.name && (
          <SettingsCard
            label={t.container.name}
            placeholder={t.container.namePlaceholder}
            initialName={container.data.name}
            busy={updateContainer.isPending}
            onSave={async (name) => {
              try {
                await updateContainer.mutateAsync({ name });
                setSettingsOpen(false);
              } catch (e) {
                Alert.alert(t.item.saveFailed, e instanceof Error ? e.message : t.common.tryAgain);
              }
            }}
            danger={{
              label: t.container.deleteBox,
              onPress: onDeleteBox,
              busy: deleteContainer.isPending,
            }}
          >
            {/*
              박스 옮기기 — 이름 수정과 삭제 사이. 삭제와 붙여 두지 않는다.
              "옮기기" 는 되돌릴 수 있는 일이고 삭제는 아니라서, 위험한 것끼리 모아 두면
              손이 미끄러진다. 지금 있는 장소를 함께 적어 어디에서 떠나는지 밝힌다.
            */}
            <View style={st.settingsMove}>
              <FieldLabel>{t.container.place}</FieldLabel>
              <Text style={[st.settingsHere, { color: c.text }]} numberOfLines={1}>
                {location?.name ?? t.common.notFound}
              </Text>
              <Button label={t.container.moveBox} onPress={() => setMoving(true)} variant="secondary" />
            </View>
          </SettingsCard>
        )}

        {/*
          박스를 통째로 옮기기 (2026-09-05 사용자 요청).

          ⚠ 성공은 토스트다 — 이동은 확인을 누르게 할 만큼 무거운 일이 아니다.
            실패는 Alert 으로 붙잡는다(사라지는 알림은 놓친다).
          ⚠ 토스트는 **모달이 닫힌 뒤에** 띄운다. Modal 이 떠 있는 동안에는 알림이
            그 아래에 깔려 보이지 않는다(components/Toast.tsx 참고).
        */}
        <BoxMovePicker
          visible={moving}
          householdId={activeId}
          currentLocationId={container.data?.location_id ?? null}
          itemCount={list.length}
          busy={moveContainer.isPending}
          onClose={() => setMoving(false)}
          onPick={async (locationId, name) => {
            try {
              await moveContainer.mutateAsync(locationId);
              setMoving(false);
              setSettingsOpen(false);
              toast(t.container.movedTo(name));
            } catch (e) {
              Alert.alert(
                t.container.moveFailed,
                e instanceof Error ? e.message : t.common.tryAgain,
              );
            }
          }}
        />

        {/*
          고른 물건들을 한 번에 옮기기.

          ⚠ 여기서 고른 것은 **모두 이 박스 안**에 있다 — 출발지가 하나라서 단건 이동과
            똑같이 "지금 여기" 를 표시하고 그 자리로 스크롤할 수 있다.
          ⚠ 이 화면(MovePicker)에는 "+ 여기에 박스 만들기" 가 있다. 박스를 새로 사서
            정리하는 흐름에서는 그 한 번으로 박스가 생기고 고른 것이 통째로 들어간다.
        */}
        <MovePicker
          visible={bulkMoving}
          title={t.select.moveTitle(sel.picked.length)}
          addBoxHint={t.select.addBoxHint(sel.picked.length)}
          householdId={activeId}
          currentContainerId={containerId}
          currentLocationId={container.data?.location_id ?? ''}
          busy={moveItems.isPending}
          onClose={() => setBulkMoving(false)}
          onPick={async (target: MoveTarget, label: string) => {
            const picked = sel.picked;
            try {
              const res = await moveItems.mutateAsync({ ids: picked, target });
              setBulkMoving(false);
              sel.exit();
              /**
               * ⚠ 부분 성공을 성공이라고 하지 않는다. `.in()` 은 권한에 걸린 행을
               *   조용히 건너뛰므로, 돌아온 개수가 요청 개수와 다르면 그대로 말한다.
               * ⚠ 하나도 못 옮겼으면 Alert 이다 — 사라지는 알림으로 알리면 놓친다.
               */
              if (res.moved === 0) Alert.alert(t.select.movedNone, t.select.movedNoneHint);
              else if (res.moved < res.total) toast(t.select.movedSome(res.moved, res.total, label));
              else toast(t.select.moved(res.moved, label));
            } catch (e) {
              Alert.alert(t.select.moveFailed, e instanceof Error ? e.message : t.common.tryAgain);
            }
          }}
        />

        {/* 크게 보기 — 물건 상세와 **같은 컴포넌트**를 쓴다 */}
        <PhotoViewer
          visible={viewer}
          sources={boxPhoto.data ? [boxPhoto.data] : []}
          index={0}
          onIndexChange={() => {}}
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
            title={container.data?.name ?? t.container.fallbackTitle}
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

        <SectionLabel
          action={
            /* 길게 누르기만 두면 아무도 못 찾는다 — 눈에 보이는 길을 함께 둔다 */
            list.length > 1 && !sel.active ? (
              <TextButton label={t.select.enter} onPress={sel.open} size="small" />
            ) : null
          }
        >
          {t.container.contents(list.length)}
        </SectionLabel>
        {items.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty text={t.common.empty} />
        ) : (
          <CardGrid>
            {list.map((it) => (
              <ItemCard
                key={it.id}
                name={it.name}
                category={it.category?.name ?? null}
                categoryColor={it.category?.color ?? null}
                quantity={it.quantity}
                width={cardW}
                thumb={thumbs.get(it.thumb_path)}
                inUse={!!it.in_use_since}
                selectable={sel.active}
                selected={sel.ids.has(it.id)}
                /* ⚠ 고르는 중에는 상세로 가지 않는다 — 빠져나가면 골라 둔 것이 날아간다 */
                onPress={() => (sel.active ? sel.toggle(it.id) : router.push(`/item/${it.id}`))}
                onLongPress={() => sel.start(it.id)}
              />
            ))}
          </CardGrid>
        )}

        {/* ⚠ 막대는 떠 있는 것이라 스스로 자리를 못 만든다 — 마지막 줄이 가리지 않게 비운다 */}
        {sel.active ? <View style={{ height: BAR_SPACE }} /> : null}
      </View>
    </Screen>
  );
}

/** 상대 시각. 화면마다 다른 표현을 쓰지 않도록 사전을 통한다 */

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md },
  audit: { fontSize: type.caption },
  card: { borderRadius: radius.md, padding: space.lg, gap: space.lg },
  cardTop: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  thumb: {
    width: 96,
    height: 128,   // 96 / (3/4) — 저장 비율과 같게
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  cardMain: { flex: 1, gap: space.xs, justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitle: { flex: 1, fontSize: type.h2, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: leading.h2 },
  settingsMove: { marginTop: space.lg, gap: space.sm },
  settingsHere: { fontSize: type.body, fontWeight: '600' },
});
