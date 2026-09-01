import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChoiceSheet, type Choice } from '@/components/ChoiceSheet';
import { IconUsers } from '@/components/Icon';
import { Button, Field, Loading, Screen, SectionLabel } from '@/components/ui';
import {
  useInvite,
  useLeaveHousehold,
  useMembers,
  useRemoveMember,
  useRenameHousehold,
  useRotateInvite,
  useSetMemberRole,
  type Member,
} from '@/features/household/api';
import { useHousehold } from '@/features/household/context';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { radius, space, type, useTheme } from '@/lib/theme';

/**
 * 가족 관리.
 *
 * 전에는 더보기의 "가족 초대 코드 발급" 한 줄이 전부였고, 그 줄은 누르는 즉시 코드를
 * 만들어 `Alert` 로 한 번 보여주고 끝이었다. 그래서:
 *   · 창을 닫으면 코드를 다시 볼 방법이 없었다 (복사 수단도 없었다)
 *   · 여러 번 누르면 유효한 코드가 그만큼 쌓였고, 회수할 수 없었다
 *   · 누가 우리 집에 있는지 앱 어디에서도 볼 수 없었다
 *
 * ⚠ 정작 DB 쪽 권한은 처음부터 다 열려 있었다 — `hm_delete`(내보내기·탈퇴),
 *   `ho_update`(집 이름) 정책이 있는데 부르는 코드가 하나도 없었다.
 *   이 화면이 그 정책들의 유일한 호출처다.
 *
 * 초대는 이제 **가구당 한 장, 만료 없음**이다. 목록도 유효기간도 없다.
 */
export default function FamilyScreen() {
  const { c } = useTheme();
  const t = useT();
  const { session } = useAuth();
  const { active, activeId } = useHousehold();

  const myId = session?.user.id ?? null;
  const isOwner = active?.role === 'owner';

  const members = useMembers(activeId);
  const invite = useInvite(activeId);
  const leave = useLeaveHousehold();

  const rows = members.data ?? [];
  const ownerCount = rows.filter((m) => m.role === 'owner').length;
  // 마지막 관리자는 나갈 수 없다 — 서버의 t06_last_owner_guard 와 같은 판정이다.
  // 화면에서 먼저 막는 이유는 거부당하고 나서 이유를 읽는 것보다 낫기 때문이지,
  // 화면이 최종 판정이어서가 아니다.
  const lastOwner = isOwner && ownerCount === 1;

  function onLeave() {
    if (!activeId || !active) return;
    Alert.alert(t.family.leaveTitle(active.name), t.family.leaveBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.family.leave,
        style: 'destructive',
        onPress: async () => {
          try {
            await leave.mutateAsync(activeId);
            // 화면을 직접 옮기지 않는다 — 가구 목록이 비면 _layout 가드가 온보딩으로
            // 보내고, 남은 가구가 있으면 컨텍스트가 첫 가구로 넘어간다.
          } catch (e) {
            Alert.alert(t.family.leaveFailed, msg(e, t.common.tryAgain));
          }
        },
      },
    ]);
  }

  return (
    <Screen back title={t.family.title}>
      <View style={st.body}>
        <HouseCard
          householdId={activeId}
          name={active?.name ?? ''}
          canRename={isOwner}
          memberCount={rows.length}
        />

        <View style={st.section}>
          <SectionLabel>{t.family.members}</SectionLabel>
          {members.isLoading ? (
            <Loading />
          ) : (
            <View style={[st.card, { backgroundColor: c.card }]}>
              {rows.map((m, i) => (
                <MemberRow
                  key={m.userId}
                  householdId={activeId}
                  member={m}
                  isMe={m.userId === myId}
                  viewerIsOwner={!!isOwner}
                  ownerCount={ownerCount}
                  first={i === 0}
                />
              ))}
            </View>
          )}
        </View>

        {/* 코드는 가구당 한 장이라 목록이 없다. 보기는 구성원 누구나 —
            우리 집 코드를 가족에게 보내는 데 관리자일 필요는 없다.
            바꾸기만 관리자다: 바꾸는 순간 남이 가진 코드가 전부 죽는다. */}
        <View style={st.section}>
          <SectionLabel>{t.family.invite}</SectionLabel>
          {invite.isLoading ? (
            <Loading />
          ) : (
            <InviteCard
              householdId={activeId}
              code={invite.data?.code ?? null}
              canRotate={!!isOwner}
            />
          )}
        </View>

        <View style={st.section}>
          <Button
            label={t.family.leave}
            variant="danger"
            onPress={onLeave}
            busy={leave.isPending}
            disabled={lastOwner}
          />
          {lastOwner && (
            <Text style={[st.hint, { color: c.textFaint }]}>
              {t.family.leaveBlocked} — {t.family.leaveBlockedHint}
            </Text>
          )}
        </View>
      </View>
    </Screen>
  );
}

