import { BottomSheet, SheetOption } from '@/components/Sheet';

/**
 * 아래에서 올라와 값 하나를 고르는 시트.
 *
 * 원래 더보기 화면 안에만 있었다. 가족 화면에서도 같은 것이 필요해졌을 때
 * 복사해 두면 언젠가 한쪽만 고쳐져 갈라진다 — 카메라 화면에서 실제로 그렇게 됐다.
 * 처음부터 한 벌로 꺼낸다.
 *
 * 버튼 3개짜리 `Alert` 로 대신하지 않는 이유: 안드로이드는 버튼을
 * neutral/negative/positive 자리에 배치해 **적은 순서와 보이는 순서가 달라진다.**
 *
 * ⚠ 껍데기(배경·모서리·머리말)와 줄은 `components/Sheet` 로 옮겼다 (2026-09-06).
 *   같은 껍데기가 세 곳에 각자 적혀 있었고 셋 다 척도 밖의 모서리(18)를 쓰고 있었다.
 *   이 파일에 남은 것은 **"고르기" 라는 뜻**뿐이다.
 */
export type Choice = {
  key: string;
  label: string;
  /** 체크 표시 — 값을 고르는 용도일 때만 쓴다 */
  on?: boolean;
  /** 되돌리기 어려운 동작 (내보내기 등) */
  danger?: boolean;
};

export function ChoiceSheet({
  title,
  options,
  onPick,
  onClose,
}: {
  title: string;
  options: Choice[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet label={title} onClose={onClose}>
      {options.map((o, i) => (
        <SheetOption
          key={o.key}
          label={o.label}
          on={o.on}
          danger={o.danger}
          divider={i > 0}
          onPress={() => onPick(o.key)}
        />
      ))}
    </BottomSheet>
  );
}
