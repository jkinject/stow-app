import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { IconGear, IconX } from '@/components/Icon';
import { SelectionBar, BAR_SPACE } from '@/components/SelectionBar';
import { SettingsCard } from '@/components/SettingsCard';
import { Button, Empty, Field, IconButton, Loading, Screen, SectionLabel, TextButton } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useAudit } from '@/features/history/api';
import { CardGrid, useCardWidth } from '@/components/CardGrid';
import { Fab } from '@/components/Fab';
import { useMoveItems } from '@/features/item/api';
import { ItemCard } from '@/features/item/ItemCard';
import { MovePicker, type MoveTarget } from '@/features/item/MovePicker';
import { useSelection } from '@/features/item/selection';
import { useThumbUrls } from '@/features/item/thumbs';
import {
  useContainers,
  useCreateContainer,
  useDeleteContainer,
  useDeleteLocation,
  useLocations,
  useUpdateLocation,
  useLooseItems,
} from '@/features/storage/api';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n';
import { relTime } from '@/lib/time';
import { useTheme, type, radius, space, tracking, leading } from '@/lib/theme';

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const locationId = String(id);
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { activeId } = useHousehold();

  const locations = useLocations(activeId);
  const location = (locations.data ?? []).find((l) => l.id === locationId);

  const containers = useContainers(activeId, locationId);
  const loose = useLooseItems(locationId);
  const audit = useAudit('locations', locationId);

  // 격자 치수는 `CardGrid` 한 곳에서 온다 — 화면마다 카드 폭이 다르면 안 된다
  const cardW = useCardWidth();

  // 박스에 안 들어간 낱개 물건도 박스 안 물건과 똑같이 보여야 한다
  const thumbs = useThumbUrls();
  useEffect(() => {
    // 박스와 낱개 물건의 썸네일을 **한 번에** 서명한다. 두 번 나눠 부르면 요청이 두 배가 된다.
    thumbs.ensure([
      ...(containers.data ?? []).map((ct) => ct.thumb_path),
      ...(loose.data ?? []).map((it) => it.thumb_path),
    ]);
  }, [containers.data, loose.data, thumbs]);
  const createContainer = useCreateContainer(activeId ?? '', locationId);
  const deleteContainer = useDeleteContainer(activeId ?? '', locationId);
  const deleteLocation = useDeleteLocation(activeId ?? '');
  const updateLocation = useUpdateLocation(locationId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  /**
   * 낱개 물건 여러 개를 골라 한 번에 옮기기 (2026-09-21 사용자 요청).
   *
   * 박스 없이 장소에 쌓아 둔 물건이 이 화면의 "낱개" 섹션이다. 박스를 새로 들이면
   * 그것들을 통째로 옮기게 되는데, 지금까지는 하나씩 상세를 열고 이동을 눌러야 했다.
   *
   * ⚠ 선택은 **낱개 물건에만** 건다. 위의 박스 격자는 물건이 아니다 —
   *   박스를 옮기는 일은 박스 상세에 따로 있다(BoxMovePicker).
   * ⚠ id 배열을 `useMemo` 로 감싼다 — 렌더마다 새 배열이면 선택 훅의 파생값이 매번
   *   새 참조가 된다(selection.ts 주석). 의존은 `ls` 가 아니라 `loose.data` 다.
   */
  const looseIds = useMemo(() => (loose.data ?? []).map((it) => it.id), [loose.data]);
  const sel = useSelection(looseIds);
  const [bulkMoving, setBulkMoving] = useState(false);
  const moveItems = useMoveItems();
  const toast = useToast();

  async function onAdd() {
    const n = name.trim();
    if (!n) return;
    try {
      await createContainer.mutateAsync(n);
      setName('');
      // 연속으로 박스를 만드는 경우가 많다 ("1번 박스"~"10번 박스"). 입력창을 닫지 않는다.
    } catch (e) {
      Alert.alert(t.location.boxAddFailed, e instanceof Error ? e.message : t.common.tryAgain);
    }
  }

  function onContainerLongPress(cid: string, cname: string, itemCount: number) {
    Alert.alert(cname, itemCount > 0 ? t.location.itemsInside(itemCount) : t.location.isEmpty, [
      {
        // ⚠ 예전엔 여기서 `Alert.prompt?.()` 를 불렀는데 **Alert.prompt 는 iOS 전용**이라
        //   안드로이드에서는 옵셔널 체이닝에 걸려 조용히 아무 일도 하지 않았다.
        //   편집은 박스 상세 화면 한 곳에서만 한다 — 두 곳에 두면 한쪽만 고쳐진다.
        text: t.location.rename,
        onPress: () => router.push(`/container/${cid}`),
      },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            t.location.deleteBoxTitle,
            itemCount > 0
              ? t.location.deleteBoxWithItems(itemCount, location?.name ?? '')
              : t.location.deleteBoxEmpty,
            [
              { text: t.common.cancel, style: 'cancel' },
              {
                text: t.common.delete,
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteContainer.mutateAsync(cid);
                    loose.refetch();
                  } catch (e) {
                    Alert.alert(t.location.deleteFailed, e instanceof Error ? e.message : t.common.tryAgain);
                  }
                },
              },
            ],
          ),
      },
      { text: t.common.close, style: 'cancel' },
    ]);
  }

  function onDeleteLocation() {
    Alert.alert(t.location.deleteLocationTitle, t.location.deleteLocationBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLocation.mutateAsync(locationId);
            router.back();
          } catch (e) {
            // 트리거가 몇 개 남았는지 알려준다 — 그 메시지를 그대로 보여준다
            Alert.alert(t.location.deleteLocationBlocked, e instanceof Error ? e.message : t.common.tryAgain);
          }
        },
      },
    ]);
  }

  const cs = containers.data ?? [];
  const ls = loose.data ?? [];

  return (
    <Screen
      back
      /* ＋ 는 앱 전체에서 **물건 등록** 한 가지 뜻이다.
         박스 만들기는 "박스" 섹션 제목 옆에 남는다 — 구조를 만드는 일이라 성격이 다르다.
         ⚠ 그래서 고르는 중에는 ＋ 를 치운다 — 등록할 때가 아니고 자리도 정확히 겹친다. */
      float={
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
          <Fab
            onPress={() =>
              router.push({
                pathname: '/add/[target]',
                params: { target: locationId, loose: '1' },
              })
            }
          />
        )
      }
    >
      <View style={st.body}>
        {/* 박스 상세와 같은 카드 형태.
            ⚠ 장소에는 사진 컬럼이 없어(items·containers 에만 있다) 사진 자리는 비운다.
            넣으려면 마이그레이션이 필요하다. */}
        <View style={[st.card, { backgroundColor: c.card }]}>
          <View style={st.cardTitleRow}>
            <Text style={[st.cardTitle, { color: c.text }]} numberOfLines={3}>
              {location?.name ?? ''}
            </Text>
            <IconButton
              icon={
                settingsOpen ? (
                  <IconX size={22} color={c.accentText} />
                ) : (
                  <IconGear size={22} color={c.accentText} />
                )
              }
              onPress={() => setSettingsOpen((v) => !v)}
              label={settingsOpen ? t.common.close : t.location.settings}
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
        {settingsOpen && location?.name && (
          <SettingsCard
            label={t.location.name}
            placeholder={t.location.namePlaceholder}
            initialName={location.name}
            busy={updateLocation.isPending}
            onSave={async (name) => {
              try {
                await updateLocation.mutateAsync({ name });
                setSettingsOpen(false);
              } catch (e) {
                Alert.alert(t.item.saveFailed, e instanceof Error ? e.message : t.common.tryAgain);
              }
            }}
            danger={{ label: t.location.deleteLocation, onPress: onDeleteLocation }}
          />
        )}

        <SectionLabel
          action={
            <TextButton
              label={adding ? t.common.done : t.location.addBox}
              onPress={() => setAdding((v) => !v)}
              size="small"
            />
          }
        >
          {t.location.boxSection(cs.length)}
        </SectionLabel>
        {adding && (
          <View style={st.addBox}>
            <Field
              value={name}
              onChangeText={setName}
              placeholder={t.location.boxPlaceholder}
              autoFocus
              onSubmitEditing={onAdd}
              returnKeyType="next"
              blurOnSubmit={false}
            />
            <Button label={t.common.add} onPress={onAdd} busy={createContainer.isPending} />
            <Text style={[st.hint, { color: c.textFaint }]}>
              {t.location.boxAddHint}
            </Text>
          </View>
        )}
        {containers.isLoading ? (
          <Loading />
        ) : cs.length === 0 ? (
          <Empty
            text={t.location.noBoxes}
            hint={t.location.noBoxesHint}
          />
        ) : (
          <CardGrid>
            {cs.map((ct) => (
              <ItemCard
                key={ct.id}
                name={ct.name}
                subtitle={ct.item_count > 0 ? t.places.itemCount(ct.item_count) : t.common.empty}
                width={cardW}
                thumb={thumbs.get(ct.thumb_path)}
                onPress={() => router.push(`/container/${ct.id}`)}
                onLongPress={() => onContainerLongPress(ct.id, ct.name, ct.item_count)}
              />
            ))}
          </CardGrid>
        )}

        {ls.length > 0 && (
          <>
            <SectionLabel
              action={
                /* 길게 누르기만 두면 아무도 못 찾는다 — 눈에 보이는 길을 함께 둔다 */
                ls.length > 1 && !sel.active ? (
                  <TextButton label={t.select.enter} onPress={sel.open} size="small" />
                ) : null
              }
            >
              {t.location.looseSection(ls.length)}
            </SectionLabel>
            <CardGrid>
              {ls.map((it) => (
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
          </>
        )}

        {/*
          고른 낱개 물건들을 한 번에 옮기기.

          ⚠ 고른 것은 **모두 이 장소 직속**(container_id = null)이다 — 출발지가 하나라
            단건 이동과 똑같이 "지금 여기" 를 표시하고 그 자리로 스크롤할 수 있다.
          ⚠ 이 화면(MovePicker)에는 "+ 여기에 박스 만들기" 가 있다. 박스를 새로 사서
            정리하는 흐름이라면 그 한 번으로 박스가 생기고 고른 것이 통째로 들어간다.
        */}
        <MovePicker
          visible={bulkMoving}
          title={t.select.moveTitle(sel.picked.length)}
          addBoxHint={t.select.addBoxHint(sel.picked.length)}
          householdId={activeId}
          currentContainerId={null}
          currentLocationId={locationId}
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

        {/* ⚠ 막대는 떠 있는 것이라 스스로 자리를 못 만든다 — 마지막 줄이 가리지 않게 비운다 */}
        {sel.active ? <View style={{ height: BAR_SPACE }} /> : null}
      </View>
    </Screen>
  );
}

/**
 * 장소 설정 — 이름 수정과 삭제.
 *
 * ⚠ 메모 칸은 뺐다(2026-09-01, 사용자 요청). 장소·박스에 메모를 쓰는 사람이 없었다 —
 *   기억해 둘 것은 물건에 붙지 장소에 붙지 않는다. `locations.note` 컬럼과 기존에
 *   적힌 값은 **남겨 둔다.** 지우는 건 되돌릴 수 없고, 되살릴 일이 생기면 컬럼이
 *   그대로 있어야 한다. 물건 메모는 그대로 둔다 — 거긴 실제로 쓰인다.
 * ⚠ 이름 변경 훅(`useRenameLocation`)은 있었지만 **부르는 화면이 없었다.**
 *   기능이 없다는 사용자 보고의 원인이 이것이다. 박스 설정과 같은 모양으로 맞춘다.
 */
const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md },
  audit: { fontSize: type.caption },
  card: { borderRadius: radius.md, padding: space.lg, gap: space.xs },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitle: { flex: 1, fontSize: type.h2, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: leading.h2 },
  addBox: { gap: space.md, paddingVertical: space.xs },
  hint: { fontSize: type.caption, textAlign: 'center' },
});