/** 집 이름 + 구성원 수. 관리자는 이름을 그 자리에서 고친다 (카테고리 화면과 같은 방식) */
function HouseCard({
  householdId,
  name,
  canRename,
  memberCount,
}: {
  householdId: string | null;
  name: string;
  canRename: boolean;
  memberCount: number;
}) {
  const { c } = useTheme();
  const t = useT();
  const rename = useRenameHousehold();
  const [draft, setDraft] = useState(name);
  const [synced, setSynced] = useState(name);

  /**
   * ⚠ `if (!editing && draft !== name) setDraft(name)` 로 쓰면 안 된다.
   *   저장은 포커스가 빠질 때 일어나므로 `editing` 이 먼저 false 가 되고, 그 시점의
   *   `name` 은 아직 **옛 이름**이다. 그래서 방금 친 이름이 옛 이름으로 한 번
   *   되돌아갔다가 서버 응답이 오면 다시 새 이름으로 바뀐다 — 눈에 보이는 깜빡임이다.
   *
   *   판단 기준은 "지금 편집 중인가" 가 아니라 **"서버 값이 바뀌었는가"** 다.
   *   바뀌었을 때만 따라간다. 그러면 저장 중에는 아무 일도 일어나지 않는다.
   */
  if (name !== synced) {
    setSynced(name);
    setDraft(name);
  }

  async function commit() {
    const next = draft.trim();
    if (!next || next === name.trim() || !householdId) {
      if (!next) setDraft(name); // 이름 없는 집은 없다
      return;
    }
    try {
      await rename.mutateAsync({ id: householdId, name: next });
    } catch (e) {
      setDraft(name); // 실패하면 서버가 아는 이름으로 되돌린다
      Alert.alert(t.family.renameFailed, msg(e, t.common.tryAgain));
    }
  }

  return (
    <View style={[st.house, { backgroundColor: c.card }]}>
      <Text style={[st.label, { color: c.textFaint }]}>{t.family.houseName}</Text>
      {canRename ? (
        <Field
          value={draft}
          onChangeText={setDraft}
          onBlur={() => void commit()}
          returnKeyType="done"
        />
      ) : (
        <Text style={[st.houseName, { color: c.text }]} numberOfLines={2}>
          {name}
        </Text>
      )}
      <View style={st.houseMeta}>
        <IconUsers color={c.textFaint} size={16} />
        <Text style={[st.hint, { color: c.textFaint }]}>{t.family.memberCount(memberCount)}</Text>
      </View>
    </View>
  );
}

