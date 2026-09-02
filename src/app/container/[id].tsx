import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Empty, Field, Loading, Screen, SectionLabel } from '@/components/ui';
import { useHousehold } from '@/features/household/context';
import { useAudit } from '@/features/history/api';
import { Fab } from '@/components/Fab';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ItemCard } from '@/features/item/ItemCard';
import { IMAGE_CACHE_POLICY, useThumbUrls } from '@/features/item/thumbs';
import { useItemPhotoUrl } from '@/features/item/api';
import { CameraCapture } from '@/features/item/CameraCapture';
import { preparePhoto } from '@/features/item/photo';
import { useRemovePhoto, useSetPhoto } from '@/features/item/photoApi';
import {
  useContainerItems,
  useDeleteContainerById,
  useLocations,
  useUpdateContainer,
} from '@/features/storage/api';
import { supabase } from '@/lib/supabase';
import { useT } from '@/lib/i18n';
import { relTime } from '@/lib/time';
import { useTheme, type, radius, overlay, space, tracking } from '@/lib/theme';

/** 컨테이너 한 건 조회. 목록을 거치지 않고 직접 가져온다 */
function useContainer(containerId: string) {
  return useQuery({
    queryKey: ['container', containerId],
    enabled: !!containerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('container_summary')
        .select('id, location_id, name, qr_token, photo_path, thumb_path, item_count')
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

  const container = useContainer(containerId);
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
  const [photoSheet, setPhotoSheet] = useState(false);
  const [viewer, setViewer] = useState(false);

  // 찾기 탭과 같은 2열 격자. 한 박스의 내용물은 많아야 수십 개라
  // FlatList 없이 감싸기(flexWrap)로 충분하다 — Screen 의 ScrollView 와 중첩되지 않는다.
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
  // 박스도 모양이 제각각이라 사진이 있으면 찾기가 훨씬 쉽다 (사용자 요청)
  const boxPhoto = useItemPhotoUrl(container.data?.photo_path);
  const setPhoto = useSetPhoto('containers', containerId, activeId);
  const removePhoto = useRemovePhoto('containers', containerId);
  const updateContainer = useUpdateContainer(containerId);
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
      float={<Fab onPress={() => router.push(`/add/${containerId}`)} />}
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
                  <Text style={[st.thumbAdd, { color: c.textFaint }]}>＋</Text>
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
          </View>
        </View>

        {settingsOpen && container.data?.name && (
          <BoxSettings
            initialName={container.data.name}
            busy={updateContainer.isPending}
            onSave={async (patch) => {
              try {
                await updateContainer.mutateAsync(patch);
                setSettingsOpen(false);
              } catch (e) {
                Alert.alert(t.item.saveFailed, e instanceof Error ? e.message : t.common.tryAgain);
              }
            }}
            onDelete={onDeleteBox}
            deleting={deleteContainer.isPending}
          />
        )}

        {/* 크게 보기 — 물건 상세와 **같은 컴포넌트**를 쓴다 */}
        <PhotoViewer
          visible={viewer}
          source={boxPhoto.data}
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

        <SectionLabel>{t.container.contents(list.length)}</SectionLabel>
        {items.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <Empty text={t.common.empty} />
        ) : (
          <View style={st.list}>
            {list.map((it) => (
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
        )}
      </View>
    </Screen>
  );
}

/**
 * 박스 설정 — 이름 수정과 삭제. (메모 칸은 없다 — location/[id].tsx 의 주석 참고)
 *
 * ⚠ 원래 장소 화면에서 길게 눌러 `Alert.prompt` 로 이름을 바꾸게 되어 있었는데,
 *   **`Alert.prompt` 는 iOS 전용이다.** 옵셔널 체이닝(`Alert.prompt?.()`)으로 불렀기
 *   때문에 안드로이드에서는 아무 일도 일어나지 않고 오류도 나지 않았다 — 기능이
 *   없는 게 아니라 조용히 죽어 있었다. 그래서 화면 안의 폼으로 바꿨다.
 */
function BoxSettings({
  initialName,
  busy,
  deleting,
  onSave,
  onDelete,
}: {
  initialName: string;
  busy: boolean;
  deleting: boolean;
  onSave: (patch: { name: string }) => void;
  onDelete: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  // 초기값은 마운트 때 한 번만 잡는다. 재조회에 맞춰 되돌리면 입력하던 게 지워진다.
  const [name, setName] = useState(initialName);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0;
  const changed = trimmed !== initialName;

  return (
    <View style={[st.settings, { backgroundColor: c.card }]}>
      <Text style={[st.fieldLabel, { color: c.textFaint }]}>{t.container.name}</Text>
      <Field value={name} onChangeText={setName} placeholder={t.container.namePlaceholder} />
      {!nameOk && <Text style={[st.err, { color: c.danger }]}>{t.item.nameRequired}</Text>}

      <Button
        label={busy ? t.common.saving : t.common.save}
        busy={busy}
        disabled={!nameOk || !changed}
        onPress={() => onSave({ name: trimmed })}
      />
      <View style={st.settingsDanger}>
        <Button label={t.container.deleteBox} onPress={onDelete} variant="danger" busy={deleting} />
      </View>
    </View>
  );
}

/** 상대 시각. 화면마다 다른 표현을 쓰지 않도록 사전을 통한다 */

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.md },
  path: { fontSize: type.small },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  gear: { fontSize: type.title, fontWeight: '600' },
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
  thumbAdd: { fontSize: type.display, fontWeight: '400' },
  cardMain: { flex: 1, gap: space.xs, justifyContent: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  cardTitle: { flex: 1, fontSize: type.h2, fontWeight: '700', letterSpacing: tracking.tight, lineHeight: 27 },
  photoEdit: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: overlay.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
  },
  photoEditText: { color: overlay.fg, fontSize: type.caption, fontWeight: '600' },
  photoAdd: {
    height: 80,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: type.body, fontWeight: '600' },
  settings: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  settingsDanger: { marginTop: space.lg },
  fieldLabel: { fontSize: type.tiny, fontWeight: '600', letterSpacing: tracking.wide },
  err: { fontSize: type.caption },
});
