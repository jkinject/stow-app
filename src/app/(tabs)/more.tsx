import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ChoiceSheet } from '@/components/ChoiceSheet';
import {
  IconGlobe,
  IconMoon,
  IconPrinter,
  IconSignOut,
  IconTag,
  IconInfo,
  IconTrash,
  IconUsers,
  IconUserX,
} from '@/components/Icon';
import { SettingsGroup, SettingsRow } from '@/components/SettingsList';
import { Screen } from '@/components/ui';
import { useMembers } from '@/features/household/api';
import { useDeleteAccount, useDeletionPreview } from '@/features/household/deleteAccount';
import { useHousehold } from '@/features/household/context';
import { useLocations } from '@/features/storage/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type Lang } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useThemeChoice, type ThemeChoice } from '@/lib/theme-context';
import { useTheme, type, radius, space, tracking } from '@/lib/theme';

/**
 * 화면에 보여줄 버전 한 줄과, 눌렀을 때 복사할 진단 정보.
 *
 * OTA 를 켠 뒤로는 "버전 1.0.0" 만으로는 부족하다 — 같은 1.0.0 이라도 기기마다
 * **다른 JS 번들**이 돌 수 있다. 문제를 알려 줄 때 updateId 와 runtimeVersion 이
 * 있어야 어느 번들에서 난 일인지 좁힐 수 있다.
 *
 * ⚠ expo-updates 값은 개발 빌드에서 비어 있다. 없으면 없는 대로 둔다.
 */
function useVersionInfo() {
  const version = Constants.expoConfig?.version ?? '—';
  let update: { id: string | null; runtime: string | null; channel: string | null; embedded: boolean } = {
    id: null, runtime: null, channel: null, embedded: true,
  };
  try {
    update = {
      id: Updates.updateId ?? null,
      runtime: Updates.runtimeVersion ?? null,
      channel: Updates.channel ?? null,
      embedded: Updates.isEmbeddedLaunch,
    };
  } catch {
    // 개발 빌드에서는 모듈이 꺼져 있다 — 버전만 보여준다
  }
  return { version, update };
}

