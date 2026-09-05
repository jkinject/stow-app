import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { IconGear, IconX } from '@/components/Icon';
import { SettingsCard } from '@/components/SettingsCard';
import { Button, Empty, Field, IconButton, Loading, Screen, SectionLabel, TextButton } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useAudit } from '@/features/history/api';
import { CardGrid, useCardWidth } from '@/components/CardGrid';
import { Fab } from '@/components/Fab';
import { ItemCard } from '@/features/item/ItemCard';
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
         박스 만들기는 "박스" 섹션 제목 옆에 남는다 — 구조를 만드는 일이라 성격이 다르다. */
      float={
        <Fab
          onPress={() =>
            router.push({
              pathname: '/add/[target]',
              params: { target: locationId, loose: '1' },
            })
          }
        />
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
            <SectionLabel>{t.location.looseSection(ls.length)}</SectionLabel>
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
                  onPress={() => router.push(`/item/${it.id}`)}
                />
              ))}
            </CardGrid>
          </>
        )}

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