/** 구성원 한 줄. 관리자에게만 오른쪽에 ⋯ 가 붙는다 */
function MemberRow({
  householdId,
  member,
  isMe,
  viewerIsOwner,
  ownerCount,
  first,
}: {
  householdId: string | null;
  member: Member;
  isMe: boolean;
  viewerIsOwner: boolean;
  ownerCount: number;
  first: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  const setRole = useSetMemberRole(householdId);
  const remove = useRemoveMember(householdId);
  const rotate = useRotateInvite(householdId);
  const [menu, setMenu] = useState(false);

  const isOwnerRow = member.role === 'owner';
  // 마지막 관리자는 강등도 막는다 — 나가기를 막는 것과 같은 이유다
  const canDemote = isOwnerRow && ownerCount > 1;
  // 자기 자신은 내보내지 않는다. 나가는 것은 아래의 "이 집에서 나가기" 다.
  const canRemove = !isMe;

  const options: Choice[] = [];
  if (!isOwnerRow) options.push({ key: 'promote', label: t.family.promote });
  else if (canDemote) options.push({ key: 'demote', label: t.family.demote });
  if (canRemove) options.push({ key: 'remove', label: t.family.remove, danger: true });

  const showMenu = viewerIsOwner && options.length > 0;

  function onPick(key: string) {
    setMenu(false);
    if (key === 'remove') return confirmRemove();
    const next = key === 'promote' ? 'owner' : 'member';
    Alert.alert(
      key === 'promote' ? t.family.promoteTitle(member.name) : t.family.demoteTitle(member.name),
      key === 'promote' ? t.family.promoteBody : t.family.demoteBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.done,
          onPress: async () => {
            try {
              await setRole.mutateAsync({ userId: member.userId, role: next });
            } catch (e) {
              Alert.alert(t.family.roleFailed, msg(e, t.common.tryAgain));
            }
          },
        },
      ],
    );
  }

  function confirmRemove() {
    Alert.alert(t.family.removeTitle(member.name), t.family.removeBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.family.remove,
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(member.userId);
          } catch (e) {
            Alert.alert(t.family.removeFailed, msg(e, t.common.tryAgain));
            return;
          }
          // ⚠ 내보내는 것만으로는 끝이 아니다. 코드가 만료되지 않으므로 그 사람이
          //   코드를 기억하고 있으면 곧바로 다시 들어온다. 여기서 묻지 않으면
          //   대부분은 그 사실을 모른 채 "내보냈다" 고 믿는다.
          Alert.alert(t.family.afterRemoveTitle, t.family.afterRemoveBody(member.name), [
            { text: t.family.afterRemoveKeep, style: 'cancel' },
            {
              text: t.family.rotateConfirm,
              onPress: async () => {
                try {
                  await rotate.mutateAsync();
                } catch (e) {
                  Alert.alert(t.family.rotateFailed, msg(e, t.common.tryAgain));
                }
              },
            },
          ]);
        },
      },
    ]);
  }

  return (
    <>
      <View
        style={[
          st.member,
          !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        ]}
      >
        <View style={[st.avatar, { backgroundColor: c.sunk }]}>
          <Text style={[st.avatarText, { color: c.textMuted }]}>
            {member.name.slice(0, 1) || '?'}
          </Text>
        </View>

        <View style={st.memberMain}>
          <View style={st.nameRow}>
            <Text style={[st.memberName, { color: c.text }]} numberOfLines={1}>
              {member.name}
            </Text>
            {isMe && <Text style={[st.me, { color: c.textFaint }]}>{t.family.me}</Text>}
          </View>
          <Text style={[st.hint, { color: c.textFaint }]} numberOfLines={1}>
            {t.family.joined(formatDate(member.joinedAt))}
          </Text>
        </View>

        <View
          style={[
            st.badge,
            isOwnerRow
              ? { backgroundColor: c.accent, borderColor: c.accent }
              : { backgroundColor: 'transparent', borderColor: c.border },
          ]}
        >
          <Text style={[st.badgeText, { color: isOwnerRow ? c.onAccent : c.textMuted }]}>
            {t.more.role(member.role)}
          </Text>
        </View>

        {showMenu && (
          <Pressable onPress={() => setMenu(true)} hitSlop={12} style={st.dots}>
            <Text style={[st.dotsText, { color: c.textMuted }]}>⋯</Text>
          </Pressable>
        )}
      </View>

      {menu && (
        <ChoiceSheet
          title={member.name}
          options={options}
          onPick={onPick}
          onClose={() => setMenu(false)}
        />
      )}
    </>
  );
}

