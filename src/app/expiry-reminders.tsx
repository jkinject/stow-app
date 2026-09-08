import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { IconBell } from '@/components/Icon';
import { SettingsGroup, SettingsRow, SettingsStatusRow, SettingsSwitchRow } from '@/components/SettingsList';
import { Screen } from '@/components/ui';
import { REMINDER_DAYS } from '@/features/item/expiry';
import {
  countScheduled,
  getReminderPermission,
  requestReminderPermission,
  useReminderSettings,
  type PermissionState,
} from '@/features/item/reminders';
import { useT } from '@/lib/i18n';
import { leading, space, type, useTheme } from '@/lib/theme';

/**
 * 소비기한 알림 설정 (2026-09-08 사용자 요청) — 더보기 › 소비기한 알림.
 *
 * 켜고 끄는 것뿐이다. 30·10·5·1 일 전 넷을 각각 토글하고, 맨 위에서 통째로 끈다.
 * 설정은 **이 기기**에 저장된다(reminders.ts 주석 — 서버 푸시가 아니라서).
 *
 * 권한이 없으면 아무것도 안 울린다. 그 사실을 화면이 말해 줘야 한다 — 토글은 켜져
 * 있는데 알림이 안 오면 "고장났다" 로 읽힌다. 거부한 뒤에는 앱이 다시 물을 수 없어
 * 기기 설정으로 보낸다.
 */
export default function ExpiryRemindersScreen() {
  const { c } = useTheme();
  const t = useT();
  const [s, save] = useReminderSettings();
  const [perm, setPerm] = useState<PermissionState>('undetermined');
  const [scheduled, setScheduled] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void getReminderPermission().then(setPerm);
    void countScheduled().then(setScheduled);
  }, []);
  // 기기 설정에서 권한을 바꾸고 돌아오면 다시 읽는다
  useFocusEffect(refresh);

  const onMaster = async (on: boolean) => {
    await save({ ...s, enabled: on });
    if (on && perm === 'undetermined') {
      await requestReminderPermission();
    }
    // 스케줄은 탭 레이아웃의 sync 가 설정 변경을 보고 다시 건다. 개수는 조금 뒤에 읽는다.
    setTimeout(refresh, 800);
  };

  return (
    <Screen back title={t.reminders.title} subtitle={t.reminders.masterHint}>
      <View style={st.body}>
        <SettingsGroup>
          <SettingsSwitchRow
            first
            icon={(color) => <IconBell color={color} />}
            label={t.reminders.master}
            value={s.enabled}
            onValueChange={(v) => void onMaster(v)}
          />
        </SettingsGroup>

        <Text style={[st.section, { color: c.textFaint }]}>{t.reminders.whenLabel}</Text>
        <SettingsGroup>
          {REMINDER_DAYS.map((n, i) => (
            <SettingsSwitchRow
              key={n}
              first={i === 0}
              label={t.reminders.before(n)}
              value={s.days[n]}
              disabled={!s.enabled}
              onValueChange={(v) => {
                void save({ ...s, days: { ...s.days, [n]: v } });
                setTimeout(refresh, 800);
              }}
            />
          ))}
        </SettingsGroup>
        <Text style={[st.hint, { color: c.textMuted }]}>{t.reminders.hourHint}</Text>

        {/* 권한 — 여기서 말하지 않으면 "켰는데 안 온다" 가 된다 */}
        <SettingsGroup>
          {perm === 'granted' ? (
            /* 정보만 — 누를 것이 없으니 화살표도 없다 (SettingsStatusRow 주석) */
            <SettingsStatusRow
              first
              icon={(color) => <IconBell color={color} />}
              label={t.reminders.permissionGranted}
              value={scheduled === null ? undefined : t.reminders.scheduled(scheduled)}
            />
          ) : perm === 'undetermined' ? (
            <SettingsRow
              first
              icon={(color) => <IconBell color={color} />}
              label={t.reminders.permissionAsk}
              onPress={() => void requestReminderPermission().then(refresh)}
            />
          ) : (
            <SettingsRow
              first
              danger
              icon={(color) => <IconBell color={color} />}
              label={t.reminders.permissionDenied}
              value={t.reminders.openSettings}
              onPress={() => void Linking.openSettings()}
            />
          )}
        </SettingsGroup>
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.giant, gap: space.md },
  section: { fontSize: type.tiny, fontWeight: '700', marginTop: space.sm, marginLeft: space.xs },
  hint: { fontSize: type.small, lineHeight: leading.body, marginHorizontal: space.xs },
});