function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, created_at')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export default function MoreTab() {
  const { c } = useTheme();
  const { t, chosen, setLang } = useI18n();
  const { choice: themeChoice, setChoice: setThemeChoice } = useThemeChoice();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { active, activeId } = useHousehold();

  const profile = useMyProfile(session?.user?.id);
  const locations = useLocations(activeId);
  const members = useMembers(activeId);

  const preview = useDeletionPreview();
  const remove = useDeleteAccount();

  const [picker, setPicker] = useState<'lang' | 'theme' | null>(null);
  const hasPlaces = (locations.data?.length ?? 0) > 0;
  const info = useVersionInfo();

  async function onCopyDiagnostics() {
    const lines = [
      `app ${info.version}`,
      `runtime ${info.update.runtime ?? '-'}`,
      `channel ${info.update.channel ?? '-'}`,
      `update ${info.update.embedded ? 'embedded' : (info.update.id ?? '-')}`,
      `device ${Constants.deviceName ?? '-'}`,
    ];
    await Clipboard.setStringAsync(lines.join('\n'));
    Alert.alert(t.about.copyDiagnostics, lines.join('\n'));
  }

  /**
   * 탈퇴. 무엇이 사라지는지 **먼저 세어서** 보여준 뒤에 묻는다 —
   * "정말 삭제하시겠습니까?" 만으로는 집이 통째로 없어진다는 걸 알 수 없다.
   */
  async function onDeleteAccount() {
    let p;
    try {
      p = await preview.mutateAsync();
    } catch (e) {
      Alert.alert(t.deleteAccount.failed, e instanceof Error ? e.message : t.common.tryAgain);
      return;
    }

    const lines = [
      p.doomedCount > 0 ? t.deleteAccount.summaryDoomed(p.doomedCount) : null,
      p.leavingCount > 0 ? t.deleteAccount.summaryLeaving(p.leavingCount) : null,
      p.leavingCount > 0 ? t.deleteAccount.summaryHandover : null,
      t.deleteAccount.irreversible,
    ].filter(Boolean);

    Alert.alert(t.deleteAccount.confirmTitle, lines.join('\n\n'), [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.deleteAccount.confirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(p.photoPaths);
            // 화면을 직접 옮기지 않는다 — 세션이 사라지면 _layout 가드가 로그인으로 보낸다
          } catch (e) {
            Alert.alert(t.deleteAccount.failed, e instanceof Error ? e.message : t.common.tryAgain);
          }
        },
      },
    ]);
  }

  const email = session?.user?.email ?? '';
  const name = profile.data?.display_name ?? email.split('@')[0] ?? '';

  const langLabel =
    chosen === null ? t.more.langSystem : chosen === 'ko' ? t.more.langKo : t.more.langEn;
  const themeLabel =
    themeChoice === 'system'
      ? t.more.themeSystem
      : themeChoice === 'light'
        ? t.more.themeLight
        : t.more.themeDark;

  return (
    <Screen title={t.more.title}>
      <View style={st.body}>
        {/* 프로필 */}
        <View style={[st.profile, { backgroundColor: c.card }]}>
          <View style={[st.avatar, { backgroundColor: c.sunk }]}>
            <Text style={[st.avatarText, { color: c.textMuted }]}>{name.slice(0, 1) || '?'}</Text>
          </View>
          <View style={st.profileMain}>
            <Text style={[st.name, { color: c.text }]} numberOfLines={1}>
              {name}
            </Text>
            {!!email && (
              <Text style={[st.sub, { color: c.textFaint }]} numberOfLines={1}>
                {email}
              </Text>
            )}
            {!!active && (
              <Text style={[st.sub, { color: c.textMuted }]} numberOfLines={1}>
                {active.name} · {t.more.role(active.role)}
              </Text>
            )}
          </View>
        </View>

        {/* 표시 설정 */}
        <SettingsGroup>
          <SettingsRow
            first
            icon={(color) => <IconGlobe color={color} />}
            label={t.more.language}
            value={langLabel}
            onPress={() => setPicker('lang')}
          />
          <SettingsRow
            icon={(color) => <IconMoon color={color} />}
            label={t.more.theme}
            value={themeLabel}
            onPress={() => setPicker('theme')}
          />
        </SettingsGroup>

        {/* 집 관리 */}
        <SettingsGroup>
          {hasPlaces && (
            <SettingsRow
              first
              icon={(color) => <IconPrinter color={color} />}
              label={t.more.printLabels}
              onPress={() => router.push('/labels')}
            />
          )}
          {/* 카테고리 관리는 owner 전용이 아니다 — 물건을 분류하는 도구이지 권한이 아니다 */}
          <SettingsRow
            first={!hasPlaces}
            icon={(color) => <IconTag color={color} />}
            label={t.category.manage}
            onPress={() => router.push('/categories')}
          />
          {/* 초대는 여기서 **발급하지 않는다.** 전에는 이 줄을 누르는 순간 코드가
              만들어지고 알림창으로 한 번 보여준 게 전부였다 — 닫으면 다시 볼 수 없고,
              여러 번 누르면 유효한 코드가 그만큼 쌓였다. 발급·회수·구성원은 모두
              가족 화면에서 한 번에 다룬다. 관리자가 아니어도 들어갈 수 있다. */}
          <SettingsRow
            icon={(color) => <IconUsers color={color} />}
            label={t.more.family}
            value={members.data ? t.more.familyValue(members.data.length) : undefined}
            onPress={() => router.push('/family')}
          />
          <SettingsRow
            icon={(color) => <IconTrash color={color} />}
            label={t.more.trash}
            onPress={() => router.push('/trash')}
          />
        </SettingsGroup>

        {/* 앱 정보 */}
        <SettingsGroup>
          <SettingsRow
            first
            icon={(color) => <IconInfo color={color} />}
            label={t.about.version}
            value={info.version}
            onPress={() => void onCopyDiagnostics()}
          />
          <SettingsRow
            icon={(color) => <IconTag color={color} />}
            label={t.licenses.title}
            onPress={() => router.push('/licenses')}
          />
        </SettingsGroup>

        {/* 계정 */}
        <SettingsGroup>
          <SettingsRow
            first
            danger
            icon={(color) => <IconSignOut color={color} />}
            label={t.more.signOut}
            onPress={() => signOut()}
          />
          <SettingsRow
            danger
            icon={(color) => <IconUserX color={color} />}
            label={
              preview.isPending
                ? t.deleteAccount.checking
                : remove.isPending
                  ? t.deleteAccount.working
                  : t.deleteAccount.title
            }
            onPress={() => void onDeleteAccount()}
          />
        </SettingsGroup>
      </View>

      {picker && (
        <ChoiceSheet
          title={picker === 'lang' ? t.more.language : t.more.theme}
          options={
            picker === 'lang'
              ? [
                  { key: 'system', label: t.more.langSystem, on: chosen === null },
                  { key: 'ko', label: t.more.langKo, on: chosen === 'ko' },
                  { key: 'en', label: t.more.langEn, on: chosen === 'en' },
                ]
              : [
                  { key: 'system', label: t.more.themeSystem, on: themeChoice === 'system' },
                  { key: 'light', label: t.more.themeLight, on: themeChoice === 'light' },
                  { key: 'dark', label: t.more.themeDark, on: themeChoice === 'dark' },
                ]
          }
          onPick={(key) => {
            if (picker === 'lang') setLang(key === 'system' ? null : (key as Lang));
            else setThemeChoice(key as ThemeChoice);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.xl },
  profile: { borderRadius: radius.md, padding: space.xl, flexDirection: 'row', gap: space.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: type.h2, fontWeight: '700' },
  profileMain: { flex: 1, gap: space.xs, justifyContent: 'center' },
  name: { fontSize: type.title, fontWeight: '700', letterSpacing: tracking.tight },
  sub: { fontSize: type.small },
});
