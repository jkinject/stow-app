/**
 * 한국어 문자열 — **이 파일이 기준**이다.
 * 영어 사전(`strings.en.ts`)은 `Dict` 타입을 만족해야 하므로, 키를 빠뜨리면
 * 타입 검사가 잡는다. 번역 누락이 런타임에 새지 않는다.
 *
 * 함수형 항목은 수·이름이 문장에 끼어드는 자리다. 한국어와 영어는 어순과 복수형이
 * 달라서 문자열 이어붙이기로는 자연스럽게 만들 수 없다 — 언어별로 문장을 통째로 쓴다.
 */
export const KO = {
  common: {
    cancel: '취소',
    save: '저장',
    saving: '저장 중…',
    delete: '지우기',
    add: '추가',
    close: '닫기',
    back: '뒤로',
    done: '완료',
    edit: '수정',
    retry: '다시 시도',
    home: '홈으로',
    loading: '불러오는 중…',
    empty: '비어 있음',
    tryAgain: '다시 시도해 주세요.',
    notFound: '찾을 수 없습니다',
    clear: '지우기',
    /** 수량 표시. 숫자만 두면 무엇을 세는지 알 수 없다 (사용자 요청 2026-08-31) */
    qty: (n: number) => `${n}개`,
  },

  auth: {
    appName: '어디뒀지',
    tagline: '집 안 물건이 어디 있는지 찾아주는 앱',
    google: '구글로 계속하기',
    or: '또는',
    emailPlaceholder: '이메일 주소',
    magicLink: '메일로 링크 받기',
    /** 첫 화면의 두 번째 버튼 — 누르면 그때 입력칸이 나온다 */
    emailCta: '이메일로 계속하기',
    /* ── 이메일 + 비밀번호 ── */
    password: '비밀번호',
    passwordNew: '비밀번호 (8자 이상)',
    signIn: '로그인',
    signUp: '가입하기',
    toSignUp: '계정이 없나요?  가입하기',
    toSignIn: '이미 계정이 있나요?  로그인',
    orMagic: '비밀번호 없이 메일 링크로 받기',
    /** 가입 후 인증 메일을 보낸 상태 */
    confirmTitle: '메일을 확인해 주세요',
    confirmBody: (email: string) => `${email} 로 인증 링크를 보냈습니다.\n링크를 누르면 가입이 끝납니다.`,
    /* ── 오류 (Supabase 영어 메시지를 우리 말로 ) ── */
    badCredentials: '이메일 또는 비밀번호가 맞지 않습니다.',
    notConfirmed: '아직 메일 인증이 끝나지 않았습니다. 받은편지함의 링크를 눌러 주세요.',
    alreadyRegistered: '이미 가입된 이메일입니다. 로그인해 주세요.',
    passwordTooShort: '비밀번호는 8자 이상이어야 합니다.',
    tooMany: '요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.',
    signInFailed: '로그인하지 못했습니다',
    signUpFailed: '가입하지 못했습니다',
    sentTitle: '메일을 보냈습니다',
    sentBody: (email: string) => `${email} 로 온 링크를 눌러 로그인하세요.`,
    resend: '다른 주소로 다시 보내기',
    googleFailed: '구글 로그인 실패',
    emailInvalid: '이메일을 확인해 주세요',
    emailInvalidBody: '올바른 이메일 주소를 입력해 주세요.',
    sendFailed: '메일 발송 실패',
    signingIn: '로그인 중…',
    /**
     * ⚠ 원인이 두 가지인데 예전 문구는 하나만 말했다. 실제로 겪은 쪽은 두 번째다
     *   (2026-09-01: 다른 기기에서 요청한 링크를 폰에서 열었더니 조용히 실패).
     *     1. 링크가 만료됐거나 이미 썼다
     *     2. **이 기기에서 요청한 링크가 아니다** — PKCE 는 요청한 기기에만
     *        짝이 되는 값을 남기므로, PC 에서 요청하고 폰에서 열면 통하지 않는다
     *   둘 다 짚어 주지 않으면 사용자는 앱이 고장 난 줄 안다.
     */
    linkFailed: '이 링크로는 로그인할 수 없습니다. 만료됐거나 이미 사용했거나, 다른 기기에서 받은 링크일 수 있습니다.',
    linkFailedHint: '이 기기에서 링크를 다시 받아 주세요.',
  },

  onboarding: {
    chooseTitle: '시작해볼까요',
    chooseSub: '새로 만들거나, 가족이 준 초대 코드로 참여하세요.',
    createCta: '우리 집 만들기',
    joinCta: '초대 코드로 참여하기',
    nameTitle: '집 이름',
    nameSub: '나중에 바꿀 수 있습니다.',
    namePlaceholder: '우리집',
    nameDefault: '우리집',
    create: '만들기',
    createFailed: '집을 만들지 못했습니다',
    codeTitle: '초대 코드',
    codeSub: '가족이 보내준 8자리 코드를 입력하세요.',
    join: '참여하기',
    joinFailed: '참여하지 못했습니다',
    joinFailedBody: '코드를 다시 확인해 주세요.',
  },

  tabs: { find: '찾기', places: '보관 장소', shopping: '살 것', more: '더보기' },

  find: {
    searchPlaceholder: '물건 이름 (초성도 됩니다: ㄱㅈㅈ)',
    total: (n: number) => `전체 ${n}건`,
    hits: (n: number) => `${n}건`,
    syncing: '동기화 중…',
    offline: (when: string) => `오프라인 — 마지막 동기화 ${when}`,
    noItems: '아직 등록된 물건이 없습니다',
    // ⚠ 안내를 숨긴 사용자만 본다. 다른 탭으로 보내지 말고 **여기 있는 + 를** 가리킨다
    noItemsHint: '오른쪽 아래 + 를 눌러 첫 물건을 등록해 보세요.',
    noHits: (q: string) => `"${q}" 를 찾지 못했습니다`,
    noHitsHint: '이름 일부나 초성으로 다시 시도해 보세요.',
    allPlaces: '전체',
    addItem: '물건 등록',
    emptyPlace: '이 장소에는 물건이 없습니다',
    emptyPlaceHint: '다른 장소를 골라 보거나, + 버튼으로 물건을 등록하세요.',
    more: (n: number) => `${n}개 더 있습니다`,
  },

  places: {
    title: '어디뒀지',
    section: (n: number) => `보관 장소${n > 0 ? ` · ${n}개` : ''}`,
    addLocation: '+ 장소',
    addFailed: '장소 추가 실패',
    none: '아직 장소가 없습니다',
    noneHint: '물건을 어디에 두는지부터 만들어 보세요.\n"현관 팬트리", "베란다 창고" 같은 이름이면 됩니다.',
    boxes: (n: number) => `박스 ${n}개`,
    // 박스 수와 물건 수를 한 줄에 합친다 — 따로 두면 오른쪽이 비어 슬래브처럼 보인다
    summary: (boxes: number, items: number) =>
      [boxes > 0 ? `박스 ${boxes}개` : null, items > 0 ? `물건 ${items}개` : null]
        .filter(Boolean)
        .join(' · ') || '비어 있음',
    looseOnly: '박스 없이 물건만',
    itemCount: (n: number) => `물건 ${n}개`,
  },

  location: {
    settings: '장소 설정',
    name: '장소 이름',
    namePlaceholder: '예: 현관 팬트리, 베란다 창고',
    note: '메모',
    notePlaceholder: '이 장소에 대해 기억해 둘 것',
    nameRequired: '이름은 비울 수 없습니다.',
    deleteLocation: '이 장소 삭제',
    deleteFailed: '삭제하지 못했습니다',
    deleteLocationTitle: '장소를 삭제할까요?',
    deleteLocationBody: '안이 비어 있어야 삭제됩니다.',
    deleteLocationBlocked: '삭제할 수 없습니다',
    addLooseItem: '박스 없이 이 장소에 물건 등록',
    boxSection: (n: number) => `박스${n > 0 ? ` · ${n}개` : ''}`,
    addBox: '+ 박스',
    boxPlaceholder: '예: 1번 박스, 겨울 리빙박스',
    boxAddHint: '입력 후 엔터를 누르면 계속 추가할 수 있습니다.',
    boxAddFailed: '박스 추가 실패',
    noBoxes: '박스가 없습니다',
    noBoxesHint: '박스를 만들면 QR 코드가 자동으로 발급됩니다.\n박스 없이 물건만 둬도 됩니다.',
    looseSection: (n: number) => `박스 없이 이 장소에 · ${n}개`,
    renameOrNote: '이름·메모 수정',
    itemsInside: (n: number) => `물건 ${n}개가 들어 있습니다.`,
    isEmpty: '비어 있습니다.',
    deleteBoxTitle: '박스를 삭제할까요?',
    deleteBoxWithItems: (n: number, loc: string) =>
      `안의 물건 ${n}개는 사라지지 않고 "${loc}"에 그대로 남습니다.`,
    deleteBoxEmpty: '되돌리려면 휴지통에서 복구할 수 있습니다.',
  },

  container: {
    fallbackTitle: '박스',
    settings: '박스 설정',
    name: '박스 이름',
    namePlaceholder: '예: 3번 박스, 겨울 이불',
    label: '박스 라벨',
    labelHint: '잘라서 박스에 붙이면 스캔으로 내용물을 볼 수 있습니다.',
    printLabel: '이 라벨 인쇄',
    printing: '준비 중…',
    printFailed: '인쇄하지 못했습니다',
    addItem: '이 박스에 물건 등록',
    contents: (n: number) => `내용물${n > 0 ? ` · ${n}개` : ''}`,
    deleteBox: '이 박스 지우기',
    deleteTitle: '이 박스를 지울까요?',
    deleteWithItems: (n: number, loc: string) =>
      `안에 든 물건 ${n}개는 사라지지 않고 "${loc}"에 그대로 남습니다.`,
    deleteEmpty: '비어 있는 박스입니다.',
    deleteFailed: '삭제 실패',
  },

  item: {
    fallbackTitle: '물건',
    gone: '물건을 찾을 수 없습니다',
    goneHint: '삭제되었거나 접근할 수 없는 물건입니다.',
    location: '위치',
    loose: ' · 낱개',
    move: '이동',
    moving: '옮기는 중…',
    moveFailed: '옮기지 못했습니다',
    moveTitle: '어디로 옮길까요?',
    moveHere: '지금 여기',
    moveToLocation: '박스에 넣지 않고 이 장소에 두기',
    noPlaces: '장소가 없습니다',
    noPlacesHint: '먼저 보관 장소를 만들어 주세요.',
    addPhoto: '+ 사진 추가',
    quantity: '수량',
    zeroHint: '다 떨어졌습니다 — 살 것 탭에 올라갑니다',
    category: '카테고리',
    categoryPlaceholder: '예: 생활용품',
    purchaseUrl: '구매 링크',
    note: '메모',
    notePlaceholder: '기억해 둘 것',
    name: '이름',
    namePlaceholder: '물건 이름',
    nameRequired: '이름은 비울 수 없습니다.',
    quantityInvalid: '수량은 0 이상의 숫자여야 합니다.',
    saved: '저장됨',
    savedFailed: '저장하지 못했습니다',
    history: '기록',
    editedBy: (who: string, when: string) => `${who} · ${when} 수정`,
    createdAt: (when: string) => `${when} 등록`,
    /**
     * ⚠ '알 수 없음' 이 아니다. 이름이 안 나오는 이유는 데이터가 깨져서가 아니라
     *   `pr_select` 정책이 **같은 가구 구성원의 프로필만** 보여주기 때문이다.
     *   집을 나갔거나 내보내졌거나 탈퇴한 사람이라 안 보이는 것이다 —
     *   그 사실을 그대로 말해 준다.
     */
    formerMember: '떠난 구성원',
    deleteItem: '이 물건 지우기',
    deleteTitle: '이 물건을 지울까요?',
    deleteBody: (name: string) => `"${name}" 을(를) 목록에서 뺍니다.`,
    deleteFailed: '삭제 실패',
    saveFailed: '저장 실패',
    openBox: '이 박스 열기',
    openLocation: '이 장소 열기',
  },

  add: {
    namePlaceholder: '물건 이름',
    register: '등록',
    registering: '등록 중…',
    noBox: ' · 박스 없이',
    saveFailed: '저장하지 못했습니다',
    queueFull: '연결을 확인해 주세요',
    queueFullBody: (n: number) =>
      `아직 서버에 저장되지 않은 물건이 ${n}개입니다. 연결이 회복되면 자동으로 저장됩니다.`,
    pendingSync: (n: number) => `동기화 대기 ${n}`,
    cameraPermission: '카메라 권한이 필요합니다',
  },

  addFlow: {
    step1Title: '사진 찍기',
    step2Title: '물건 정보',
    skipPhoto: '사진 없이',
    fromGallery: '사진첩',
    retake: '다시 찍기',
    noPhoto: '사진 없음',
    whereTitle: '어디에 둘까요?',
    wherePick: '변경',
    whereNotSet: '아직 안 정함',
    whereRequired: '어디에 둘지 골라 주세요.',
  },
  camera: {
    zoomNone: '줌 없음',
    zoomLevel: (pct: number) => `줌 ${pct}%`,
    preparing: '카메라 준비 중…',
    restart: '카메라 다시 켜기',
    captureFailed: '사진을 찍지 못했습니다',
    captureFailedBody: '카메라를 다시 켜고 있습니다. 잠시 후 다시 눌러 주세요.',
    photo: '사진',
    useThisPhoto: '이 사진으로 저장',
    uploading: '올리는 중…',
    retake: '다시 찍기',
    replaceHint: '새로 찍으면 기존 사진을 대신합니다.',
    firstHint: '셔터를 눌러 사진을 남겨 보세요.',
    removePhoto: '사진 제거',
    permissionNeeded: '카메라 권한이 필요합니다',
    permissionBody: '박스에 붙인 QR 라벨을 읽으려면 카메라를 써야 합니다.',
    grantPermission: '권한 허용하기',
    photoSaveFailed: '사진 저장 실패',
    photoRemoveFailed: '사진 제거 실패',
  },

  scan: {
    guide: '박스에 붙인 QR 라벨을 사각형 안에 맞춰 주세요',
    notOurs: '어디뒀지 QR 이 아닙니다',
    damaged: 'QR 이 손상된 것 같습니다',
    findingBox: '박스 찾는 중',
    opening: '여는 중',
    scanAgain: '다시 스캔',
    unreadable: 'QR 을 읽을 수 없습니다',
    foreignHint: '다른 앱이나 사이트의 QR 인 것 같습니다.',
    damagedHint: '라벨이 손상됐을 수 있습니다. 박스 상세에서 라벨을 다시 인쇄해 주세요.',
    loadFailed: '박스를 불러오지 못했습니다',
    loadFailedHint: '네트워크를 확인하고 다시 시도해 주세요.',
    unregistered: '등록되지 않은 박스입니다',
    unregisteredHint: '이 QR 에 연결된 박스가 없습니다.\n다른 가족의 박스이거나, 삭제된 박스일 수 있습니다.',
  },

  labels: {
    title: '라벨 인쇄',
    intro: 'A4 한 장에 21개까지 인쇄됩니다. 잘라서 박스에 붙이면 스캔으로 내용물을 볼 수 있습니다.',
    selectAll: '전체 선택',
    clear: '선택 해제',
    boxCount: (n: number) => `박스 ${n}개`,
    noBoxes: '박스가 없습니다',
    noBoxesHint: '장소에 박스를 먼저 만들어 주세요.',
    pickSome: '인쇄할 박스를 골라 주세요',
    tally: (n: number, pages: number, left: number) =>
      `${n}개 선택 · A4 ${pages}장` + (left > 0 ? ` · 마지막 장에 ${left}칸 남음` : ' · 딱 맞음'),
    print: '인쇄하기',
    making: '만드는 중…',
    sharePdf: 'PDF 로 저장·공유',
    madePdf: 'PDF 만들었습니다',
    failed: '라벨을 만들지 못했습니다',
  },

  shopping: {
    title: '살 것',
    none: '살 것이 없습니다',
    noneHint: '물건의 수량이 0 이 되면\n여기에 자동으로 올라옵니다.',
    autoSection: (n: number) => `떨어졌습니다 · ${n}`,
    manualSection: (n: number) => `직접 담은 것 · ${n}`,
    remaining: (q: number) => `${q}개 남음`,
    outOfStock: '재고 없음',
    buy: '사러 가기',
    noLink: '구매 링크 없음 — 물건 수정에서 넣어 두면 여기서 바로 열립니다',
    removeFromList: '빼기',
    footNote: '사 오신 뒤 물건을 눌러 수량을 올리면 목록에서 빠집니다.',
    linkFailed: '링크를 열 수 없습니다',
  },

  more: {
    title: '더보기',
    profile: '내 정보',
    household: '우리 집',
    role: (r: string): string => (r === 'owner' ? '관리자' : '구성원'),
    memberSince: (when: string) => `${when}부터`,
    theme: '테마',
    themeSystem: '시스템 기본',
    themeLight: '라이트',
    themeDark: '다크',
    language: '언어',
    langSystem: '시스템 설정',
    langKo: '한국어',
    langEn: 'English',
    langHint: '시스템 설정을 고르면 기기 언어를 따라갑니다.',
    boxLabels: '박스 라벨',
    printLabels: '박스 라벨 인쇄',
    printHint: 'A4 한 장에 21개까지. 잘라서 박스에 붙이면 스캔으로 내용물을 볼 수 있습니다.',
    family: '가족',
    familyValue: (n: number) => `${n}명`,
    trash: '휴지통',
    trashHint: '지운 물건·박스·장소를 30일 안에 되돌릴 수 있습니다.',
    account: '계정',
    signOut: '로그아웃',
  },

  family: {
    title: '가족',
    houseName: '집 이름',
    renameFailed: '이름을 바꾸지 못했습니다',
    members: '구성원',
    memberCount: (n: number) => `${n}명`,
    me: '나',
    joined: (when: string) => `${when} 참여`,
    promote: '관리자로 지정',
    demote: '관리자 해제',
    promoteTitle: (name: string) => `${name} 님을 관리자로 지정할까요?`,
    promoteBody: '관리자는 가족을 초대하고 내보낼 수 있습니다.',
    demoteTitle: (name: string) => `${name} 님의 관리자 권한을 해제할까요?`,
    demoteBody: '초대와 내보내기를 더 이상 할 수 없게 됩니다.',
    roleFailed: '역할을 바꾸지 못했습니다',
    remove: '내보내기',
    removeTitle: (name: string) => `${name} 님을 내보낼까요?`,
    removeBody: '이 집의 물건을 더 이상 볼 수 없게 됩니다. 그동안 등록한 물건은 그대로 남습니다.',
    removeFailed: '내보내지 못했습니다',
    invite: '초대 코드',
    inviteHint: '이 코드를 가족에게 알려 주면 우리 집에 들어옵니다. 만료되지 않습니다.',
    inviteCopy: '코드 복사',
    inviteCopied: '복사했습니다',
    rotate: '코드 바꾸기',
    rotateTitle: '새 코드로 바꿀까요?',
    rotateBody: '지금까지 알려 준 코드는 모두 쓸 수 없게 됩니다. 아직 안 들어온 가족이 있으면 새 코드를 다시 보내야 합니다.',
    rotateConfirm: '바꾸기',
    rotateFailed: '코드를 바꾸지 못했습니다',
    // 영구 코드라서 필요한 안내다. 내보내도 코드가 살아 있으면 그대로 다시 들어온다.
    afterRemoveTitle: '코드도 바꿀까요?',
    afterRemoveBody: (name: string) =>
      `${name} 님이 초대 코드를 알고 있으면 그 코드로 다시 들어올 수 있습니다. 지금 코드를 바꾸면 막을 수 있습니다.`,
    afterRemoveKeep: '그대로 두기',
    leave: '이 집에서 나가기',
    leaveTitle: (house: string) => `"${house}" 에서 나갈까요?`,
    leaveBody: '이 집의 물건을 더 이상 볼 수 없게 됩니다. 다시 들어오려면 초대 코드가 필요합니다.',
    leaveBlocked: '마지막 관리자는 나갈 수 없습니다',
    leaveBlockedHint: '다른 구성원을 관리자로 지정한 뒤에 나갈 수 있습니다.',
    leaveFailed: '나가지 못했습니다',
  },

  deleteAccount: {
    title: '탈퇴하기',
    // 무엇이 사라지는지 **세어서** 보여준다. "정말 삭제하시겠습니까?" 만으로는
    // 집이 통째로 없어진다는 걸 알 수 없다.
    confirmTitle: '정말 탈퇴할까요?',
    summaryDoomed: (n: number) => `혼자 쓰던 집 ${n}곳이 물건·사진과 함께 완전히 사라집니다.`,
    summaryLeaving: (n: number) => `가족이 있는 집 ${n}곳에서는 나가기만 합니다. 그 집의 물건은 남습니다.`,
    summaryHandover: '내가 관리자인 집은 다른 가족에게 관리자가 넘어갑니다.',
    irreversible: '되돌릴 수 없습니다.',
    confirm: '탈퇴',
    failed: '탈퇴하지 못했습니다',
    checking: '확인 중…',
    working: '탈퇴 처리 중…',
  },

  about: {
    section: '앱 정보',
    version: '버전',
    // 눌러서 진단 정보를 복사한다 — 문제를 알려 줄 때 이 값들이 있어야 원인을 좁힐 수 있다
    copyDiagnostics: '진단 정보를 복사했습니다',
    updateEmbedded: '내장 번들',
    updateApplied: (when: string) => `${when} 업데이트 적용됨`,
  },

  licenses: {
    title: '오픈소스 라이선스',
    entry: (n: number) => `${n}개`,
    intro: (n: number) =>
      `이 앱은 오픈소스 소프트웨어 ${n}개를 사용합니다. 각 항목을 누르면 원본 저장소가 열립니다.`,
  },

  photo: {
    change: '사진 바꾸기',
    remove: '사진 제거',
    removeTitle: '사진을 지울까요?',
    // 되돌릴 수 없다는 사실을 분명히 적는다 — '정말요?' 만으로는 무게가 전달되지 않는다
    removeBody: '지운 사진은 되돌릴 수 없습니다. 다시 넣으려면 새로 찍거나 사진첩에서 골라야 합니다.',
    zoomHint: '두 손가락으로 확대 · 두 번 두드리면 원래대로',
  },

  /** 첫 실행 안내 (2026-09-01) */
  starter: {
    title: '어디뒀지 시작하기',
    progress: (done: number, total: number) => `${done}/${total}`,
    step1: '보관 장소 만들기',
    step1Hint: '안방·주방·창고 같은 곳',
    step2: '물건 하나 등록하기',
    step2Hint: '사진 찍고 이름만 넣으면 끝',
    step3: '검색해서 찾아보기',
    step3Hint: '초성으로도 찾아집니다',
    step4: '카테고리 만들기',
    step4Hint: '약·공구·아이 물건처럼 묶어두면 찾기 쉬워집니다',
    open: '열기',
    hide: '안내 숨기기',
    /** 3단계를 다 끝냈을 때 잠깐 뜨는 마무리 */
    doneTitle: '준비 끝났습니다',
    doneHint: '이제 집에 있는 것들을 담아 보세요.',
    /** 다 끝냈을 때 카드를 닫는 버튼. '숨기기' 가 아니다 — 끝냈으니 닫는 것이다 */
    finish: '시작하기',
  },

  /** 장소 만들기 시트 — 체크리스트·보관장소 탭·등록 화면이 **같은 것**을 쓴다 */
  locSheet: {
    title: '보관 장소 만들기',
    /**
     * ⚠ '눌러서 바로 추가하세요' 였다. 그런데 칩이 토글처럼 생긴 데다 상단에 '완료'
     *   가 있어서 **고른 뒤 완료를 눌러야 저장되는 화면으로 읽혔다**(사용자 보고
     *   2026-09-01). 보이는 대로 동작하게 고쳤으니 문구도 그렇게 바꾼다.
     */
    suggestHint: '고른 뒤 완료를 누르세요',
    /**
     * ⚠ 번역하지 말고 **그 나라 집 구조로 다시 쓸 것.** 한국 집의 방 이름이
     *   영어권 집에서 그대로 통하지 않는다 (베란다 → 그런 공간이 없다).
     */
    suggestions: ['안방', '주방', '거실', '창고', '베란다', '욕실', '현관', '작은방', '옷방', '냉장고'],
    manualHint: '또는 직접 입력',
    placeholder: '장소 이름',
    /** 직접 입력한 이름을 **고른 목록에 담는다** — 아직 저장이 아니다 */
    stage: '담기',
    existing: '이미 있는 곳',
    picked: (n: number) => `고른 곳 · ${n}곳`,
    done: '완료',
    /** 담아 둔 게 있을 때는 완료가 곧 저장이다 — 몇 개가 저장되는지 밝힌다 */
    saveN: (n: number) => `${n}곳 추가`,
    saving: '추가하는 중…',
    addFailed: (names: string) => `추가하지 못했습니다: ${names}`,
    discardTitle: '고른 곳을 버릴까요?',
    discardBody: (n: number) => `아직 저장하지 않은 ${n}곳이 사라집니다.`,
    discard: '버리기',
  },

  history: {
    title: '변경 이력',
    none: '기록이 없습니다',
    noneHint: '이름·수량·위치를 바꾸면 여기에 남습니다.',
    created: '등록',
    updated: '수정',
    moved: '이동',
    qty_changed: '수량 변경',
    deleted: '삭제',
    restored: '복구',
    by: (who: string) => `${who}`,
  },
  trash: {
    title: '휴지통',
    section: (n: number) => `지운 항목 · ${n}개`,
    none: '휴지통이 비어 있습니다',
    noneHint: '지운 것은 30일 동안 여기 남습니다.',
    hint: '지운 것은 30일 뒤 완전히 사라집니다.',
    restore: '복구',
    restoring: '복구 중…',
    kindItem: '물건',
    kindContainer: '박스',
    kindLocation: '장소',
    deletedAt: (when: string) => `${when} 삭제`,
    restoreFailed: '복구 실패',
    boxRestoreNote: '박스를 복구해도 안에 있던 물건은 장소에 그대로 남아 있습니다. 다시 넣어 주세요.',
  },
  category: {
    title: '카테고리',
    manage: '카테고리 관리',
    // ⚠ 예전엔 개수만 '6' 이라고 떴다. 무엇을 세는지 알 수 없어 다른 화면과 형태를 맞춘다
    section: (n: number) => `카테고리 · ${n}개`,
    manageHint: '물건을 분류할 카테고리를 만들고 정리합니다.',
    add: '카테고리 추가',
    namePlaceholder: '예: 여행용품, 화장품, 파티용품',
    none: '카테고리가 없습니다',
    noneHint: '"여행용품", "화장품" 처럼\n물건을 묶을 이름을 만들어 보세요.',
    itemCount: (n: number) => (n > 0 ? `연결된 물건 ${n}개` : '연결된 물건 없음'),
    duplicate: '같은 이름이 이미 있습니다',
    addFailed: '카테고리를 만들지 못했습니다',
    renameFailed: '이름을 바꾸지 못했습니다',
    deleteFailed: '지우지 못했습니다',
    /**
     * ⚠ 이름을 **제목에** 넣는다. 목록에 카테고리가 여럿이면 "이 카테고리" 만으로는
     *   어느 것을 지우려는지 확신할 수 없다.
     */
    deleteTitle: (name: string) => `'${name}' 카테고리를 삭제할까요?`,
    /**
     * ⚠ 연결된 물건이 없으면 **본문을 아예 띄우지 않는다**(사용자 보고 2026-09-01).
     *   예전엔 "쓰는 물건이 없습니다." 를 띄웠는데, 확인창의 본문은 원래
     *   *지우면 무슨 일이 생기는지* 를 적는 자리다. 거기에 "아무 일도 안 생긴다" 는
     *   뜻의 문장을 넣으니 무엇을 묻는 건지 오히려 헷갈렸다.
     */
    deleteBodyUsed: (n: number) =>
      `연결된 물건 ${n}개가 있습니다.\n물건은 사라지지 않고 분류만 비워집니다.`,
    pickTitle: '카테고리 고르기',
    pickNone: '분류 없음',
    empty: '없음',
    goManage: '카테고리를 먼저 만들어 주세요',
  },
  time: {
    justNow: '방금',
    minutesAgo: (n: number) => `${n}분 전`,
    hoursAgo: (n: number) => `${n}시간 전`,
    daysAgo: (n: number) => `${n}일 전`,
    date: (y: number, m: number, d: number) => `${y}. ${m}. ${d}.`,
    monthDay: (m: number, d: number) => `${m}월 ${d}일`,
    noRecord: '기록 없음',
  },
};

/**
 * ⚠ `as const` 를 쓰지 않는다. 붙이면 값이 리터럴 타입("취소")으로 굳어서
 *   영어 사전이 그 타입을 만족할 수 없다. 지금 형태여야 키 구조와 함수 시그니처만
 *   강제하고 문자열 내용은 자유로워진다.
 */
export type Dict = typeof KO;