/**
 * 우리 집 초대 코드 한 장.
 *
 * ⚠ 만료가 없다는 것은 **스스로 죽지 않는다**는 뜻이다. 내보낸 사람이 코드를 기억하고
 *   있으면 그대로 다시 들어온다. 그래서 "코드 바꾸기" 가 이 화면에서 유일한 회수
 *   수단이고, 안내 문구도 그렇게 읽히게 썼다.
 */
function InviteCard({
  householdId,
  code,
  canRotate,
}: {
  householdId: string | null;
  code: string | null;
  canRotate: boolean;
}) {
  const { c } = useTheme();
  const t = useT();
  const rotate = useRotateInvite(householdId);

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 화면을 떠난 뒤 타이머가 살아 있으면 사라진 컴포넌트에 setState 한다
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function onCopy() {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    /**
     * 알림창을 띄우지 않는다. 복사는 성공이 당연한 동작이라, 확인을 누르게 만들면
     * 매번 한 번 더 손이 간다. 버튼 글자만 잠깐 "복사됨" 으로 바꿔 알린다.
     */
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }

  function onRotate() {
    Alert.alert(t.family.rotateTitle, t.family.rotateBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.family.rotateConfirm,
        style: 'destructive',
        onPress: async () => {
          try {
            await rotate.mutateAsync();
          } catch (e) {
            Alert.alert(t.family.rotateFailed, msg(e, t.common.tryAgain));
          }
        },
      },
    ]);
  }

  return (
    <View style={[st.invite, { backgroundColor: c.card }]}>
      {/* 글자 사이를 벌린다 — 8자리를 눈으로 옮겨 적을 때 한 글자씩 짚어야 한다 */}
      <Text style={[st.code, { color: code ? c.text : c.textFaint }]} selectable={!!code}>
        {code ?? '········'}
      </Text>
      <Text style={[st.hint, { color: c.textFaint }]}>{t.family.inviteHint}</Text>

      <View style={st.inviteFoot}>
        <Pressable onPress={() => void onCopy()} hitSlop={8} disabled={!code} style={st.linkBtn}>
          <Text
            style={[st.link, { color: !code ? c.textFaint : copied ? c.ok : c.accentText }]}
          >
            {copied ? t.family.inviteCopied : t.family.inviteCopy}
          </Text>
        </Pressable>
        {canRotate && (
          <Pressable onPress={onRotate} hitSlop={8} disabled={rotate.isPending} style={st.linkBtn}>
            <Text style={[st.link, { color: c.danger }]}>
              {rotate.isPending ? t.common.saving : t.family.rotate}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function msg(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}

const st = StyleSheet.create({
  body: { paddingHorizontal: space.xl, gap: space.xxl, paddingTop: space.xs },
  section: { gap: space.sm },
  card: { borderRadius: radius.md, overflow: 'hidden' },
  list: { gap: space.sm },

  house: { borderRadius: radius.md, padding: space.lg, gap: space.sm },
  houseName: { fontSize: type.title, fontWeight: '700' },
  houseMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: type.tiny, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },

  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: type.bodyStrong, fontWeight: '700' },
  memberMain: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: type.bodyStrong, fontWeight: '600', flexShrink: 1 },
  me: { fontSize: type.caption },
  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: type.tiny, fontWeight: '700' },
  dots: { paddingHorizontal: 2 },
  dotsText: { fontSize: type.h2, fontWeight: '700', lineHeight: 22 },

  newBtn: { minWidth: 118 },
  invite: { borderRadius: radius.md, padding: space.lg, gap: space.md },
  code: { fontSize: type.h2, fontWeight: '700', letterSpacing: 4 },
  inviteFoot: { flexDirection: 'row', alignItems: 'center', gap: space.xxl },
  linkBtn: { paddingVertical: 2 },
  link: { fontSize: type.label, fontWeight: '600' },

  hint: { fontSize: type.caption },
});
