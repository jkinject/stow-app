import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Empty, Field, Loading, Screen, SectionLabel } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useAudit } from '@/features/history/api';
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
import { useTheme, type, radius, space, tracking } from '@/lib/theme';

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

  // 박스와 낱개 물건 모두 찾기 탭과 같은 2열 격자로 통일한다
  const win = useWindowDimensions();
  /**
   * 한 줄에 두 장. 남는 폭을 정확히 반으로 나눈다.
   *
   * ⚠⚠ 이 식은 **아래 스타일과 같은 값을 봐야 한다** (body 의 좌우 여백, list 의 gap).
   *   예전에는 여기에 20 과 10 을 **숫자로 베껴 두고** 스타일에는 따로 적어 뒀다.
   *   그래서 간격을 척도에 맞추며 스타일의 gap 만 10→12 로 바뀌자, 카드 두 장이
   *   1px 넘쳐서 **한 줄에 하나씩** 떨어졌다(2026-09-02 사용자 보고).
   *   토큰을 직접 참조하면 두 값이 다시 어긋날 수 없다. 숫자를 적지 말 것.
   */
  const cardW = (win.width - space.xl * 2 - space.md) / 2;

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
            <Pressable onPress={() => setSettingsOpen((v) => !v)} hitSlop={12}>
              <Text style={[st.gear, { color: c.accentText }]}>
                {settingsOpen ? t.common.close : '⚙'}
              </Text>
            </Pressable>
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
          <LocationSettings
            initialName={location.name}
            busy={updateLocation.isPending}
            onSave={async (patch) => {
              try {
                await updateLocation.mutateAsync(patch);
                setSettingsOpen(false);
              } catch (e) {
                Alert.alert(t.item.saveFailed, e instanceof Error ? e.message : t.common.tryAgain);
              }
            }}
            onDelete={onDeleteLocation}
          />
        )}

        <SectionLabel
          action={
            <Pressable onPress={() => setAdding((v) => !v)} hitSlop={12}>
              <Text style={[st.addBtn, { color: c.accentText }]}>{adding ? t.common.done : t.location.addBox}</Text>
            </Pressable>
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
          <View style={st.list}>
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
          </View>
        )}

        {ls.length > 0 && (
          <>
            <SectionLabel>{t.location.looseSection(ls.length)}</SectionLabel>
            <View style={st.list}>
              {ls.map((it) => (
                <ItemCard
                  key={it.id}
                  name={it.name}
                  category={it.category?.name ?? null}
                  quantity={it.quantity}
                  width={cardW}
                  thumb={thumbs.get(it.thumb_path)}
                  onPress={() => router.push(`/item/${it.id}`)}
                />
              ))}
            </View>
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
function LocationSettings({
  initialName,
  busy,
  onSave,
  onDelete,
}: {
  initialName: string;
  busy: boolean;
  onSave: (patch: { name: string }) => void;
  onDelete: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  // 초기값은 마운트 때 한 번만. 재조회에 맞춰 되돌리면 입력하던 게 지워진다.
  const [name, setName] = useState(initialName);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0;
  const changed = trimmed !== initialName;

  return (
    <View style={[st.settings, { backgroundColor: c.card }]}>
      <Text style={[st.fieldLabel, { color: c.textFaint }]}>{t.location.name}</Text>
      <Field value={name} onChangeText={setName} placeholder={t.location.namePlaceholder} />
      {!nameOk && <Text style={[st.err, { color: c.danger }]}>{t.item.nameRequired}</Text>}

      <Button
        label={busy ? t.common.saving : t.common.save}
        busy={busy}
        disabled={!nameOk || !changed}
        onPress={() => onSave({ name: trimmed })}
      />
      <View style={st.settingsDanger}>
        <Button label={t.location.deleteLocation} onPress={onDelete} variant="danger" />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md },
  qr: { fontSize: type.small, fontWeight: '600' },
  audit: { fontSize: type.caption },
  card: { borderRadius: radius.md, padding: space.lg, gap: space.xs },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitle: { flex: 1, fontSize: type.h2, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: 27 },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  gear: { fontSize: type.title, fontWeight: '600' },
  settings: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  settingsDanger: { marginTop: space.lg },
  fieldLabel: { fontSize: type.tiny, fontWeight: '600', letterSpacing: tracking.wide },
  err: { fontSize: type.caption },
  addBtn: { fontSize: type.body, fontWeight: '600' },
  addBox: { gap: space.md, paddingVertical: space.xs },
  hint: { fontSize: type.caption, textAlign: 'center' },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  footer: { marginTop: space.huge },
});
