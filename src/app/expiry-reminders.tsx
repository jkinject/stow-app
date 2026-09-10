import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { IconBell } from '@/components/Icon';
import { SettingsGroup, SettingsSwitchRow } from '@/components/SettingsList';
import { Button, Screen, SectionLabel } from '@/components/ui';
import { REMINDER_DAYS } from '@/features/item/expiry';
import {
  getReminderPermission,
  requestReminderPermission,
  useReminderSettings,
  type PermissionState,
} from '@/features/item/reminders';
import { useT } from '@/lib/i18n';
import { leading, radius, space, type, useTheme } from '@/lib/theme';

/**
 * 소비기한 알림 설정 (2026-09-08 사용자 요청) — 더보기 › 소비기한 알림.
 *
 * 켜고 끄는 것뿐이다. 30·10·5·1 일 전 넷을 각각 토글하고, 맨 위에서 통째로 끈다.
 * 설정은 **이 기기**에 저장된다(reminders.ts 주석 — 서버 푸시가 아니라서).
 *
 * 권한이 없으면 아무것도 안 울린다. 그 사실을 화면이 말해 줘야 한다 — 토글은 켜져
 * 있는데 알림이 안 오면 "고장났다" 로 읽힌다. 거부한 뒤에는 앱이 다시 물을 수 없어
 * 기기 설정으로 보낸다.
 *
 * ⚠ 권한이 **있을 때는 아무 말도 하지 않는다** (사용자 지적 2026-09-09). 처음엔
 *   "알림 권한 허용됨 · N개 예약됨" 줄을 뒀는데, 정상일 때 굳이 읽을 것이 아니다.
 *   문제가 있을 때만 맨 위에 경고 배너로 말한다 — 눈에 띄어야 하는 건 그쪽이다.
 */
export default function ExpiryRemindersScreen() {
  const { c } = useTheme();
  const t = useT();
  const [s, save] = useReminderSettings();
  const [perm, setPerm] = useState<PermissionState>('undetermined');

  const refresh = useCallback(() => {
    void getReminderPermission().then(setPerm);
  }, []);
  useFocusEffect(refresh);
  /**
   * ⚠ 기기 설정에서 권한을 켜고 돌아오면 **같은 화면**이라 focus 가 다시 오지 않는다 —
   *   다른 화면에 갔다 와야 배너가 사라졌다(사용자 보고 2026-09-09). 앱이 다시 활성화되는
   *   순간(AppState active)에도 읽는다. 알림 예약은 reminders.ts 가 같은 시점에 다시 건다.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onMaster = async (on: boolean) => {
    await save({ ...s, enabled: on });
    if (on && perm === 'undetermined') {
      await requestReminderPermission();
    }
    refresh();
  };

  return (
    <Screen back title={t.reminders.title} subtitle={t.reminders.masterHint}>
      <View style={st.body}>
        {/* 권한이 없을 때만 — 켜 두고 안 오는 것만큼 나쁜 게 없다 */}
        {perm !== 'granted' && (
          <View style={[st.warn, { borderColor: c.danger, backgroundColor: c.sunk }]}>
            <View style={st.warnHead}>
              <IconBell color={c.danger} size={20} />
              <Text style={[st.warnTitle, { color: c.danger }]}>{t.reminders.permissionWarnTitle}</Text>
            </View>
            <Text style={[st.warnBody, { color: c.textMuted }]}>{t.reminders.permissionWarnBody}</Text>
            <Button
              variant="danger"
              label={perm === 'undetermined' ? t.reminders.permissionAsk : t.reminders.openSettings}
              onPress={() =>
                perm === 'undetermined'
                  ? void requestReminderPermission().then(refresh)
                  : void Linking.openSettings()
              }
            />
          </View>
        )}

        <SettingsGroup>
          <SettingsSwitchRow
            first
            icon={(color) => <IconBell color={color} />}
            label={t.reminders.master}
            value={s.enabled}
            onValueChange={(v) => void onMaster(v)}
          />
        </SettingsGroup>

        <SectionLabel>{t.reminders.whenLabel}</SectionLabel>
        <SettingsGroup>
          {REMINDER_DAYS.map((n, i) => (
            <SettingsSwitchRow
              key={n}
              first={i === 0}
              label={t.reminders.before(n)}
              value={s.days[n]}
              disabled={!s.enabled}
              onValueChange={(v) => void save({ ...s, days: { ...s.days, [n]: v } })}
            />
          ))}
        </SettingsGroup>
        <Text style={[st.hint, { color: c.textMuted }]}>{t.reminders.hourHint}</Text>

      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, paddingBottom: space.giant, gap: space.md },
  hint: { fontSize: type.small, lineHeight: leading.body, marginHorizontal: space.xs },
  /* 경고 배너 — 테두리·제목이 danger 색. 바탕은 sunk 라 카드보다 한 단 가라앉아 구분된다 */
  warn: { borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.md },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  warnTitle: { fontSize: type.bodyStrong, fontWeight: '700' },
  warnBody: { fontSize: type.small, lineHeight: leading.body },
});
